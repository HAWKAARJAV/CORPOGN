/**
 * scripts/ngo-enrichment/lib/scorer.mjs
 *
 * Calculates all completeness and trust scores for an NGO after enrichment.
 * Returns a scores object ready to write back to public.ngos.
 *
 * Score Categories (each 0–100):
 *  - profileCompleteness  — weighted fill-rate of core fields
 *  - transparencyScore    — website, social, leadership, annual reports
 *  - verificationScore    — legal IDs and registrations present
 *  - documentationScore   — documents uploaded/verified
 *  - financialCompleteness — financial data available
 *  - projectCompleteness  — projects documented
 *  - overallTrustScore    — weighted blend of all above
 */

/** Each domain: { fields: [col, weight], maxScore } */
const PROFILE_DOMAINS = {
  organisation: {
    weight: 25,
    checks: [
      { field: "description",      w: 15 },
      { field: "mission",          w: 12 },
      { field: "vision",           w:  8 },
      { field: "founded_year",     w:  8 },
      { field: "founder_name",     w:  7 },
      { field: "logo_url",         w:  6 },
      { field: "ceo_name",         w:  5 },
      { field: "history",          w:  5 },
      { field: "leadership_team",  w: 10, isArray: true },
      { field: "trustees",         w:  8, isArray: true },
      { field: "website",          w: 16 },
    ],
  },
  contact: {
    weight: 20,
    checks: [
      { field: "email_public",         w: 20 },
      { field: "phone",                w: 15 },
      { field: "address_head_office",  w: 20 },
      { field: "state",                w: 15 },
      { field: "district",             w: 10 },
      { field: "pincode",              w:  8 },
      { field: "geo_lat",              w:  6 },
      { field: "website",              w:  6 },
    ],
  },
  registration: {
    weight: 20,
    checks: [
      { field: "registration_number", w: 22 },
      { field: "pan_number",          w: 18 },
      { field: "cert_12a",            w: 16 },
      { field: "cert_80g",            w: 16 },
      { field: "fcra_number",         w: 14 },
      { field: "ngo_darpan_id",       w: 10 },
      { field: "legal_status",        w:  4 },
    ],
  },
  sectors: {
    weight: 10,
    checks: [
      { field: "sector_primary",    w: 35 },
      { field: "sectors_secondary", w: 25, isArray: true },
      { field: "sdgs",              w: 20, isArray: true },
      { field: "csr_focus_areas",   w: 20, isArray: true },
    ],
  },
  social: {
    weight: 5,
    checks: [
      { field: "linkedin_url",   w: 35 },
      { field: "facebook_url",   w: 25 },
      { field: "youtube_url",    w: 20 },
      { field: "instagram_url",  w: 10 },
      { field: "twitter_url",    w: 10 },
    ],
  },
};

/**
 * @param {object} ngo — full NGO row from DB (after enrichment)
 * @param {number} financialYearCount — rows in ngo_financials for this NGO
 * @param {number} projectCount — rows in ngo_projects for this NGO
 * @param {number} documentCount — rows in ngo_documents for this NGO
 * @returns {{ profileCompleteness, transparencyScore, verificationScore, documentationScore, financialCompleteness, projectCompleteness, overallTrustScore }}
 */
export function calculateScores(ngo, financialYearCount = 0, projectCount = 0, documentCount = 0) {
  const profileCompleteness = calcProfileCompleteness(ngo);
  const transparencyScore   = calcTransparencyScore(ngo, documentCount);
  const verificationScore   = calcVerificationScore(ngo);
  const documentationScore  = calcDocumentationScore(ngo, documentCount);
  const financialCompleteness = calcFinancialCompleteness(ngo, financialYearCount);
  const projectCompleteness = calcProjectCompleteness(ngo, projectCount);

  const overallTrustScore = clamp(Math.round(
    profileCompleteness  * 0.25 +
    transparencyScore    * 0.15 +
    verificationScore    * 0.25 +
    documentationScore   * 0.10 +
    financialCompleteness * 0.15 +
    projectCompleteness  * 0.10
  ));

  return {
    profile_completeness:   profileCompleteness,
    transparency_score:     transparencyScore,
    verification_score:     verificationScore,
    documentation_score:    documentationScore,
    financial_completeness: financialCompleteness,
    project_completeness:   projectCompleteness,
    overall_trust_score:    overallTrustScore,
    // also update the legacy trust_score column used by matchmaking
    trust_score:            overallTrustScore,
  };
}

function calcProfileCompleteness(ngo) {
  let totalWeight = 0;
  let earnedWeight = 0;

  for (const domain of Object.values(PROFILE_DOMAINS)) {
    for (const check of domain.checks) {
      totalWeight += check.w;
      const val = ngo[check.field];
      if (check.isArray) {
        if (Array.isArray(val) && val.length > 0) earnedWeight += check.w;
      } else {
        if (val !== null && val !== undefined && val !== "") earnedWeight += check.w;
      }
    }
  }

  return totalWeight > 0 ? clamp(Math.round((earnedWeight / totalWeight) * 100)) : 0;
}

function calcTransparencyScore(ngo, documentCount) {
  let score = 0;
  if (ngo.website)       score += 20;
  if (ngo.description)   score += 10;
  if (ngo.mission)       score += 10;
  if (ngo.linkedin_url || ngo.facebook_url) score += 10;
  if (ngo.youtube_url)   score +=  5;
  if (hasArray(ngo.leadership_team)) score += 15;
  if (hasArray(ngo.trustees))        score +=  5;
  if (documentCount >= 1) score += 10;
  if (documentCount >= 3) score += 10;
  if (ngo.founder_name)  score +=  5;
  return clamp(score);
}

function calcVerificationScore(ngo) {
  let score = 0;
  if (ngo.registration_number) score += 20;
  if (ngo.pan_number)          score += 15;
  if (ngo.cert_12a)            score += 20;
  if (ngo.cert_80g)            score += 20;
  if (ngo.fcra_number)         score += 15;
  if (ngo.ngo_darpan_id)       score += 10;
  // Status bonus
  if (ngo.access_status === "verified" || ngo.access_status === "active") score += 10;
  return clamp(score);
}

function calcDocumentationScore(ngo, documentCount) {
  let score = 0;
  if (documentCount >= 1) score += 15;
  if (documentCount >= 2) score += 15;
  if (documentCount >= 4) score += 20;
  if (documentCount >= 6) score += 20;
  // Specific docs
  if (ngo.registration_data?.annualReport)  score += 10;
  if (ngo.registration_data?.auditReport)   score += 10;
  if (ngo.registration_data?.csr1Certificate) score += 10;
  return clamp(score);
}

function calcFinancialCompleteness(ngo, financialYearCount) {
  let score = 0;
  if (financialYearCount >= 1) score += 35;
  if (financialYearCount >= 2) score += 25;
  if (financialYearCount >= 3) score += 20;
  if (ngo.employee_count)  score += 10;
  if (ngo.volunteer_count) score +=  5;
  if (ngo.year_of_establishment || ngo.founded_year) score += 5;
  return clamp(score);
}

function calcProjectCompleteness(ngo, projectCount) {
  let score = 0;
  if (projectCount >= 1)  score += 30;
  if (projectCount >= 3)  score += 25;
  if (projectCount >= 5)  score += 20;
  if (projectCount >= 10) score += 15;
  // Field hints
  if (hasArray(ngo.states_served))    score +=  5;
  if (ngo.villages_covered)           score +=  5;
  return clamp(score);
}

function hasArray(val) {
  return Array.isArray(val) && val.length > 0;
}

function clamp(val) {
  return Math.max(0, Math.min(100, val));
}
