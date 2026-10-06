import { getCaller, getOrgContext } from "@/lib/access-control";
import { corporateSidebarItems } from "@/lib/corporate";
import { supabaseAdmin } from "@/lib/supabase-admin";

const VALID_CORPORATE_TABS = new Set<string>(corporateSidebarItems);

function permissionsFor(permission: "read_only" | "edit") {
  return {
    all: permission,
    milestones: permission,
    budgets: permission,
    reports: permission,
    chat: permission,
  };
}

async function approveCorporateTab(userId: string, targetId: string) {
  if (!VALID_CORPORATE_TABS.has(targetId)) return;

  const { data: employee } = await supabaseAdmin
    .from("corporate_employees")
    .select("id, allowed_pages")
    .eq("auth_user_id", userId)
    .maybeSingle();

  const current = Array.isArray(employee?.allowed_pages)
    ? employee.allowed_pages.filter((page): page is string => typeof page === "string")
    : [];
  const allowedPages = Array.from(new Set([...current, targetId]));

  if (employee) {
    await supabaseAdmin
      .from("corporate_employees")
      .update({ allowed_pages: allowedPages })
      .eq("id", employee.id);
  }

  const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (authUser.user) {
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: {
        ...authUser.user.user_metadata,
        allowed_pages: allowedPages,
      },
    });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCaller(request);
  if (!user) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const context = await getOrgContext(user);
  if (!context) {
    return Response.json({ error: "Unsupported account type." }, { status: 403 });
  }

  const body = (await request.json()) as {
    status?: "approved" | "rejected";
  };

  if (body.status !== "approved" && body.status !== "rejected") {
    return Response.json({ error: "status must be approved or rejected." }, { status: 400 });
  }

  const { data: accessRequest, error: fetchError } = await supabaseAdmin
    .from("access_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !accessRequest) {
    return Response.json({ error: "Access request not found." }, { status: 404 });
  }

  const canResolve =
    context.accountType === "admin" ||
    ((context.accountType === "corporate" || context.accountType === "ngo") &&
      context.orgType === accessRequest.org_type &&
      context.orgId === accessRequest.org_id);

  if (!canResolve) {
    return Response.json({ error: "Only organization admins can resolve this request." }, { status: 403 });
  }

  if (body.status === "approved") {
    if (accessRequest.target_type === "project") {
      await supabaseAdmin.from("project_assignees").upsert(
        {
          project_id: accessRequest.target_id,
          user_id: accessRequest.user_id,
          role_in_project:
            accessRequest.org_type === "corporate"
              ? "Corporate Project Assignee"
              : "NGO Project Assignee",
          permissions: permissionsFor(accessRequest.requested_permission),
        },
        { onConflict: "project_id,user_id" },
      );
    } else if (accessRequest.org_type === "corporate") {
      await approveCorporateTab(accessRequest.user_id, accessRequest.target_id);
    }
  }

  const { data, error } = await supabaseAdmin
    .from("access_requests")
    .update({
      status: body.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    return Response.json(
      { error: error?.message ?? "Could not resolve access request." },
      { status: 500 },
    );
  }

  return Response.json({ request: data });
}
