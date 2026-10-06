/**
 * lib/scoring/rank.mjs
 *
 * Final combine step: Trust Score + Match Score → ranked candidate list for
 * a project. Combines by PERCENTILE within the candidate pool for THIS
 * project, not raw 0-100 values — so one NGO's absolute dominance can't
 * swamp a genuinely close field. Trust and Match stay two separate numbers
 * everywhere upstream of this file.
 */

import { computeMatchScore } from "./match-score.mjs";

const FINAL_SCORE_WEIGHTS = { trust: 0.5, match: 0.5 };
// TODO-tunable 50/50 split — reasoned starting point, not researched-optimal.
// Revisit using scoring_runs.admin_override_notes once real usage exists.

/** Percentile rank (0-100) of each value within the array — ties share the same percentile. */
export function percentileRank(values) {
  const n = values.length;
  if (n === 0) return [];
  if (n === 1) return [100];
  const sorted = [...values].sort((a, b) => a - b);
  return values.map((v) => {
    const belowOrEqual = sorted.filter((x) => x <= v).length;
    return Math.round(((belowOrEqual - 1) / (n - 1)) * 10000) / 100;
  });
}

const looksLikeJunkProjectName = (name) => {
  if (!name) return true;
  if (name.length > 220) return true;
  return /[{}<>;]|function\s*\(|@media|grid-template|:\s*hover|\\\d/.test(name);
};

/**
 * Candidate pool = discovered_ngos that (a) are actually deliverable — have
 * a claimed_ngo_id link to the live ngos table the corporate-facing flow
 * uses — and (b) have at least one category overlapping the project's
 * sector, so compute isn't wasted scoring wildly irrelevant NGOs.
 */
export async function getCandidatePool(supabase, project) {
  const focus = (project.focus_area ?? "").toLowerCase();
  const csrFocus = (project.csr_focus_area ?? "").toLowerCase();

  const { data: ngos, error } = await supabase
    .from("discovered_ngos")
    .select("*")
    .not("claimed_ngo_id", "is", null);
  if (error) throw new Error(`Failed to fetch candidate NGOs: ${error.message}`);
  if (!ngos.length) return [];

  const ngoIds = ngos.map((n) => n.id);
  const { data: categories } = await supabase
    .from("discovered_ngo_categories")
    .select("ngo_id, category")
    .in("ngo_id", ngoIds);

  const categoriesByNgo = new Map();
  for (const c of categories ?? []) {
    const list = categoriesByNgo.get(c.ngo_id) ?? [];
    list.push(c.category.toLowerCase());
    categoriesByNgo.set(c.ngo_id, list);
  }

  return ngos.filter((n) => {
    if (!focus) return true; // no focus area on the project — don't over-filter
    const cats = categoriesByNgo.get(n.id) ?? [];
    return cats.some((c) => c === focus || c === csrFocus || focus.includes(c) || c.includes(focus));
  });
}

export async function getCurrentTrustScore(supabase, ngoId) {
  const { data } = await supabase
    .from("ngo_trust_scores")
    .select("*")
    .eq("ngo_id", ngoId)
    .eq("is_current", true)
    .maybeSingle();
  return data ?? null;
}

/** Batch-fetch everything computeMatchScore needs for a set of candidate NGOs. */
async function loadCandidateContext(supabase, candidates) {
  const ngoIds = candidates.map((n) => n.id);
  const liveIds = candidates.map((n) => n.claimed_ngo_id).filter(Boolean);

  const [trustScores, categories, projects, financials, liveNgos] = await Promise.all([
    supabase.from("ngo_trust_scores").select("*").in("ngo_id", ngoIds).eq("is_current", true),
    supabase.from("discovered_ngo_categories").select("ngo_id, category").in("ngo_id", ngoIds),
    supabase.from("discovered_ngo_projects").select("*").in("ngo_id", ngoIds),
    supabase.from("discovered_ngo_financials").select("*").in("ngo_id", ngoIds),
    liveIds.length
      ? supabase.from("ngos").select("id, states_served, cert_12a, cert_80g").in("id", liveIds)
      : Promise.resolve({ data: [] }),
  ]);

  const byNgo = (rows) => {
    const map = new Map();
    for (const r of rows ?? []) {
      const list = map.get(r.ngo_id) ?? [];
      list.push(r);
      map.set(r.ngo_id, list);
    }
    return map;
  };

  return {
    trustByNgo: new Map((trustScores.data ?? []).map((t) => [t.ngo_id, t])),
    categoriesByNgo: byNgo(categories.data),
    projectsByNgo: byNgo(projects.data),
    financialsByNgo: byNgo(financials.data),
    liveNgoById: new Map((liveNgos.data ?? []).map((n) => [n.id, n])),
  };
}

/**
 * @param {object} supabase
 * @param {object} project - opportunities row
 * @returns {Promise<{ ranked: Array, candidatePoolSize: number, capacityGateExcludedCount: number, allScored: Array }>}
 */
export async function rankCandidatesForProject(supabase, project) {
  const candidates = await getCandidatePool(supabase, project);
  const context = await loadCandidateContext(supabase, candidates);

  const scored = [];
  let gateExcluded = 0;

  for (const ngo of candidates) {
    const trust = context.trustByNgo.get(ngo.id);
    if (!trust) continue; // no current trust score computed yet — skip, don't score with a fallback

    const match = computeMatchScore(ngo, project, trust, {
      categories: (context.categoriesByNgo.get(ngo.id) ?? []).map((c) => ({ category: c.category })),
      projects: (context.projectsByNgo.get(ngo.id) ?? []).filter((p) => !looksLikeJunkProjectName(p.name)),
      financials: context.financialsByNgo.get(ngo.id) ?? [],
      linkedNgo: ngo.claimed_ngo_id ? context.liveNgoById.get(ngo.claimed_ngo_id) : null,
    });

    if (!match.gatePassed) {
      gateExcluded++;
      continue; // excluded, not scored down
    }

    scored.push({ ngo, trust, match });
  }

  const trustPercentiles = percentileRank(scored.map((s) => s.trust.trust_score_total));
  const matchPercentiles = percentileRank(scored.map((s) => s.match.total));

  const ranked = scored
    .map((s, i) => ({
      ...s,
      trustPercentile: trustPercentiles[i],
      matchPercentile: matchPercentiles[i],
      finalScore: Math.round((FINAL_SCORE_WEIGHTS.trust * trustPercentiles[i] + FINAL_SCORE_WEIGHTS.match * matchPercentiles[i]) * 100) / 100,
    }))
    .sort((a, b) => b.finalScore - a.finalScore);

  return {
    ranked: ranked.slice(0, 10),
    candidatePoolSize: candidates.length,
    capacityGateExcludedCount: gateExcluded,
    allScored: ranked, // full pool, for audit/override visibility — not just top 10
  };
}
