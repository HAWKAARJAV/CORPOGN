import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  MODULE_ACTOR_COLUMN,
  MODULE_TABLES,
  PATCHABLE_FIELDS,
  resolveProjectWorkspaceAccess,
} from "@/lib/server/project-workspace-access";

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

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string; module: string }> }) {
  const { projectId, module } = await params;
  const table = MODULE_TABLES[module];
  if (!table) return NextResponse.json({ error: `Unknown workspace module "${module}".` }, { status: 400 });

  const access = await resolveProjectWorkspaceAccess(request, projectId, module);
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

  const access = await resolveProjectWorkspaceAccess(request, projectId, module);
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

export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string; module: string }> }) {
  const { projectId, module } = await params;
  const table = MODULE_TABLES[module];
  if (!table) return NextResponse.json({ error: `Unknown workspace module "${module}".` }, { status: 400 });

  const access = await resolveProjectWorkspaceAccess(request, projectId, module);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });

  if (access.permission !== "edit") {
    return NextResponse.json({ error: `You have read-only access to the "${module}" module.` }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = body.id;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  const allowed = PATCHABLE_FIELDS[module];
  if (!allowed?.length) {
    return NextResponse.json({ error: `Updates are not supported for module "${module}".` }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided." }, { status: 400 });
  }

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from(table)
    .select("id, project_id")
    .eq("id", id)
    .eq("project_id", projectId)
    .maybeSingle();

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Record not found." }, { status: 404 });

  const { data: updated, error: updateError } = await supabaseAdmin
    .from(table)
    .update(patch)
    .eq("id", id)
    .eq("project_id", projectId)
    .select()
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const actorType = access.context.accountType === "ngo_member" ? "ngo_worker" : access.context.accountType;
  const { error: logError } = await supabaseAdmin.from("activity_logs").insert({
    project_id: projectId,
    module,
    action: "updated",
    actor_type: actorType,
    actor_id: access.user.id,
    detail: { record_id: id, patch },
  });
  if (logError) console.error("activity_logs insert failed:", logError.message);

  return NextResponse.json({ item: updated });
}
