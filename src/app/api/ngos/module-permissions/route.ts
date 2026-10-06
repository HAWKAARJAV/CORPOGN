import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCaller, getOrgContext } from "@/lib/access-control";

/**
 * Lets an NGO super admin grant/list project_module_permissions rows for
 * their own team members (ngo_members → assignee_type 'ngo_worker'). This
 * table already exists and is already enforced server-side by
 * app/api/project-workspace/[projectId]/[module]/route.ts — it just had no
 * writer anywhere in the app (0 rows). Only the NGO's own super-admin login
 * may grant; team members cannot grant themselves or each other access.
 */

async function requireNgoSuperAdmin(request: Request) {
  const user = await getCaller(request);
  if (!user) return { error: "Unauthorized.", status: 401 } as const;
  const context = await getOrgContext(user);
  if (!context || context.accountType !== "ngo") {
    return { error: "Only the NGO's own super admin login can manage module access.", status: 403 } as const;
  }
  return { ok: true, user, context } as const;
}

export async function GET(request: Request) {
  const auth = await requireNgoSuperAdmin(request);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId is required." }, { status: 400 });

  // Restrict to this NGO's own members only.
  const { data: members } = await supabaseAdmin
    .from("ngo_members")
    .select("auth_user_id")
    .eq("ngo_id", auth.context.orgId);
  const memberIds = new Set((members ?? []).map((m) => m.auth_user_id));

  const { data, error } = await supabaseAdmin
    .from("project_module_permissions")
    .select("id, project_id, assignee_type, assignee_id, module, permission, granted_by, created_at")
    .eq("project_id", projectId)
    .eq("assignee_type", "ngo_worker");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ grants: (data ?? []).filter((g) => memberIds.has(g.assignee_id)) });
}

export async function POST(request: Request) {
  const auth = await requireNgoSuperAdmin(request);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string; memberAuthUserId?: string; module?: string; permission?: string;
  };
  const { projectId, memberAuthUserId, module, permission } = body;

  if (!projectId || !memberAuthUserId || !module || !permission) {
    return NextResponse.json({ error: "projectId, memberAuthUserId, module, and permission are required." }, { status: 400 });
  }
  if (permission !== "read" && permission !== "edit") {
    return NextResponse.json({ error: "permission must be 'read' or 'edit'." }, { status: 400 });
  }

  // Verify the target user is actually a member of this NGO — never let one
  // NGO grant access to someone else's team member.
  const { data: member } = await supabaseAdmin
    .from("ngo_members")
    .select("id")
    .eq("ngo_id", auth.context.orgId)
    .eq("auth_user_id", memberAuthUserId)
    .maybeSingle();
  if (!member) return NextResponse.json({ error: "That person is not a member of your NGO team." }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("project_module_permissions")
    .upsert(
      {
        project_id: projectId,
        assignee_type: "ngo_worker",
        assignee_id: memberAuthUserId,
        module,
        permission,
        granted_by: auth.context.orgId,
      },
      { onConflict: "project_id,assignee_type,assignee_id,module" },
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ grant: data });
}
