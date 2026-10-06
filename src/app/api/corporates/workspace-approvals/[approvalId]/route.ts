import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCaller, getCorporateIdForUser } from "@/lib/access-control";

/**
 * PATCH /api/corporates/workspace-approvals/:approvalId
 *
 * Decide a workspace approval from the corporate-wide "Reports & Approvals"
 * page. The generic per-project module route only does GET/POST, and the
 * corporate approval queue is portfolio-wide (the caller does not pick a
 * project first), so the decision write lives here.
 *
 * Ownership is re-derived server-side: the approval's project must resolve to
 * a project_workspaces row owned by the caller's corporate. The approvalId in
 * the URL is never trusted on its own.
 */

const ALLOWED_STATUSES = new Set(["approved", "rejected", "revision_requested", "pending"]);

export async function PATCH(request: Request, { params }: { params: Promise<{ approvalId: string }> }) {
  const { approvalId } = await params;

  const user = await getCaller(request);
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const corporateId = await getCorporateIdForUser(user);
  if (!corporateId) {
    return NextResponse.json({ error: "Only corporate accounts or their active employees can decide approvals." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { status?: string };
  const status = (body.status ?? "").trim();
  if (!ALLOWED_STATUSES.has(status)) {
    return NextResponse.json(
      { error: `Invalid status. Expected one of: ${Array.from(ALLOWED_STATUSES).join(", ")}.` },
      { status: 400 },
    );
  }

  const { data: approval, error: approvalError } = await supabaseAdmin
    .from("approvals")
    .select("id, project_id, status")
    .eq("id", approvalId)
    .maybeSingle();

  if (approvalError) return NextResponse.json({ error: approvalError.message }, { status: 500 });
  if (!approval) return NextResponse.json({ error: "Approval not found." }, { status: 404 });

  const { data: workspace } = await supabaseAdmin
    .from("project_workspaces")
    .select("id, corporate_id")
    .eq("opportunity_id", approval.project_id)
    .maybeSingle();

  if (!workspace || workspace.corporate_id !== corporateId) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("approvals")
    .update({ status, approved_by: status === "approved" ? user.id : null })
    .eq("id", approvalId)
    .select()
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const { error: logError } = await supabaseAdmin.from("activity_logs").insert({
    project_id: approval.project_id,
    module: "approvals",
    action: `approval_${status}`,
    actor_type: user.user_metadata?.account_type === "corporate_employee" ? "corporate_employee" : "corporate",
    actor_id: user.id,
    detail: { record_id: approvalId, from: approval.status, to: status },
  });
  if (logError) console.error("activity_logs insert failed:", logError.message);

  return NextResponse.json({ item: updated });
}
