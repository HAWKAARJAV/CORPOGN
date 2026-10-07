/**
 * NGO ↔ opportunity fit for the logged-in NGO dashboard.
 * Reuses match-score.mjs when a discovered_ngos row is linked; otherwise
 * scores from live ngos profile fields (focus, geography, beneficiaries).
 */

import {
  computeMatchScore,
  computeSectorFitScore,
  computeLocationFitScore,
} from "./match-score.mjs";

const STOP_WORDS = new Set([
  "about",
  "after",
  "also",
  "been",
  "from",
  "have",
  "into",
  "more",
  "other",
  "such",
  "than",
  "that",
  "their",
  "there",
  "these",
  "this",
  "through",
  "under",
  "with",
  "will",
  "your",
  "year",
  "years",
  "project",
  "program",
  "partnership",
  "csr",
]);

/** Simple keyword tokens from title, description, and focus tags — not LLM extraction. */
export function tokenizeProjectKeywords(project) {
  const chunks = [
    project.title,
    project.description,
    project.focus_area,
    project.csr_focus_area,
    ...(project.sdg_targets ?? []),
    ...(project.target_beneficiaries ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const tokens = new Set();
  for (const raw of chunks.split(/[^a-z0-9]+/)) {
    if (raw.length < 4 || STOP_WORDS.has(raw)) continue;
    tokens.add(raw);
  }
  for (const focus of [project.focus_area, project.csr_focus_area].filter(Boolean)) {
    for (const part of String(focus).toLowerCase().split(/\s+/)) {
      if (part.length >= 3) tokens.add(part);
    }
  }
  return [...tokens];
}

function norm(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

function overlapScore(needles, haystackText) {
  if (!needles.length) return { matched: false, hits: [], points: 0 };
  const hits = needles.filter((n) => haystackText.includes(n));
  const ratio = hits.length / needles.length;
  return { matched: hits.length > 0, hits, points: Math.round(ratio * 100) / 100 };
}

function ngoHaystack(ngo) {
  const focus = (ngo.focus_areas ?? []).map(norm);
  const beneficiaries = (ngo.beneficiary_types ?? []).map(norm);
  return [ngo.mission, ngo.sector_primary, ngo.state, ...focus, ...beneficiaries].map(norm).join(" ");
}

/** @param {object} ngo - live ngos row subset */
export function computeLiveProfileSectorFit(ngo, project, keywords) {
  const focus = norm(project.focus_area);
  const csrFocus = norm(project.csr_focus_area);
  const areas = (ngo.focus_areas ?? []).map(norm);
  const hay = ngoHaystack(ngo);

  let points = 0;
  const matchedTags = [];
  for (const tag of areas) {
    if (!tag) continue;
    if (tag === focus || tag === csrFocus || focus.includes(tag) || tag.includes(focus)) {
      points += 20;
      matchedTags.push(tag);
    }
  }
  points = Math.min(20, points);

  const kw = overlapScore(keywords.slice(0, 12), hay);
  const keywordPoints = Math.min(20, Math.round(kw.hits.length * 5));
  points += keywordPoints;

  return {
    points: Math.min(40, points),
    detail:
      matchedTags.length > 0
        ? `Focus areas overlap: ${matchedTags.join(", ")}${kw.hits.length ? ` · keywords: ${kw.hits.slice(0, 4).join(", ")}` : ""}`
        : kw.hits.length
          ? `Keyword overlap with your profile: ${kw.hits.slice(0, 5).join(", ")}`
          : `No focus-area tag match for "${project.focus_area ?? "—"}"`,
    matchedKeywords: kw.hits,
  };
}

export function computeLiveProfileLocationFit(ngo, project) {
  const projState = norm(project.state);
  const projDistrict = norm(project.district);
  const ngoState = norm(ngo.state);
  const served = (ngo.states_served ?? []).map(norm);

  if (!projState || projState === "pan india") {
    return { points: 28, detail: "Project is Pan India — location is not restrictive" };
  }

  let points = 0;
  if (ngoState && (ngoState === projState || projState.includes(ngoState) || ngoState.includes(projState))) {
    points += 18;
  } else if (served.some((s) => s === projState || projState.includes(s) || s.includes(projState))) {
    points += 15;
  }

  const district = norm(ngo.district);
  if (projDistrict && district && (district.includes(projDistrict) || projDistrict.includes(district))) {
    points += 12;
  }

  return {
    points: Math.min(30, points),
    detail:
      points >= 18
        ? `You operate in ${project.state}${projDistrict ? ` (${project.district})` : ""}`
        : points > 0
          ? `Partial geography overlap with ${project.state}`
          : `No state match for ${project.state} — check if you serve this region`,
  };
}

export function computeBeneficiarySdgFit(ngo, project) {
  const beneficiaries = (ngo.beneficiary_types ?? []).map(norm);
  const targets = (project.target_beneficiaries ?? []).map(norm);
  const sdgs = (project.sdg_targets ?? []).map(norm);
  const hay = ngoHaystack(ngo);

  let points = 0;
  const beneficiaryHits = [];
  for (const t of targets) {
    if (!t) continue;
    const hit = beneficiaries.some((b) => b.includes(t) || t.includes(b)) || hay.includes(t.split(" ")[0] ?? "");
    if (hit) beneficiaryHits.push(t);
  }
  points += Math.min(12, beneficiaryHits.length * 6);

  const sdgHits = sdgs.filter((s) => hay.includes(s.replace("sdg", "").trim()) || hay.includes(s));
  points += Math.min(8, sdgHits.length * 4);

  return {
    points: Math.min(20, points),
    detail:
      beneficiaryHits.length || sdgHits.length
        ? `Beneficiary / SDG alignment${beneficiaryHits.length ? `: ${beneficiaryHits.join(", ")}` : ""}${sdgHits.length ? ` · ${sdgHits.join(", ")}` : ""}`
        : "No beneficiary or SDG tag overlap in your profile",
    beneficiaryHits,
    sdgHits,
  };
}

export function evaluateTrustGate(ngoTrustScore, minRequired) {
  const trust = Math.max(0, Math.round(Number(ngoTrustScore) || 0));
  const min = Math.max(0, Math.round(Number(minRequired) || 0));
  if (min <= 0) {
    return { passed: true, trust, min, detail: "No minimum trust score on this brief" };
  }
  if (trust >= min) {
    return { passed: true, trust, min, detail: `Trust score ${trust} meets corporate minimum (${min})` };
  }
  return {
    passed: false,
    trust,
    min,
    detail: `Trust score ${trust} is below corporate minimum (${min})`,
  };
}

export function fitLabelFromScore(score, { trustGatePassed, capacityGatePassed }) {
  if (!trustGatePassed) return "Below trust minimum";
  if (capacityGatePassed === false) return "Capacity gap";
  if (score >= 75) return "Strong match";
  if (score >= 55) return "Good match";
  if (score >= 35) return "Moderate match";
  return "Limited match";
}

function buildInsight(label, matchedCriteria) {
  const parts = [];
  if (matchedCriteria.sector?.detail) parts.push(matchedCriteria.sector.detail);
  if (matchedCriteria.location?.detail) parts.push(matchedCriteria.location.detail);
  if (matchedCriteria.beneficiaries?.detail) parts.push(matchedCriteria.beneficiaries.detail);
  if (matchedCriteria.trust_gate?.detail) parts.push(matchedCriteria.trust_gate.detail);
  if (matchedCriteria.capacity_gate?.detail) parts.push(matchedCriteria.capacity_gate.detail);
  const body = parts.filter(Boolean).slice(0, 2).join(" ");
  return body || `${label} — based on profile and project requirements (rule-based match model).`;
}

/**
 * @param {object} params
 * @param {object} params.ngo - live ngos row
 * @param {object} params.project - opportunity row
 * @param {number} params.ngoTrustScore
 * @param {object|null} params.matchEngine - result from computeMatchScore + optional trust row
 */
export function scoreOpportunityForNgo({ ngo, project, ngoTrustScore, matchEngine = null }) {
  const keywords = tokenizeProjectKeywords(project);
  const trustGate = evaluateTrustGate(ngoTrustScore, project.min_trust_score);

  /** @type {Record<string, unknown>} */
  const matchedCriteria = {
    trust_gate: trustGate,
    project_keywords: keywords.slice(0, 15),
  };

  let matchScore = 0;
  let scoringSource = "profile_heuristic";
  let capacityGatePassed = true;

  if (matchEngine?.result) {
    scoringSource = "match_engine";
    const result = matchEngine.result;
    capacityGatePassed = Boolean(result.gatePassed);
    matchedCriteria.capacity_gate = {
      passed: result.gatePassed,
      detail: result.gateReason ?? (result.gatePassed ? "Capacity gate passed" : "Capacity gate not passed"),
    };

    if (result.gatePassed && typeof result.total === "number") {
      matchScore = result.total;
      matchedCriteria.sector = {
        points: result.scores?.sectorFit ?? 0,
        detail: result.componentBreakdown?.sectorFit ?? "",
      };
      matchedCriteria.location = {
        points: result.scores?.locationFit ?? 0,
        detail: result.componentBreakdown?.locationFit ?? "",
      };
      matchedCriteria.capacity = {
        points: result.scores?.capacityFit ?? 0,
        detail: result.componentBreakdown?.capacityFit ?? "",
      };
    } else {
      matchScore = 0;
      matchedCriteria.sector = computeLiveProfileSectorFit(ngo, project, keywords);
      matchedCriteria.location = computeLiveProfileLocationFit(ngo, project);
    }
  } else {
    matchedCriteria.sector = computeLiveProfileSectorFit(ngo, project, keywords);
    matchedCriteria.location = computeLiveProfileLocationFit(ngo, project);
    matchedCriteria.beneficiaries = computeBeneficiarySdgFit(ngo, project);
    matchScore = Math.min(
      100,
      Math.round(
        matchedCriteria.sector.points +
          matchedCriteria.location.points +
          matchedCriteria.beneficiaries.points,
      ),
    );
  }

  if (scoringSource === "match_engine" && matchEngine?.result?.gatePassed) {
    const extra = computeBeneficiarySdgFit(ngo, project);
    matchedCriteria.beneficiaries = extra;
    matchScore = Math.min(100, Math.round(matchScore + extra.points * 0.15));
  } else if (scoringSource === "profile_heuristic") {
    // already included
  }

  if (trustGate.passed && trustGate.min > 0) {
    const trustBonus = Math.min(10, Math.round((trustGate.trust / Math.max(trustGate.min, 1)) * 8));
    matchScore = Math.min(100, matchScore + trustBonus);
    matchedCriteria.trust_bonus = { points: trustBonus, detail: trustGate.detail };
  }

  if (!trustGate.passed) {
    matchScore = Math.min(matchScore, Math.max(10, Math.round((trustGate.trust / trustGate.min) * 45)));
  }

  if (!capacityGatePassed) {
    matchScore = Math.min(matchScore, 30);
  }

  matchScore = Math.max(0, Math.min(100, Math.round(matchScore)));
  const fitLabel = fitLabelFromScore(matchScore, { trustGatePassed: trustGate.passed, capacityGatePassed });
  const fitInsight = buildInsight(fitLabel, matchedCriteria);

  return {
    matchScore,
    fitLabel,
    fitInsight,
    matchedCriteria,
    scoringSource,
    capacityGatePassed,
    trustGatePassed: trustGate.passed,
  };
}

/**
 * Adapter: run admin match engine for a claimed discovered NGO + opportunity.
 */
export function scoreWithMatchEngine(discoveredNgo, project, trustScoreRow, context) {
  const categories = (context.categories ?? []).map((c) =>
    typeof c === "string" ? { category: c } : c,
  );
  return computeMatchScore(discoveredNgo, project, trustScoreRow, {
    categories,
    projects: context.projects ?? [],
    financials: context.financials ?? [],
    linkedNgo: context.linkedNgo ?? null,
  });
}

export { computeSectorFitScore, computeLocationFitScore };
