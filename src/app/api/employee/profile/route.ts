import { getCaller, getOrgContext } from "@/lib/access-control";
import { mapConnectionRow } from "@/lib/project-connections";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: Request) {
  const user = await getCaller(request);
  if (!user) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const context = await getOrgContext(user);
  if (!context) {
    return Response.json({ error: "Profile not found." }, { status: 404 });
  }

  const { data: assignments, error: assignmentError } = await supabaseAdmin
    .from("project_assignees")
    .select("project_id, role_in_project, permissions")
    .eq("user_id", user.id);

  if (assignmentError) {
    return Response.json({ error: assignmentError.message }, { status: 500 });
  }

  const projectIds = (assignments ?? []).map((assignment) => assignment.project_id);
  const { data: connections, error: connectionError } = projectIds.length
    ? await supabaseAdmin
        .from("project_connections")
        .select("*")
        .in("id", projectIds)
        .order("created_at", { ascending: false })
    : { data: [], error: null };

  if (connectionError) {
    return Response.json({ error: connectionError.message }, { status: 500 });
  }

  const rows = (connections ?? []) as Record<string, unknown>[];
  const corporateIds = [...new Set(rows.map((row) => String(row.corporate_id)))];
  const ngoIds = [...new Set(rows.map((row) => String(row.ngo_id)))];

  const [{ data: corporates }, { data: ngos }] = await Promise.all([
    corporateIds.length
      ? supabaseAdmin.from("corporates").select("id, company_name, slug").in("id", corporateIds)
      : Promise.resolve({ data: [] }),
    ngoIds.length
      ? supabaseAdmin.from("ngos").select("id, ngo_name, slug").in("id", ngoIds)
      : Promise.resolve({ data: [] }),
  ]);

  const corporateNames = new Map((corporates ?? []).map((row) => [row.id, row.company_name]));
  const ngoNames = new Map((ngos ?? []).map((row) => [row.id, row.ngo_name]));
  const assignmentByProject = new Map((assignments ?? []).map((row) => [row.project_id, row]));

  return Response.json({
    profile: {
      id: user.id,
      email: user.email ?? "",
      fullName:
        typeof user.user_metadata?.full_name === "string"
          ? user.user_metadata.full_name
          : user.email?.split("@")[0] ?? "Team Member",
      accountType: context.accountType,
      orgType: context.orgType,
      orgId: context.orgId,
      orgSlug: context.orgSlug,
      orgName: context.orgName,
      roleLabel: context.roleLabel,
      allowedPages: context.allowedPages,
    },
    assignedProjects: rows.map((row) => ({
      ...mapConnectionRow(
        row,
        corporateNames.get(String(row.corporate_id)),
        ngoNames.get(String(row.ngo_id)),
      ),
      assignment: assignmentByProject.get(String(row.id)) ?? null,
    })),
  });
}

export async function PATCH(request: Request) {
  const user = await getCaller(request);
  if (!user) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const body = (await request.json()) as {
    fullName?: string;
    password?: string;
  };

  const updates: {
    user_metadata?: Record<string, unknown>;
    password?: string;
  } = {};

  if (typeof body.fullName === "string" && body.fullName.trim()) {
    updates.user_metadata = {
      ...user.user_metadata,
      full_name: body.fullName.trim(),
    };
  }

  if (typeof body.password === "string" && body.password.length >= 8) {
    updates.password = body.password;
  }

  if (!updates.user_metadata && !updates.password) {
    return Response.json({ error: "No valid profile updates provided." }, { status: 400 });
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, updates);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (updates.user_metadata?.full_name && user.user_metadata?.account_type === "corporate_employee") {
    await supabaseAdmin
      .from("corporate_employees")
      .update({ full_name: updates.user_metadata.full_name })
      .eq("auth_user_id", user.id);
  }

  if (updates.user_metadata?.full_name && user.user_metadata?.account_type === "ngo_member") {
    await supabaseAdmin
      .from("ngo_members")
      .update({ full_name: updates.user_metadata.full_name })
      .eq("auth_user_id", user.id);
  }

  return Response.json({ ok: true });
}
