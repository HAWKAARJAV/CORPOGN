import assert from "node:assert/strict";
import {
  computeComplianceScore, computeVerificationScore, computeTransparencyScore,
  computeCsrTrackRecordScore, computeTrackRecordDepthScore, computeTrustScore,
} from "../../../src/lib/scoring/trust-score.mjs";

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  ${name}\n        ${err.message}`);
    failed++;
  }
}

// ── Fixture 1: fully-compliant NGO ─────────────────────────────────────────
const compliantNgo = {
  fcra_number: "12345", founded_year: 2010, certification_tier: "Gold",
  wikipedia_match: true, csr_eligible: true, givedo_lifetime_raised_inr: 5000000,
};
const compliantLinked = { cert_12a: "Registered", cert_80g: "Registered" };
const compliantProjects = [
  { name: "Real project one", description: "did real work", funding_amount_source: "corporate_partner_disclosed" },
  { name: "Real project two", description: "did more real work" },
];
const compliantFinancials = [
  { year: 2022, total_income: 1000000 },
  { year: 2023, total_income: 1100000 },
];

// ── Fixture 2: confirmed non-compliant (explicit negatives) ────────────────
const nonCompliantNgo = { fcra_number: null, founded_year: 2020, certification_tier: null, wikipedia_match: false, csr_eligible: false, givedo_lifetime_raised_inr: 0 };
const wildSwingFinancials = [{ year: 2022, total_income: 1000000 }, { year: 2023, total_income: 5000000 }]; // >300% swing

// ── Fixture 3: all-fields-unknown ───────────────────────────────────────────
const unknownNgo = { fcra_number: null, founded_year: null, certification_tier: null, wikipedia_match: null, csr_eligible: null, givedo_lifetime_raised_inr: null };

console.log("\n=== computeComplianceScore ===");
test("fully compliant scores full 25 (6 csr1 + 7 fcra + 6+6 certs)", () => {
  const r = computeComplianceScore(compliantNgo, compliantLinked);
  assert.equal(r.points, 25);
});
test("confirmed csr_eligible=false scores 0 for that sub-check, not partial", () => {
  const r = computeComplianceScore(nonCompliantNgo, null);
  assert.equal(r.checks.csr1.points, 0);
  assert.equal(r.checks.csr1.state, "confirmed_negative");
});
test("all-unknown NGO gets PARTIAL credit on every sub-check, never zero", () => {
  const r = computeComplianceScore(unknownNgo, null);
  assert.ok(r.points > 0, `expected > 0, got ${r.points}`);
  assert.equal(r.checks.fcra.state, "unknown");
  assert.ok(r.checks.fcra.points > 0 && r.checks.fcra.points < 7, "fcra unknown should be partial, not 0 or full");
});

console.log("\n=== computeTransparencyScore ===");
test("wild year-over-year swing is confirmed_negative, not just low", () => {
  const r = computeTransparencyScore(compliantNgo, wildSwingFinancials, []);
  assert.equal(r.checks.consistency.state, "confirmed_negative");
  assert.equal(r.checks.consistency.points, 0);
});
test("fewer than 2 years of financials -> consistency is unknown (partial), not penalized as negative", () => {
  const r = computeTransparencyScore(compliantNgo, [{ year: 2023, total_income: 100 }], []);
  assert.equal(r.checks.consistency.state, "unknown");
  assert.ok(r.checks.consistency.points > 0);
});

console.log("\n=== computeCsrTrackRecordScore ===");
test("empty disclosures (today's reality for all 206 NGOs) -> uniform partial credit, not zero", () => {
  const r = computeCsrTrackRecordScore([]);
  assert.ok(r.points > 0 && r.points < 20);
});
test("real, recent disclosures with multiple partners score higher than empty", () => {
  const currentYear = new Date().getFullYear();
  const disclosures = [
    { company_name: "Acme Corp", amount_spent_inr: 5000000, financial_year: `${currentYear}-${String(currentYear + 1).slice(2)}` },
    { company_name: "Beta Inc", amount_spent_inr: 3000000, financial_year: `${currentYear}-${String(currentYear + 1).slice(2)}` },
  ];
  const r = computeCsrTrackRecordScore(disclosures);
  const empty = computeCsrTrackRecordScore([]);
  assert.ok(r.points > empty.points, `recent disclosures (${r.points}) should beat empty/unknown (${empty.points})`);
});
test("stale disclosures (4+ years old) score lower than recent ones due to recency decay, per spec", () => {
  const disclosures = [{ company_name: "Old Corp", amount_spent_inr: 5000000, financial_year: "2018-19" }];
  const r = computeCsrTrackRecordScore(disclosures);
  const currentYear = new Date().getFullYear();
  const recentDisclosures = [{ company_name: "Old Corp", amount_spent_inr: 5000000, financial_year: `${currentYear}-${String(currentYear + 1).slice(2)}` }];
  const recent = computeCsrTrackRecordScore(recentDisclosures);
  assert.ok(r.points < recent.points, "stale partnership should score lower than an identical recent one");
});

console.log("\n=== computeTrackRecordDepthScore ===");
test("junk project names (CSS/JS fragments) are filtered out, don't inflate score", () => {
  const junkProjects = [
    { name: "@media (min-width: 768px) { .grid { display: flex; } }" },
    { name: "function(){ return true; }" },
  ];
  const withJunkOnly = computeTrackRecordDepthScore(unknownNgo, junkProjects, []);
  const withNone = computeTrackRecordDepthScore(unknownNgo, [], []);
  assert.equal(withJunkOnly.checks.projectCount.points, withNone.checks.projectCount.points, "junk projects should not count toward project depth");
});
test("real projects score higher project-count credit than none", () => {
  const r = computeTrackRecordDepthScore(unknownNgo, compliantProjects, []);
  const none = computeTrackRecordDepthScore(unknownNgo, [], []);
  assert.ok(r.checks.projectCount.points > none.checks.projectCount.points);
});

console.log("\n=== computeTrustScore (full integration) ===");
test("fully-compliant NGO scores meaningfully higher than all-unknown NGO", () => {
  const compliant = computeTrustScore(compliantNgo, { linkedNgo: compliantLinked, projects: compliantProjects, financials: compliantFinancials });
  const unknown = computeTrustScore(unknownNgo, {});
  assert.ok(compliant.total > unknown.total, `compliant (${compliant.total}) should beat unknown (${unknown.total})`);
});
test("all-unknown NGO still scores meaningfully above zero (anti-bias floor)", () => {
  const unknown = computeTrustScore(unknownNgo, {});
  assert.ok(unknown.total > 30, `expected > 30 (partial credit across all components), got ${unknown.total}`);
});
test("data_completeness_pct reflects sparse data honestly (well below 100 for unknown fixture)", () => {
  const unknown = computeTrustScore(unknownNgo, {});
  assert.ok(unknown.completeness < 50, `expected low completeness, got ${unknown.completeness}`);
});

console.log(`\n${passed} passed, ${failed} failed.\n`);
process.exit(failed > 0 ? 1 : 0);
