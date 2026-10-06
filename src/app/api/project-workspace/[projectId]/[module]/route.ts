import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCaller, getOrgContext } from "@/lib/access-control";

/**
 * Generic workspace module route — one handler for all 14 modules instead of
 * 14 near-identical files, since none of them have any existing backend or
 * bespoke UI to preserve (confirmed by audit: the frontend "Project
 * Workspace" was mock state only). Enforcement is the real requirement here,
 * not per-module UI, so it lives once, centrally, instead of copy-pasted.
 *
 * Access rule:
 *  - admin: full edit access to every module.
 *  - the owning corporate / owning NGO (their own top-level login): full
 *    edit access to every module in their project.
 *  - corporate_employee / ngo_member ("ngo_worker" in project_module_permissions):
 *    ONLY the modules they have an explicit row for, at the granted
 *    permission (read vs edit). No row = 403, not just hidden from nav.
 *  - a workspace that doesn't exist yet (project not activated) = 403 for
 *    everyone except admin, regardless of role — this is the pre-signed gate.
 */

// Most of the 14 module tables use `created_by` for the inserting actor, but
// a few use a differently-named column (or none at all) — verified against
// scripts/ngo-discovery/phase5-workspace-schema.sql. Inserting `created_by`
// unconditionally 500s on those tables ("column not found in schema cache"),
// so the actor column is looked up per module instead.
const MODULE_ACTOR_COLUMN: Record<string, string | null> = {
  campaigns: "created_by",
  funds: "released_by",
  ngo_collaboration: "created_by",
  audits: "created_by",
  reports: "created_by",
  documents: "uploaded_by",
  milestones: "created_by",
  tasks: "created_by",
  timeline: "created_by",
  meetings: "created_by",
  messages: null, // workspace_messages uses sender_user_id + a required sender_type, set below
  approvals: "created_by",
  budget_tracking: "created_by",
  monitoring_evaluation: "created_by",
};

const MODULE_TABLES: Record<string, string> = {
  campaigns: "campaigns",
  funds: "funds",
  ngo_collaboration: "ngo_collaboration_notes",
  audits: "audits",
  reports: "workspace_reports",
  documents: "workspace_documents",
  milestones: "milestones",
  tasks: "tasks",
  timeline: "project_timeline",
  meetings: "meetings",
  messages: "workspace_messages",
  approvals: "approvals",
  budget_tracking: "budget_tracking",
  monitoring_evaluation: "monitoring_evaluation",
};

async function resolveAccess(request: Request, projectId: string, module: string) {
  const user = await getCaller(request);
  if (!user) return { error: "Unauthorized.", status: 401 } as const;

  const context = await getOrgContext(user);
  if (!context) return { error: "Unsupported account type.", status: 403 } as const;

  const { data: workspace, error: wsError } = await supabaseAdmin
    .from("project_workspaces")
    .select("id, opportunity_id, corporate_id, ngo_id")
    .eq("opportunity_id", projectId)
    .maybeSingle();

  if (wsError || !workspace) {
    return { error: "This project's workspace has not been unlocked yet.", status: 403 } as const;
  }

  if (context.accountType === "admin") {
    return { ok: true, user, context, workspace, permission: "edit" as const };
  }

  if (context.accountType === "corporate" && context.orgId === workspace.corporate_id) {
    return { ok: true, user, context, workspace, permission: "edit" as const };
  }

  if (context.accountType === "ngo" && context.orgId === workspace.ngo_id) {
    return { ok: true, user, context, workspace, permission: "edit" as const };
  }

  const assigneeType =
    context.accountType === "corporate_employee" ? "corporate_employee"
    : context.accountType === "ngo_member" ? "ngo_worker"
    : null;

  if (!assigneeType) {
    return { error: "Access denied.", status: 403 } as const;
  }

  const { data: grant } = await supabaseAdmin
    .from("project_module_permissions")
    .select("permission")
    .eq("project_id", projectId)
    .eq("assignee_type", assigneeType)
    .eq("assignee_id", user.id)
    .eq("module", module)
    .maybeSingle();

  if (!grant) {
    return { error: `Access denied. You have not been granted access to the "${module}" module on this project.`, status: 403 } as const;
  }

  return { ok: true, user, context, workspace, permission: grant.permission as "read" | "edit" };
}

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string; module: string }> }) {
  const { projectId, module } = await params;
  const table = MODULE_TABLES[module];
  if (!table) return NextResponse.json({ error: `Unknown workspace module "${module}".` }, { status: 400 });

  const access = await resolveAccess(request, projectId, module);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });

  const { data, error } = await supabaseAdmin
    .from(table)
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ module, permission: access.permission, items: data });
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string; module: string }> }) {
  const { projectId, module } = await params;
  const table = MODULE_TABLES[module];
  if (!table) return NextResponse.json({ error: `Unknown workspace module "${module}".` }, { status: 400 });

  const access = await resolveAccess(request, projectId, module);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });

  if (access.permission !== "edit") {
    return NextResponse.json({ error: `You have read-only access to the "${module}" module.` }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const record: Record<string, unknown> = { ...body, project_id: projectId };
  const actorColumn = MODULE_ACTOR_COLUMN[module];
  if (actorColumn) {
    record[actorColumn] = access.user.id;
  } else if (module === "messages") {
    record.sender_user_id = access.user.id;
    if (!record.sender_type) {
      record.sender_type = access.context.accountType === "corporate" || access.context.accountType === "corporate_employee" ? "corporate" : "ngo";
    }
  }

  const { data, error } = await supabaseAdmin
    .from(table)
    .insert(record)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const actorType = access.context.accountType === "ngo_member" ? "ngo_worker" : access.context.accountType;
  const { error: logError } = await supabaseAdmin.from("activity_logs").insert({
    project_id: projectId,
    module,
    action: "created",
    actor_type: actorType,
    actor_id: access.user.id,
    detail: { record_id: data.id },
  });
  if (logError) console.error("activity_logs insert failed:", logError.message);

  return NextResponse.json({ item: data });
}
