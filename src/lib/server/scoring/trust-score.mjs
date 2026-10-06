/**
 * lib/scoring/trust-score.mjs
 *
 * Trust Score — intrinsic to the NGO, independent of any specific project.
 * Computed by a periodic BATCH job (scripts/ngo-discovery/run-trust-score-batch.mjs),
 * never per-request. Keyed on discovered_ngos.id.
 *
 * ── ANTI-BIAS RULE (the single most important thing in this file) ─────────
 * Missing data is NOT the same as confirmed-bad data. For every sub-check:
 *   - CONFIRMED-NEGATIVE (explicitly shows non-compliant/cancelled) → 0 pts
 *   - CONFIRMED-POSITIVE (explicitly shows active/valid)            → full pts
 *   - UNKNOWN (field is null, nothing found either way)             → partial
 *     credit (UNKNOWN_FRACTION of that sub-check's max), never zero.
 * A small, less digitally-visible NGO with sparse records must not be scored
 * as if it were confirmed non-compliant — that's legitimacy-by-marketing-
 * budget bias, exactly what this is designed to avoid.
 *
 * Explicitly EXCLUDED as signals, even informally: social follower counts,
 * website polish, name recognition, news-article mentions. These track
 * marketing spend, not legitimacy or delivery capability.
 */

const UNKNOWN_FRACTION = 0.45; // 40-50% of a sub-check's max, per spec

export const WEIGHTS = {
  // TODO-tunable — reasoned starting points, not researched-optimal values.
  // Revisit once scoring_runs.admin_override_notes gives real signal.
  compliance: 25,
  verification: 20,
  transparency: 20,
  csrTrackRecord: 20,
  trackRecordDepth: 15,
};

/** @returns {{points:number, state:'confirmed_positive'|'confirmed_negative'|'unknown', detail:string}} */
function subCheck(state, maxPoints, detail) {
  const points =
    state === "confirmed_positive" ? maxPoints :
    state === "confirmed_negative" ? 0 :
    Math.round(maxPoints * UNKNOWN_FRACTION * 100) / 100;
  return { points, state, detail };
}

const looksLikeJunkProjectName = (name) => {
  if (!name) return true;
  if (name.length > 220) return true;
  return /[{}<>;]|function\s*\(|@media|grid-template|:\s*hover|\\\d/.test(name);
};

// ── Compliance (25 pts) ─────────────────────────────────────────────────
// FCRA active(7) + 12A valid(6) + 80G valid(6) + CSR-1 registered(6)
export function computeComplianceScore(ngo, linkedNgo) {
  const checks = {};

  // FCRA: discovered_ngos has no explicit active/cancelled state today,
  // only presence/absence of a number — so this rarely produces a
  // confirmed_negative, which is correct: absence of a captured number is
  // not proof the NGO lacks FCRA registration.
  checks.fcra = subCheck(
    ngo.fcra_number ? "confirmed_positive" : "unknown",
    7,
    ngo.fcra_number ? `FCRA number on record (${ngo.fcra_number})` : "No FCRA number captured for this NGO — status unknown, not absent",
  );

  // 12A / 80G only exist on the live ngos table, reachable via claimed_ngo_id.
  checks.cert12a = subCheck(
    linkedNgo?.cert_12a ? "confirmed_positive" : "unknown",
    6,
    linkedNgo?.cert_12a ? `12A: ${linkedNgo.cert_12a}` : "12A status unknown (no linked live NGO record, or field not captured there)",
  );
  checks.cert80g = subCheck(
    linkedNgo?.cert_80g ? "confirmed_positive" : "unknown",
    6,
    linkedNgo?.cert_80g ? `80G: ${linkedNgo.cert_80g}` : "80G status unknown (no linked live NGO record, or field not captured there)",
  );

  // csr_eligible is a real tri-state boolean (true/false/null) on discovered_ngos.
  const csrState = ngo.csr_eligible === true ? "confirmed_positive" : ngo.csr_eligible === false ? "confirmed_negative" : "unknown";
  checks.csr1 = subCheck(
    csrState,
    6,
    ngo.csr_eligible === true ? "CSR-1 eligible (confirmed)" : ngo.csr_eligible === false ? "Explicitly not CSR-1 eligible" : "CSR-1 eligibility unknown",
  );

  const points = Object.values(checks).reduce((sum, c) => sum + c.points, 0);
  return { points: Math.round(points * 100) / 100, checks };
}

// ── Verification (20 pts) ────────────────────────────────────────────────
// Independent certifying bodies AGREEING matters more than one tier level.
export function computeVerificationScore(ngo) {
  const checks = {};

  const tierPoints = { Gold: 10, Silver: 6, Bronze: 3 };
  checks.giveDiscoverTier = ngo.certification_tier && tierPoints[ngo.certification_tier] !== undefined
    ? subCheck("confirmed_positive", tierPoints[ngo.certification_tier], `Give Discover tier: ${ngo.certification_tier}`)
    : subCheck("unknown", 10, "No Give Discover certification tier on record");

  // GuideStar India is not currently a data source in this pipeline (no
  // accessible endpoint was found) — this always resolves to unknown until
  // that changes. Kept as a real check, not removed, so it activates
  // automatically once a guidestar_certification_tier field exists.
  checks.guideStarTier = subCheck("unknown", 6, "GuideStar India is not an active data source yet");

  // Wikipedia cross-match is a bonus, not a required component — capped.
  checks.wikipediaBonus = { points: ngo.wikipedia_match === true ? 4 : 0, state: ngo.wikipedia_match === true ? "confirmed_positive" : "not_present", detail: ngo.wikipedia_match === true ? "Wikipedia cross-match confirmed" : "No Wikipedia cross-match" };

  const points = Math.min(20, checks.giveDiscoverTier.points + checks.guideStarTier.points + checks.wikipediaBonus.points);
  return { points: Math.round(points * 100) / 100, checks };
}

// ── Transparency (20 pts) ─────────────────────────────────────────────────
export function computeTransparencyScore(ngo, financials, reports) {
  const checks = {};

  checks.auditedFinancials = subCheck(
    financials.length > 0 ? "confirmed_positive" : "unknown",
    8,
    financials.length > 0 ? `${financials.length} year(s) of financials on record` : "No financial records found",
  );

  const hasReportLink = reports.length > 0 || Boolean(ngo.givedo_annual_report_doc_url);
  checks.annualReport = subCheck(
    hasReportLink ? "confirmed_positive" : "unknown",
    6,
    hasReportLink ? "Annual report / disclosure document link on record" : "No annual report link found",
  );

  let consistencyState = "unknown";
  let consistencyDetail = "Fewer than 2 years of financials — cannot assess year-over-year consistency";
  if (financials.length >= 2) {
    const sorted = [...financials].sort((a, b) => a.year - b.year);
    let wildSwing = false;
    for (let i = 1; i < sorted.length; i++) {
      const prev = Number(sorted[i - 1].total_income) || 0;
      const cur = Number(sorted[i].total_income) || 0;
      if (prev > 0 && Math.abs(cur - prev) / prev > 3) wildSwing = true; // >300% swing
    }
    consistencyState = wildSwing ? "confirmed_negative" : "confirmed_positive";
    consistencyDetail = wildSwing ? "Large unexplained year-over-year swing in reported income" : "Reported income is consistent year-over-year";
  }
  checks.consistency = subCheck(consistencyState, 6, consistencyDetail);

  const points = Object.values(checks).reduce((sum, c) => sum + c.points, 0);
  return { points: Math.round(points * 100) / 100, checks };
}

// ── CSR track record (20 pts) — from discovered_ngo_csr_disclosures ───────
// NOTE: this table currently has 0 rows and no ngo_id linkage at all (the
// bulk government dataset has no implementing-agency name field to match
// against an NGO — see prior findings). This function is real, working
// logic that will activate the moment that data exists; today it always
// returns "unknown" for every NGO, uniformly, which is the honest and
// correct behavior under the anti-bias rule (not a fabricated default).
export function computeCsrTrackRecordScore(disclosures) {
  if (!disclosures.length) {
    return {
      points: Math.round(20 * UNKNOWN_FRACTION * 100) / 100,
      checks: { disclosures: subCheck("unknown", 20, "No government CSR disclosures linked to this NGO — matching pipeline not implemented yet") },
    };
  }

  const distinctPartners = new Set(disclosures.map((d) => d.company_name)).size;
  const totalAmount = disclosures.reduce((sum, d) => sum + (Number(d.amount_spent_inr) || 0), 0);
  const mostRecentYear = Math.max(...disclosures.map((d) => parseInt(String(d.financial_year).slice(0, 4), 10) || 0));
  const currentYear = new Date().getFullYear();
  const recencyFactor = mostRecentYear >= currentYear - 2 ? 1 : mostRecentYear >= currentYear - 4 ? 0.6 : 0.3;

  const diversificationScore = Math.min(10, distinctPartners * 2.5); // up to 4 distinct partners = full
  const amountScore = Math.min(10, Math.log10(Math.max(1, totalAmount)) * 1.5); // log-scaled, not linear
  const points = Math.round((diversificationScore + amountScore) * recencyFactor * 100) / 100;

  return {
    points,
    checks: {
      disclosures: subCheck("confirmed_positive", 20, `${distinctPartners} distinct corporate partner(s), ₹${totalAmount.toLocaleString("en-IN")} total disclosed, most recent FY ${mostRecentYear}`),
    },
  };
}

// ── Track record depth (15 pts) ────────────────────────────────────────────
export function computeTrackRecordDepthScore(ngo, projects, financials) {
  const checks = {};

  const yearsActive = ngo.founded_year ? new Date().getFullYear() - ngo.founded_year : null;
  checks.yearsActive = yearsActive !== null
    ? subCheck("confirmed_positive", 6, `${yearsActive} years active`, )
    : subCheck("unknown", 6, "Founded year not on record");
  if (yearsActive !== null) checks.yearsActive.points = Math.min(6, (yearsActive / 10) * 6);

  const realProjects = projects.filter((p) => !looksLikeJunkProjectName(p.name));
  checks.projectCount = realProjects.length > 0
    ? subCheck("confirmed_positive", 5, `${realProjects.length} distinct project(s) on record`)
    : subCheck("unknown", 5, "No verifiable project history on record");
  if (realProjects.length > 0) checks.projectCount.points = Math.min(5, realProjects.length * 1.25);

  const fundingSourceTypes = new Set();
  if (ngo.givedo_lifetime_raised_inr > 0) fundingSourceTypes.add("crowdfunding");
  if (financials.length > 0) fundingSourceTypes.add("institutional_disclosed");
  if (realProjects.some((p) => p.funding_amount_source === "corporate_partner_disclosed")) fundingSourceTypes.add("csr");
  checks.fundingDiversity = fundingSourceTypes.size > 0
    ? subCheck("confirmed_positive", 4, `${fundingSourceTypes.size} distinct funding source type(s): ${[...fundingSourceTypes].join(", ")}`)
    : subCheck("unknown", 4, "No funding source type data on record");
  if (fundingSourceTypes.size > 0) checks.fundingDiversity.points = Math.min(4, fundingSourceTypes.size * 1.5);

  const points = Object.values(checks).reduce((sum, c) => sum + c.points, 0);
  return { points: Math.round(points * 100) / 100, checks };
}

/**
 * @param {object} ngo - discovered_ngos row
 * @param {object|null} linkedNgo - live ngos row via claimed_ngo_id, if linked
 * @param {Array} projects - discovered_ngo_projects rows for this ngo
 * @param {Array} financials - discovered_ngo_financials rows for this ngo
 * @param {Array} reports - discovered_ngo_reports rows for this ngo
 * @param {Array} disclosures - discovered_ngo_csr_disclosures rows (currently always [])
 */
export function computeTrustScore(ngo, { linkedNgo = null, projects = [], financials = [], reports = [], disclosures = [] } = {}) {
  const compliance = computeComplianceScore(ngo, linkedNgo);
  const verification = computeVerificationScore(ngo);
  const transparency = computeTransparencyScore(ngo, financials, reports);
  const csrTrackRecord = computeCsrTrackRecordScore(disclosures);
  const trackRecordDepth = computeTrackRecordDepthScore(ngo, projects, financials);

  const total = Math.round(
    (compliance.points + verification.points + transparency.points + csrTrackRecord.points + trackRecordDepth.points) * 100,
  ) / 100;

  const completeness = calculateDataCompleteness(ngo, linkedNgo, projects, financials, disclosures);

  const componentBreakdown = {
    compliance: summarize(compliance.checks),
    verification: summarize(verification.checks),
    transparency: summarize(transparency.checks),
    csrTrackRecord: summarize(csrTrackRecord.checks),
    trackRecordDepth: summarize(trackRecordDepth.checks),
  };

  return {
    scores: {
      compliance: compliance.points,
      verification: verification.points,
      transparency: transparency.points,
      csrTrackRecord: csrTrackRecord.points,
      trackRecordDepth: trackRecordDepth.points,
    },
    total,
    completeness,
    componentBreakdown,
  };
}

function summarize(checks) {
  return Object.entries(checks).map(([key, c]) => `${key}: ${c.detail}`).join(" · ");
}

function calculateDataCompleteness(ngo, linkedNgo, projects, financials, disclosures) {
  const fields = [
    ngo.registration_number, ngo.pan, ngo.fcra_number, ngo.founded_year,
    ngo.website, ngo.headquarters_address, ngo.certification_tier,
    linkedNgo?.cert_12a ?? null, linkedNgo?.cert_80g ?? null,
    projects.length > 0 ? "x" : null,
    financials.length > 0 ? "x" : null,
    disclosures.length > 0 ? "x" : null,
  ];
  const nonNull = fields.filter((f) => f !== null && f !== undefined && f !== "").length;
  return Math.round((nonNull / fields.length) * 10000) / 100;
}
