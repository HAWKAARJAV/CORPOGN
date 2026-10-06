import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCaller, getOrgContext } from "@/lib/access-control";
import { rankCandidatesForProject } from "@/lib/scoring/rank.mjs";

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
 * GET /api/admin/matchmaking?opportunity_id=...
 *
 * Runs the real Trust Score / Match Score / capacity-gate engine on demand
 * (match score is computed per-click by design — trust score itself is
 * read from the latest batch run, not recomputed here). Persists a
 * scoring_runs row plus ngo_match_scores for the FULL scored pool (not
 * just top 10) so admin overrides can be compared against it later.
 */
export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const opportunityId = searchParams.get("opportunity_id");

  if (!opportunityId) {
    return NextResponse.json({ error: "Missing opportunity_id" }, { status: 400 });
  }

  try {
    const { data: opp, error: oppErr } = await supabaseAdmin
      .from("opportunities")
      .select("*, corporate:corporates(company_name)")
      .eq("id", opportunityId)
      .single();

    if (oppErr || !opp) {
      return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
    }

    const { ranked, candidatePoolSize, capacityGateExcludedCount, allScored } = await rankCandidatesForProject(supabaseAdmin, opp);

    const { data: preAssignments } = await supabaseAdmin
      .from("pre_assignments")
      .select("discovered_ngo_id, status, override_notes")
      .eq("opportunity_id", opportunityId);
    const shortlists = new Map((preAssignments ?? []).map((p) => [p.discovered_ngo_id, p]));

    // ── Persist the run (append-only) ──────────────────────────────────
    const top10Ids = ranked.map((r) => r.ngo.id);
    const { data: run, error: runError } = await supabaseAdmin
      .from("scoring_runs")
      .insert({
        project_id: opportunityId,
        run_by: auth.context.orgId,
        scoring_version: "v1",
        candidate_pool_size: candidatePoolSize,
        capacity_gate_excluded_count: capacityGateExcludedCount,
        top_10_ngo_ids: top10Ids,
        admin_action: "pending",
      })
      .select("id")
      .single();

    if (runError) throw new Error(runError.message);

    // Persist match scores for the FULL scored pool, not just top 10.
    const matchRows = allScored.map((s) => ({
      project_id: opportunityId,
      ngo_id: s.ngo.id,
      scoring_version: "v1",
      capacity_gate_passed: true, // allScored only contains gate-passed candidates
      capacity_gate_reason: s.match.gateReason,
      sector_fit_score: s.match.scores.sectorFit,
      location_fit_score: s.match.scores.locationFit,
      capacity_fit_score: s.match.scores.capacityFit,
      match_score_total: s.match.total,
      component_breakdown: s.match.componentBreakdown,
      trust_score_used: s.trust.id,
    }));
    if (matchRows.length) {
      await supabaseAdmin.from("ngo_match_scores").insert(matchRows);
    }

    const matches = ranked.map((s) => ({
      id: s.ngo.id,
      name: s.ngo.name,
      certification_tier: s.ngo.certification_tier,
      city: s.ngo.city,
      state: s.ngo.state,
      give_discover_url: s.ngo.give_discover_url,
      trust: {
        total: s.trust.trust_score_total,
        completeness: s.trust.data_completeness_pct,
        percentile: s.trustPercentile,
        breakdown: s.trust.component_breakdown,
      },
      match: {
        total: s.match.total,
        percentile: s.matchPercentile,
        breakdown: s.match.componentBreakdown,
        capacityGate: s.match.capacityGate,
      },
      finalScore: s.finalScore,
      shortlist_status: shortlists.get(s.ngo.id)?.status ?? null,
    }));

    return NextResponse.json({
      opportunity: {
        id: opp.id,
        title: opp.title,
        focus_area: opp.focus_area,
        budget: opp.budget,
        state: opp.state,
        company_name: opp.corporate?.company_name ?? "Corporate Partner",
      },
      scoringRunId: run.id,
      candidatePoolSize,
      capacityGateExcludedCount,
      matches,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/admin/matchmaking
 *
 * Records an admin action (shortlist/assign/reject) on a specific NGO for
 * an opportunity. If the action is "assigned" and the NGO was NOT in the
 * most recent scoring run's top 10, override_notes is REQUIRED — this is
 * the tuning signal for revisiting scoring weights later.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const { opportunity_id, discovered_ngo_id, match_score, status = "shortlisted", override_notes } = body;

    if (!opportunity_id || !discovered_ngo_id || match_score === undefined) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { data: latestRun } = await supabaseAdmin
      .from("scoring_runs")
      .select("id, top_10_ngo_ids")
      .eq("project_id", opportunity_id)
      .order("triggered_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const wasInTop10 = latestRun ? (latestRun.top_10_ngo_ids ?? []).includes(discovered_ngo_id) : null;

    if (status === "assigned" && wasInTop10 === false && !override_notes?.trim()) {
      return NextResponse.json(
        { error: "This NGO was not in the algorithm's top 10 for this project. override_notes is required to explain why." },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("pre_assignments")
      .upsert(
        {
          opportunity_id,
          discovered_ngo_id,
          match_score,
          status,
          scoring_run_id: latestRun?.id ?? null,
          was_in_top_10: wasInTop10,
          override_notes: override_notes?.trim() || null,
          created_at: new Date().toISOString(),
        },
        { onConflict: "opportunity_id,discovered_ngo_id" },
      )
      .select()
      .single();

    if (error) throw error;

    if (latestRun) {
      const action = status === "assigned" ? (wasInTop10 === false ? "overridden" : "recommended") : "pending";
      if (action !== "pending") {
        await supabaseAdmin
          .from("scoring_runs")
          .update({ admin_action: action, admin_override_notes: override_notes?.trim() || null })
          .eq("id", latestRun.id);
      }
    }

    await supabaseAdmin.from("research_logs").insert({
      run_id: "00000000-0000-0000-0000-000000000000",
      step: "matchmaking",
      message: `Admin ${status} NGO (ID: ${discovered_ngo_id.slice(0, 8)}) to Opportunity (ID: ${opportunity_id.slice(0, 8)}) with match score ${match_score}${wasInTop10 === false ? " [OVERRIDE]" : ""}`,
      severity: "info",
      metadata: { opportunity_id, discovered_ngo_id, match_score, status, was_in_top_10: wasInTop10, override_notes: override_notes ?? null },
    });

    return NextResponse.json({ success: true, pre_assignment: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
