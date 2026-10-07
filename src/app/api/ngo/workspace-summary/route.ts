import { NextResponse } from "next/server";
import { getCaller, getNgoIdForUser } from "@/lib/access-control";
import { supabaseAdmin } from "@/lib/supabase-admin";

function num(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * GET /api/ngo/workspace-summary
 *
 * Signed-project rollups for the NGO Command Center — team size, M&E,
 * finance, pending approvals, and recent activity_logs (no client KPIs).
 */
export async function GET(request: Request) {
  const user = await getCaller(request);
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const ngoId = await getNgoIdForUser(user);
  if (!ngoId) {
    return NextResponse.json({ error: "Only NGO accounts can view this summary." }, { status: 403 });
  }

  const { data: workspace, error: wsError } = await supabaseAdmin
    .from("project_workspaces")
    .select("opportunity_id, created_at")
    .eq("ngo_id", ngoId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (wsError) return NextResponse.json({ error: wsError.message }, { status: 500 });

  const { count: teamMemberCount } = await supabaseAdmin
    .from("ngo_members")
    .select("id", { count: "exact", head: true })
    .eq("ngo_id", ngoId)
    .eq("is_active", true);

  const empty = {
    hasSignedWorkspace: false,
    projectId: null as string | null,
    projectTitle: null as string | null,
    teamMemberCount: teamMemberCount ?? 0,
    beneficiariesReached: 0,
    beneficiariesTarget: 0,
    releasedInr: 0,
    spentInr: 0,
    pendingApprovals: 0,
    recentActivity: [] as {
      id: string;
      module: string;
      action: string;
      detail: Record<string, unknown>;
      createdAt: string | null;
    }[],
  };

  if (!workspace?.opportunity_id) {
    return NextResponse.json(empty);
  }

  const projectId = workspace.opportunity_id as string;

  const { data: opp, error: oppError } = await supabaseAdmin
    .from("opportunities")
    .select("id, title, lifecycle_status")
    .eq("id", projectId)
    .maybeSingle();

  if (oppError) return NextResponse.json({ error: oppError.message }, { status: 500 });
  if (!opp || opp.lifecycle_status !== "signed") {
    return NextResponse.json({ ...empty, projectId, projectTitle: opp?.title ?? null });
  }

  const [
    budgetRes,
    fundsRes,
    meRes,
    approvalsRes,
    activityRes,
  ] = await Promise.all([
    supabaseAdmin.from("budget_tracking").select("spent_inr").eq("project_id", projectId),
    supabaseAdmin.from("funds").select("amount_inr, released_at").eq("project_id", projectId),
    supabaseAdmin.from("monitoring_evaluation").select("metric_name, metric_value").eq("project_id", projectId),
    supabaseAdmin.from("approvals").select("status").eq("project_id", projectId),
    supabaseAdmin
      .from("activity_logs")
      .select("id, module, action, detail, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const firstError =
    budgetRes.error || fundsRes.error || meRes.error || approvalsRes.error || activityRes.error;
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 });

  const spent = (budgetRes.data ?? []).reduce((sum, r) => sum + num(r.spent_inr), 0);
  const released = (fundsRes.data ?? [])
    .filter((f) => f.released_at)
    .reduce((sum, f) => sum + num(f.amount_inr), 0);

  const metrics = meRes.data ?? [];
  const beneficiariesReached = num(
    metrics.find((m) => String(m.metric_name).toLowerCase().includes("beneficiaries reached"))?.metric_value,
  );
  const beneficiariesTarget = num(
    metrics.find((m) => String(m.metric_name).toLowerCase().includes("target beneficiaries"))?.metric_value,
  );

  const pendingApprovals = (approvalsRes.data ?? []).filter((a) => a.status === "pending").length;

  const recentActivity = (activityRes.data ?? []).map((row) => ({
    id: String(row.id),
    module: String(row.module ?? ""),
    action: String(row.action ?? ""),
    detail: (row.detail as Record<string, unknown>) ?? {},
    createdAt: (row.created_at as string | null) ?? null,
  }));

  return NextResponse.json({
    hasSignedWorkspace: true,
    projectId,
    projectTitle: String(opp.title ?? ""),
    teamMemberCount: teamMemberCount ?? 0,
    beneficiariesReached,
    beneficiariesTarget,
    releasedInr: released,
    spentInr: spent,
    pendingApprovals,
    recentActivity,
  });
}
