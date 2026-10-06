#!/usr/bin/env node
/**
 * scripts/ngo-discovery/audit-fairness.mjs
 *
 * Periodic (manual or monthly) fairness review over scoring_runs +
 * ngo_match_scores history. Read-only reporting — logs findings for a
 * human to review, does NOT auto-correct anything at runtime. Automatic
 * correction of "who wins" is its own bias risk; this is a signal for
 * revisiting weights, not a blocking gate.
 *
 * Usage:
 *   node scripts/ngo-discovery/audit-fairness.mjs
 */

import { supabase } from "./lib/supabase.mjs";

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║  CorpoGN — Scoring Fairness Audit                     ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  const { data: runs, error } = await supabase
    .from("scoring_runs")
    .select("id, project_id, top_10_ngo_ids, triggered_at")
    .order("triggered_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch scoring_runs: ${error.message}`);

  if (!runs.length) {
    console.log("No scoring runs recorded yet — nothing to audit.");
    console.log("(Mechanism check: this is expected output on a fresh system, not an error.)\n");
    return;
  }

  console.log(`Reviewing ${runs.length} scoring run(s).\n`);

  // ── 1. NGO dominance across unrelated projects ──────────────────────────
  const appearanceCount = new Map();
  const projectsPerNgo = new Map();
  for (const run of runs) {
    for (const ngoId of run.top_10_ngo_ids ?? []) {
      appearanceCount.set(ngoId, (appearanceCount.get(ngoId) ?? 0) + 1);
      const projects = projectsPerNgo.get(ngoId) ?? new Set();
      projects.add(run.project_id);
      projectsPerNgo.set(ngoId, projects);
    }
  }

  const ngoIds = [...appearanceCount.keys()];
  const { data: ngoNames } = ngoIds.length
    ? await supabase.from("discovered_ngos").select("id, name, city, state").in("id", ngoIds)
    : { data: [] };
  const nameById = new Map((ngoNames ?? []).map((n) => [n.id, n]));

  const dominanceThreshold = Math.max(3, Math.ceil(runs.length * 0.3)); // appears in ≥30% of runs (min 3)
  const dominant = [...appearanceCount.entries()]
    .filter(([, count]) => count >= dominanceThreshold)
    .sort((a, b) => b[1] - a[1]);

  console.log("── NGO dominance across unrelated projects ──────────────────");
  if (!dominant.length) {
    console.log(`No NGO appears in ≥${dominanceThreshold} of ${runs.length} runs — no dominance signal yet.`);
  } else {
    console.log(`NGOs appearing in ≥${dominanceThreshold} of ${runs.length} runs (review whether this reflects genuinely broad fit or a weighting issue):`);
    for (const [ngoId, count] of dominant) {
      const ngo = nameById.get(ngoId);
      console.log(`  ${ngo?.name ?? ngoId} — top-10 in ${count}/${runs.length} runs, across ${projectsPerNgo.get(ngoId).size} distinct project(s)`);
    }
  }

  // ── 2. Location representation: top-10 composition vs. candidate pool ──
  console.log("\n── Location representation (top-10 vs. candidate pool) ──────");
  const { data: allCandidates } = await supabase
    .from("discovered_ngos")
    .select("id, city, state")
    .not("claimed_ngo_id", "is", null);

  const poolByCity = new Map();
  for (const c of allCandidates ?? []) {
    const key = c.city || c.state || "Unknown";
    poolByCity.set(key, (poolByCity.get(key) ?? 0) + 1);
  }
  const poolTotal = allCandidates?.length ?? 0;

  const top10ByCity = new Map();
  let top10Total = 0;
  for (const ngoId of ngoIds) {
    const ngo = nameById.get(ngoId);
    if (!ngo) continue;
    const key = ngo.city || ngo.state || "Unknown";
    const count = appearanceCount.get(ngoId);
    top10ByCity.set(key, (top10ByCity.get(key) ?? 0) + count);
    top10Total += count;
  }

  const cities = new Set([...poolByCity.keys(), ...top10ByCity.keys()]);
  const rows = [...cities].map((city) => {
    const poolShare = poolTotal ? (poolByCity.get(city) ?? 0) / poolTotal : 0;
    const top10Share = top10Total ? (top10ByCity.get(city) ?? 0) / top10Total : 0;
    return { city, poolShare, top10Share, delta: top10Share - poolShare };
  }).sort((a, b) => a.delta - b.delta);

  for (const r of rows) {
    const flag = Math.abs(r.delta) > 0.15 ? (r.delta < 0 ? " ⚠ under-represented" : " ⚠ over-represented") : "";
    console.log(`  ${r.city.padEnd(20)} pool ${(r.poolShare * 100).toFixed(1)}%  top-10 ${(r.top10Share * 100).toFixed(1)}%${flag}`);
  }
  if (!rows.some((r) => Math.abs(r.delta) > 0.15)) {
    console.log("  No location shows a >15 point gap between pool share and top-10 share.");
  }

  console.log(`\nDone. ${runs.length} run(s) reviewed. This is a signal for reviewing scoring weights, not an automatic correction.\n`);
}

main().catch((err) => {
  console.error(`\nFatal: ${err.message}`);
  process.exit(1);
});
