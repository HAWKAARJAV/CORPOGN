/**
 * lib/scorer.mjs
 *
 * Computes four 0-100 scores and a composite rank for each enriched NGO.
 *
 * ALL WEIGHTS ARE EXPLICIT CONSTANTS — marked TODO-tunable.
 * After reviewing the first run output, adjust these constants here; no logic changes needed.
 *
 * Score definitions:
 *   transparency_score  — how open/auditable the NGO is
 *   completeness_score  — how complete the profile data is
 *   impact_score        — scale and reach of programs
 *   verification_score  — how many hard credentials are present
 *   composite_rank      — weighted blend used for final ranking
 */

// ─────────────────────────────────────────────────────────────────────────────
// TODO-tunable: all weights live here. Adjust after first run review.
// ─────────────────────────────────────────────────────────────────────────────

// transparency_score components (must sum to 100)
const T_WEIGHTS = {
  give_rating_max_pts: 40,   // Give Discover's 0–5 rating → 0–40 pts
  has_annual_report: 20,     // found at least 1 annual report link
  has_audited_financials: 20,// found audited financials link
  fcra_registered: 20,       // FCRA registration present
};

// completeness_score: number of non-null core fields / total core fields * 100
const COMPLETENESS_CORE_FIELDS = [
  "name",
  "legal_name",
  "registration_number",
  "pan",
  "website",
  "headquarters_address",
  "phone",
  "email",
  "founded_year",
  "org_type",
  // At least 1 category → counted as one field
  "_has_category",
  // At least 1 financial year → counted as one field
  "_has_financials",
];

// impact_score components (must sum to 100)
const I_WEIGHTS = {
  beneficiary_log_max_pts: 40,  // log10(beneficiaries) scaled 0–40 (log10(1M) = 6 → 40)
  programs_max_pts: 25,          // up to 5 programs × 5 pts each
  has_metrics: 20,               // any impact metric found
  years_active_max_pts: 15,      // >10yr=15, 5–10yr=10, <5yr=5, unknown=0
};

// verification_score components (must sum to 100)
const V_WEIGHTS = {
  gold_cert: 40,
  silver_cert: 25,
  bronze_cert: 10,
  fcra: 20,
  pan_present: 15,
  reg_number_present: 10,
  wikipedia_match: 15,
};
// Note: V_WEIGHTS total can exceed 100 — capped at 100 in computation.

// composite_rank weights (must sum to 1.0)
const COMPOSITE_WEIGHTS = {
  transparency: 0.35,
  impact: 0.25,
  verification: 0.25,
  completeness: 0.15,
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Score a single enriched NGO.
 *
 * @param {object} ngo - enriched NGO data from enricher.mjs
 * @returns {{ impactScore, transparencyScore, completenessScore, verificationScore, compositeRank }}
 */
export function scoreNgo(ngo) {
  const transparencyScore = computeTransparency(ngo);
  const completenessScore = computeCompleteness(ngo);
  const impactScore = computeImpact(ngo);
  const verificationScore = computeVerification(ngo);

  const compositeRank =
    COMPOSITE_WEIGHTS.transparency * transparencyScore +
    COMPOSITE_WEIGHTS.impact * impactScore +
    COMPOSITE_WEIGHTS.verification * verificationScore +
    COMPOSITE_WEIGHTS.completeness * completenessScore;

  return {
    impact_score: round2(impactScore),
    transparency_score: round2(transparencyScore),
    completeness_score: round2(completenessScore),
    verification_score: round2(verificationScore),
    composite_rank: round2(compositeRank),
    _score_detail: {
      transparency: { score: round2(transparencyScore), weights: T_WEIGHTS },
      completeness: { score: round2(completenessScore), fieldCount: COMPLETENESS_CORE_FIELDS.length },
      impact: { score: round2(impactScore), weights: I_WEIGHTS },
      verification: { score: round2(verificationScore), weights: V_WEIGHTS },
      composite: { score: round2(compositeRank), weights: COMPOSITE_WEIGHTS },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────

function computeTransparency(ngo) {
  let pts = 0;

  // Give Discover rating (0–5) → 0–40 pts
  const rating = ngo.transparency_rating;
  if (typeof rating === "number" && !isNaN(rating)) {
    pts += (rating / 5) * T_WEIGHTS.give_rating_max_pts;
  }

  // Annual report
  const hasAnnualReport = (ngo.reports ?? []).some((r) => r.report_type === "annual_report");
  if (hasAnnualReport) pts += T_WEIGHTS.has_annual_report;

  // Audited financials
  const hasAuditedFinancials = (ngo.reports ?? []).some((r) => r.report_type === "audited_financials");
  if (hasAuditedFinancials) pts += T_WEIGHTS.has_audited_financials;

  // FCRA
  if (ngo.fcra_registered) pts += T_WEIGHTS.fcra_registered;

  return cap100(pts);
}

function computeCompleteness(ngo) {
  const fieldValues = {
    name: ngo.name,
    legal_name: ngo.legal_name,
    registration_number: ngo.registration_number,
    pan: ngo.pan,
    website: ngo.website,
    headquarters_address: ngo.headquarters_address,
    phone: ngo.phone,
    email: ngo.email,
    founded_year: ngo.founded_year,
    org_type: ngo.org_type,
    _has_category: (ngo.categories ?? []).length > 0,
    _has_financials: (ngo.financials ?? []).length > 0,
  };

  const nonNull = COMPLETENESS_CORE_FIELDS.filter((f) => {
    const v = fieldValues[f];
    return v !== null && v !== undefined && v !== "" && v !== false;
  }).length;

  return cap100((nonNull / COMPLETENESS_CORE_FIELDS.length) * 100);
}

function computeImpact(ngo) {
  let pts = 0;

  // Beneficiary count (log-scaled: log10(1M)=6 → 40pts, log10(100)=2 → 13pts)
  const benMetric = (ngo.metrics ?? []).find((m) =>
    m.metric_name === "beneficiaries_reached" || m.metric_name === "lives_impacted"
  );
  if (benMetric && benMetric.metric_value > 0) {
    const logVal = Math.log10(benMetric.metric_value);
    pts += Math.min((logVal / 6) * I_WEIGHTS.beneficiary_log_max_pts, I_WEIGHTS.beneficiary_log_max_pts);
  }

  // Programs (capped at 5)
  const programCount = Math.min((ngo.programs ?? []).length, 5);
  pts += programCount * (I_WEIGHTS.programs_max_pts / 5);

  // Any impact metrics
  if ((ngo.metrics ?? []).length > 0) pts += I_WEIGHTS.has_metrics;

  // Years active
  if (ngo.founded_year) {
    const yearsActive = new Date().getFullYear() - ngo.founded_year;
    if (yearsActive > 10) pts += I_WEIGHTS.years_active_max_pts;
    else if (yearsActive >= 5) pts += I_WEIGHTS.years_active_max_pts * 0.67;
    else if (yearsActive >= 1) pts += I_WEIGHTS.years_active_max_pts * 0.33;
  }

  return cap100(pts);
}

function computeVerification(ngo) {
  let pts = 0;

  // Certification tier
  const tier = ngo.certification_tier ?? "None";
  if (tier === "Gold") pts += V_WEIGHTS.gold_cert;
  else if (tier === "Silver") pts += V_WEIGHTS.silver_cert;
  else if (tier === "Bronze") pts += V_WEIGHTS.bronze_cert;

  // FCRA
  if (ngo.fcra_registered) pts += V_WEIGHTS.fcra;

  // PAN
  if (ngo.pan) pts += V_WEIGHTS.pan_present;

  // Registration number
  if (ngo.registration_number) pts += V_WEIGHTS.reg_number_present;

  // Wikipedia cross-reference
  if (ngo.wikipedia_match) pts += V_WEIGHTS.wikipedia_match;

  return cap100(pts);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cap100(n) {
  return Math.max(0, Math.min(100, n));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
