import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCaller, getOrgContext } from "@/lib/access-control";

async function requireAdmin(request: Request) {
  const user = await getCaller(request);
  if (!user) return { error: "Unauthorized.", status: 401 } as const;
  const context = await getOrgContext(user);
  if (!context || context.accountType !== "admin") {
    return { error: "Only platform admins can access this endpoint.", status: 403 } as const;
  }
  return { user, context } as const;
}

/**
 * POST /api/admin/pre-assignments/:id/activate
 *
 * Step 8 — the FINALIZE action, distinct from Step 5's "Suggest to
 * Corporate" (which surfaces a candidate) — this finalizes a done deal.
 * Requires BOTH corporate_confirmed_at and ngo_confirmed_at to be set;
 * rejects otherwise, naming whichever side is still pending.
 *
 * Sets opportunities.lifecycle_status -> 'signed' AND creates the
 * project_workspaces record (Step 9) — this is the point where the full
 * platform genuinely unlocks, not before.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: preAssignmentId } = await params;

  const { data: pa, error: fetchError } = await supabaseAdmin
    .from("pre_assignments")
    .select("*, opportunities(id, corporate_id, title, lifecycle_status)")
    .eq("id", preAssignmentId)
    .maybeSingle();

  if (fetchError || !pa) return NextResponse.json({ error: "Application not found." }, { status: 404 });

  if (!pa.corporate_confirmed_at || !pa.ngo_confirmed_at) {
    const pending = [
      !pa.corporate_confirmed_at ? "corporate" : null,
      !pa.ngo_confirmed_at ? "NGO" : null,
    ].filter(Boolean);
    return NextResponse.json(
      { error: `Cannot activate — still waiting on confirmation from: ${pending.join(" and ")}.` },
      { status: 400 },
    );
  }

  if (pa.status === "assigned") {
    return NextResponse.json({ error: "This project is already activated." }, { status: 400 });
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("pre_assignments")
    .update({
      status: "assigned",
      activated_at: new Date().toISOString(),
      activated_by: auth.context.orgId,
    })
    .eq("id", preAssignmentId)
    .select()
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await supabaseAdmin
    .from("opportunities")
    .update({ lifecycle_status: "signed" })
    .eq("id", pa.opportunity_id);

  const opp = pa.opportunities as { id: string; corporate_id: string } | null;
  let workspace = null;
  if (opp?.corporate_id && pa.ngo_id) {
    const { data: ws, error: wsError } = await supabaseAdmin
      .from("project_workspaces")
      .upsert(
        {
          opportunity_id: pa.opportunity_id,
          pre_assignment_id: preAssignmentId,
          corporate_id: opp.corporate_id,
          ngo_id: pa.ngo_id,
        },
        { onConflict: "opportunity_id" },
      )
      .select()
      .single();
    if (wsError) return NextResponse.json({ error: `Activation succeeded but workspace creation failed: ${wsError.message}` }, { status: 500 });
    workspace = ws;

    await supabaseAdmin.from("activity_logs").insert({
      project_id: pa.opportunity_id,
      module: "workspace",
      action: "workspace_created",
      actor_type: "admin",
      actor_id: auth.context.orgId,
      detail: { pre_assignment_id: preAssignmentId },
    });
  }

  await supabaseAdmin.from("research_logs").insert({
    run_id: "00000000-0000-0000-0000-000000000000",
    step: "admin_activate",
    message: `Admin activated project ${pa.opportunity_id.slice(0, 8)} for NGO (pre_assignment ${preAssignmentId.slice(0, 8)})`,
    severity: "info",
    metadata: { pre_assignment_id: preAssignmentId, opportunity_id: pa.opportunity_id, ngo_id: pa.ngo_id },
  });

  return NextResponse.json({ preAssignment: updated, workspace });
}
