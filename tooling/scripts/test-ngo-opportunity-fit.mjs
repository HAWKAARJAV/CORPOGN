/**
 * Sanity check: demo-style NGO profile vs sample opportunities (no DB).
 * Run: node tooling/scripts/test-ngo-opportunity-fit.mjs
 */
import assert from "node:assert/strict";
import { scoreOpportunityForNgo } from "../../src/lib/server/scoring/ngo-opportunity-fit.mjs";

const demoNgo = {
  id: "ngo-demo",
  state: "Karnataka",
  district: "Bengaluru Urban",
  mission: "Digital learning and education for underserved students",
  focus_areas: ["Education", "Digital literacy", "Women & girls"],
  beneficiary_types: ["School students", "Women & girls"],
  sector_primary: "Education",
  states_served: ["Karnataka"],
};

const strongOpp = {
  id: "opp-1",
  title: "Digital Education CSR Partnership",
  description: "Deploy digital learning infrastructure for underserved students across districts.",
  focus_area: "Education",
  csr_focus_area: "Digital Education",
  budget: 5_000_000,
  state: "Karnataka",
  district: "Bengaluru Urban",
  sdg_targets: ["SDG 4"],
  target_beneficiaries: ["School students grades 6–10"],
  min_trust_score: 40,
};

const weakOpp = {
  id: "opp-2",
  title: "Wildlife conservation",
  description: "Habitat restoration in the Western Ghats.",
  focus_area: "Environment",
  budget: 20_000_000,
  state: "Kerala",
  min_trust_score: 90,
};

const strong = scoreOpportunityForNgo({
  ngo: demoNgo,
  project: strongOpp,
  ngoTrustScore: 72,
  matchEngine: null,
});

const weak = scoreOpportunityForNgo({
  ngo: demoNgo,
  project: weakOpp,
  ngoTrustScore: 72,
  matchEngine: null,
});

assert.ok(strong.matchScore > weak.matchScore, "education/Karnataka opp should score higher");
assert.equal(strong.trustGatePassed, true);
assert.equal(weak.trustGatePassed, false);
assert.ok(strong.matchScore >= 55, "strong opp should be at least good match tier");
assert.ok(weak.fitLabel === "Below trust minimum" || weak.matchScore <= 45);

console.log("OK ngo-opportunity-fit sanity check");
console.log("  strong:", strong.matchScore, strong.fitLabel);
console.log("  weak:", weak.matchScore, weak.fitLabel);
