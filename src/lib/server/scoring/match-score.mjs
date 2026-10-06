/**
 * lib/scoring/match-score.mjs
 *
 * Match Score — how well a SPECIFIC NGO fits a SPECIFIC project (budget,
 * sector, location). Computed on-demand per admin click, never batched.
 * Keyed on discovered_ngos.id, same id space as trust-score.mjs.
 *
 * Capacity is a hard GATE applied first, not a weighted score input — see
 * passesCapacityGate. Everything else is scored 0-100 only for NGOs that
 * pass the gate.
 */

import { evaluateCapacity } from "../../../../tooling/scripts/ngo-enrichment/lib/capacity-filter.mjs";

const looksLikeJunkProjectName = (name) => {
  if (!name) return true;
  if (name.length > 220) return true;
  return /[{}<>;]|function\s*\(|@media|grid-template|:\s*hover|\\\d/.test(name);
};

/**
 * Capacity data lookup, in discovered_ngos id space directly — no
 * claimed_ngo_id resolution needed since both the NGO and the project
 * (opportunities) are already in the same admin-facing pipeline.
 *
 * Priority: max known project-level funding → give.do lifetime total →
 * annual financials → null (never silently pass/fail on null; caller must
 * route to manual review).
 */
export function getMaxHistoricalFunding(ngo, projects, financials) {
  const realProjects = projects.filter((p) => !looksLikeJunkProjectName(p.name) && p.funding_amount_inr);
  if (realProjects.length) {
    const top = realProjects.reduce((max, p) => (Number(p.funding_amount_inr) > Number(max.funding_amount_inr) ? p : max));
    return { amount: Number(top.funding_amount_inr), source: "project_history", detail: `Largest known project "${top.name}" (${top.funding_amount_source ?? "source unspecified"})` };
  }

  if (ngo.givedo_lifetime_raised_inr && ngo.givedo_lifetime_raised_inr > 0) {
    return { amount: Number(ngo.givedo_lifetime_raised_inr), source: "givedo_lifetime_raised", detail: "No project-level funding on record — using lifetime give.do platform total as a ceiling" };
  }

  if (financials.length) {
    const mostRecent = [...financials].sort((a, b) => b.year - a.year)[0];
    if (mostRecent.total_income) {
      return { amount: Number(mostRecent.total_income), source: "annual_budget", detail: `No project- or platform-level funding — using ${mostRecent.year} annual income as a ceiling` };
    }
  }

  return { amount: null, source: null, detail: "No capacity data found on any tier" };
}

/**
 * @param {object} ngo - discovered_ngos row
 * @param {object} project - opportunities row (budget, focus_area, state, district)
 * @param {object} capacityData - { projects, financials } for this ngo
 */
export function passesCapacityGate(ngo, project, { projects = [], financials = [] } = {}) {
  const { amount, source, detail } = getMaxHistoricalFunding(ngo, projects, financials);
  const result = evaluateCapacity(amount, Number(project.budget) || 0);
  return { ...result, maxHistoricalProject: amount, source, sourceDetail: detail };
}

// ── Sector fit (40 pts) ─────────────────────────────────────────────────
// Self-tagged category alone is a weaker signal than a category backed by
// real, non-junk project delivery in that sector.
export function computeSectorFitScore(ngo, project, categories, projects) {
  const focus = (project.focus_area ?? "").toLowerCase();
  const csrFocus = (project.csr_focus_area ?? "").toLowerCase();
  const ngoCategories = categories.map((c) => c.category.toLowerCase());

  const hasCategoryMatch = ngoCategories.some((c) => c === focus || c === csrFocus || focus.includes(c) || c.includes(focus));
  const categoryScore = hasCategoryMatch ? 20 : 0;

  const realProjects = projects.filter((p) => !looksLikeJunkProjectName(p.name));
  // Approximation: a project's description mentioning the focus-area keyword
  // stands in for per-project sector tagging, which discovered_ngo_projects
  // doesn't currently capture. Documented limitation, not silent.
  const sectorProjects = realProjects.filter((p) => {
    const text = `${p.name ?? ""} ${p.description ?? ""}`.toLowerCase();
    return focus && text.includes(focus.split(" ")[0]);
  });
  const deliveryScore = Math.min(20, sectorProjects.length * 7);

  return {
    points: categoryScore + deliveryScore,
    detail: hasCategoryMatch
      ? `Tagged in "${focus}" · ${sectorProjects.length} project(s) with matching delivery history`
      : `No category tag match for "${focus}" · ${sectorProjects.length} project(s) with matching delivery history`,
  };
}

// ── Location fit (30 pts) ────────────────────────────────────────────────
export function computeLocationFitScore(ngo, project, projects, linkedNgo) {
  const projState = (project.state ?? "").toLowerCase();
  const statesServed = (linkedNgo?.states_served ?? []).map((s) => String(s).toLowerCase());
  const exactMatch =
    projState === "pan india" ||
    (ngo.state ?? "").toLowerCase() === projState ||
    statesServed.includes(projState);
  const tagScore = exactMatch ? 15 : 0;

  const realProjects = projects.filter((p) => !looksLikeJunkProjectName(p.name));
  const locationProjects = realProjects.filter((p) => (p.location ?? "").toLowerCase().includes(projState.split(" ")[0] ?? ""));
  const deliveryScore = projState ? Math.min(15, locationProjects.length * 7.5) : 0;

  return {
    points: tagScore + deliveryScore,
    detail: exactMatch
      ? `Located/serves "${project.state}" · ${locationProjects.length} project(s) delivered there`
      : `No location match for "${project.state}" · ${locationProjects.length} project(s) delivered there`,
  };
}

// ── Capacity fit (30 pts, only meaningful if gate passed) ─────────────────
// Tighter proven fit (largest past project close to the requested budget)
// scores higher than one that barely cleared the gate ceiling.
export function computeCapacityFitScore(maxHistoricalProject, projectBudget) {
  if (maxHistoricalProject === null) {
    return { points: 15, detail: "Capacity unknown — default mid-range score, not full or zero" };
  }
  const ratio = projectBudget / maxHistoricalProject;
  // ratio near 1 (project close to or under their proven max) = tightest fit.
  // ratio approaching 3 (the gate ceiling) = loosest fit that still passes.
  const points = ratio <= 1 ? 30 : Math.max(0, 30 - ((ratio - 1) / 2) * 30);
  return {
    points: Math.round(points * 100) / 100,
    detail: `Project budget is ${ratio.toFixed(1)}x the NGO's largest proven funding — ${ratio <= 1.2 ? "tight, well-proven fit" : ratio <= 2 ? "moderate fit" : "fit near the capacity ceiling"}`,
  };
}

/**
 * @param {object} ngo - discovered_ngos row
 * @param {object} project - opportunities row
 * @param {object} trustScoreRow - current ngo_trust_scores row for this ngo
 * @param {object} context - { categories, projects, financials, linkedNgo }
 */
export function computeMatchScore(ngo, project, trustScoreRow, { categories = [], projects = [], financials = [], linkedNgo = null } = {}) {
  const gate = passesCapacityGate(ngo, project, { projects, financials });

  if (!gate.pass) {
    return {
      total: null,
      gatePassed: false,
      gateReason: gate.note,
      capacityGate: gate,
    };
  }

  const sectorFit = computeSectorFitScore(ngo, project, categories, projects);
  const locationFit = computeLocationFitScore(ngo, project, projects, linkedNgo);
  const capacityFit = computeCapacityFitScore(gate.maxHistoricalProject, Number(project.budget) || 0);

  const total = Math.round((sectorFit.points + locationFit.points + capacityFit.points) * 100) / 100;

  return {
    total,
    gatePassed: true,
    gateReason: gate.note,
    capacityGate: gate,
    scores: { sectorFit: sectorFit.points, locationFit: locationFit.points, capacityFit: capacityFit.points },
    componentBreakdown: {
      sectorFit: sectorFit.detail,
      locationFit: locationFit.detail,
      capacityFit: capacityFit.detail,
    },
    trustScoreUsed: trustScoreRow?.id ?? null,
  };
}
