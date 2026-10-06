import { getCaller, getOrgContext } from "@/lib/access-control";
import { supabaseAdmin } from "@/lib/supabase-admin";

type AccessRequestRow = {
  id: string;
  org_id: string;
  user_id: string;
  org_type: "corporate" | "ngo";
  target_type: "project" | "tab";
  target_id: string;
  requested_permission: "read_only" | "edit";
  reason: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  updated_at?: string;
};

export async function GET(request: Request) {
  const user = await getCaller(request);
  if (!user) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const context = await getOrgContext(user);
  if (!context) {
    return Response.json({ error: "Unsupported account type." }, { status: 403 });
  }

  let query = supabaseAdmin
    .from("access_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (context.accountType === "admin") {
    const status = new URL(request.url).searchParams.get("status");
    if (status) query = query.eq("status", status);
  } else if (context.accountType === "corporate" || context.accountType === "ngo") {
    query = query.eq("org_id", context.orgId).eq("org_type", context.orgType);
  } else {
    query = query.eq("user_id", user.id);
  }

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ requests: (data ?? []) as AccessRequestRow[] });
}

export async function POST(request: Request) {
  const user = await getCaller(request);
  if (!user) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const context = await getOrgContext(user);
  if (!context || context.orgType === "admin") {
    return Response.json(
      { error: "Only corporate employees and NGO members can request access." },
      { status: 403 },
    );
  }

  if (context.accountType === "corporate" || context.accountType === "ngo") {
    return Response.json(
      { error: "Admins already have organization access." },
      { status: 400 },
    );
  }

  const body = (await request.json()) as {
    targetType?: "project" | "tab";
    targetId?: string;
    requestedPermission?: "read_only" | "edit";
    reason?: string;
  };

  const targetType = body.targetType;
  const targetId = body.targetId?.trim() ?? "";
  const requestedPermission = body.requestedPermission;
  const reason = body.reason?.trim() ?? "";

  if (targetType !== "project" && targetType !== "tab") {
    return Response.json({ error: "targetType must be project or tab." }, { status: 400 });
  }
  if (!targetId || !reason) {
    return Response.json({ error: "targetId and reason are required." }, { status: 400 });
  }
  if (requestedPermission !== "read_only" && requestedPermission !== "edit") {
    return Response.json(
      { error: "requestedPermission must be read_only or edit." },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("access_requests")
    .insert({
      org_id: context.orgId,
      user_id: user.id,
      org_type: context.orgType,
      target_type: targetType,
      target_id: targetId,
      requested_permission: requestedPermission,
      reason,
      status: "pending",
    })
    .select("*")
    .single();

  if (error || !data) {
    return Response.json(
      { error: error?.message ?? "Could not submit access request." },
      { status: 500 },
    );
  }

  return Response.json({ request: data as AccessRequestRow }, { status: 201 });
}
