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
 * POST /api/admin/matchmaking/suggest
 *
 * Step 5 — "Suggest to Corporate". Takes the most recent scoring_runs top 10
 * for a project and marks them admin_recommended in pre_assignments. If the
 * same real-world NGO already has a row from Step 4's ngo_applied path (or a
 * prior admin_recommended pass), this UPDATES that row — appends to source
 * rather than creating a duplicate. This is the one place both intake paths
 * actually meet, so the merge has to check both id spaces:
 *   - an existing row keyed by discovered_ngo_id (from a prior admin pass)
 *   - an existing row keyed by ngo_id, reached via this discovered NGO's
 *     claimed_ngo_id link (from an NGO's own application)
 *
 * Body: { opportunity_id, scoring_run_id? } — defaults to the latest run.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await req.json()) as { opportunity_id?: string; scoring_run_id?: string };
  if (!body.opportunity_id) {
    return NextResponse.json({ error: "opportunity_id is required." }, { status: 400 });
  }

  let run;
  if (body.scoring_run_id) {
    const { data } = await supabaseAdmin.from("scoring_runs").select("*").eq("id", body.scoring_run_id).maybeSingle();
    run = data;
  } else {
    const { data } = await supabaseAdmin
      .from("scoring_runs")
      .select("*")
      .eq("project_id", body.opportunity_id)
      .order("triggered_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    run = data;
  }

  if (!run) {
    return NextResponse.json({ error: "No scoring run found for this project. Generate recommendations first." }, { status: 404 });
  }

  const top10Ids: string[] = run.top_10_ngo_ids ?? [];
  if (!top10Ids.length) {
    return NextResponse.json({ error: "This scoring run has no candidates to suggest." }, { status: 400 });
  }

  const [{ data: discoveredNgos }, { data: matchScores }] = await Promise.all([
    supabaseAdmin.from("discovered_ngos").select("id, claimed_ngo_id, name").in("id", top10Ids),
    supabaseAdmin.from("ngo_match_scores").select("*").eq("project_id", body.opportunity_id).in("ngo_id", top10Ids).order("computed_at", { ascending: false }),
  ]);

  const scoreByNgoId = new Map<string, NonNullable<typeof matchScores>[number]>();
  for (const s of matchScores ?? []) if (!scoreByNgoId.has(s.ngo_id)) scoreByNgoId.set(s.ngo_id, s);

  const results: { ngoName: string; action: "created" | "merged" }[] = [];

  for (const discoveredId of top10Ids) {
    const discovered = discoveredNgos?.find((d) => d.id === discoveredId);
    if (!discovered) continue;
    const score = scoreByNgoId.get(discoveredId);

    // Look for an existing row via EITHER id space this NGO could already be in.
    const orFilters = [`discovered_ngo_id.eq.${discoveredId}`];
    if (discovered.claimed_ngo_id) orFilters.push(`ngo_id.eq.${discovered.claimed_ngo_id}`);

    const { data: existing } = await supabaseAdmin
      .from("pre_assignments")
      .select("*")
      .eq("opportunity_id", body.opportunity_id)
      .or(orFilters.join(","))
      .maybeSingle();

    const scoreFields = score
      ? {
          match_score: score.match_score_total ?? 0,
          scoring_run_id: run.id,
          was_in_top_10: true,
        }
      : { scoring_run_id: run.id, was_in_top_10: true };

    if (existing) {
      const mergedSource = Array.from(new Set([...(existing.source ?? []), "admin_recommended"]));
      const { error } = await supabaseAdmin
        .from("pre_assignments")
        .update({
          source: mergedSource,
          discovered_ngo_id: existing.discovered_ngo_id ?? discoveredId,
          ngo_id: existing.ngo_id ?? discovered.claimed_ngo_id ?? null,
          ...scoreFields,
        })
        .eq("id", existing.id);
      if (!error) results.push({ ngoName: discovered.name, action: "merged" });
    } else {
      const { error } = await supabaseAdmin.from("pre_assignments").insert({
        opportunity_id: body.opportunity_id,
        discovered_ngo_id: discoveredId,
        ngo_id: discovered.claimed_ngo_id ?? null,
        status: "suggested",
        source: ["admin_recommended"],
        ...scoreFields,
      });
      if (!error) results.push({ ngoName: discovered.name, action: "created" });
    }
  }

  await supabaseAdmin.from("research_logs").insert({
    run_id: run.id,
    step: "admin_suggest",
    message: `Admin suggested ${results.length} NGO(s) to corporate for opportunity ${body.opportunity_id.slice(0, 8)}`,
    severity: "info",
    metadata: { opportunity_id: body.opportunity_id, scoring_run_id: run.id, results },
  });

  return NextResponse.json({ suggested: results.length, results });
}
