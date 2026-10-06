import { supabaseAdmin } from "@/lib/supabase-admin";

export type ProjectTrustFactor =
  | "sectorMatch"
  | "budgetMatch"
  | "locationMatch"
  | "impact"
  | "compliance"
  | "financialStability"
  | "transparency"
  | "pastCsrPartnerships"
  | "organizationScale"
  | "recentActivity";

export type ProjectTrustBreakdown = Record<ProjectTrustFactor, number>;

export type ProjectTrustScore = {
  opportunityId: string;
  ngoId: string;
  ngoName: string;
  overallScore: number;
  breakdown: ProjectTrustBreakdown;
  whyRecommended: string;
  keyStrengths: string[];
  pastSimilarProjects: string;
  budgetExperience: string;
  complianceStatus: string;
};

type OpportunityRecord = Record<string, unknown> & {
  id: string;
  title: string;
  focus_area: string;
  budget: number;
  state?: string | null;
  district?: string | null;
  duration_months?: number | null;
  description?: string | null;
};

type NgoRecord = Record<string, unknown> & {
  id: string;
  ngo_name: string;
  access_status?: string | null;
  trust_score?: number | null;
  registration_data?: Record<string, unknown> | null;
};

const WEIGHTS: Record<ProjectTrustFactor, number> = {
  sectorMatch: 14,
  budgetMatch: 12,
  locationMatch: 9,
  impact: 10,
  compliance: 14,
  financialStability: 8,
  transparency: 8,
  pastCsrPartnerships: 12,
  organizationScale: 7,
  recentActivity: 6,
};

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function haystack(ngo: NgoRecord) {
  const reg = ngo.registration_data ?? {};
  return [
    ngo.ngo_name,
    ngo.focus_areas,
    ngo.beneficiary_types,
    ngo.mission,
    ngo.state,
    reg.focusArea,
    reg.focusAreas,
    reg.sector,
    reg.state,
    reg.district,
    reg.mission,
  ]
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .map(text)
    .join(" ")
    .toLowerCase();
}

function hasAny(ngo: NgoRecord, keys: string[]) {
  const reg = ngo.registration_data ?? {};
  return keys.some((key) => Boolean(text(ngo[key]) || text(reg[key]) || ngo[key] === true || reg[key] === true));
}

function complianceScore(ngo: NgoRecord) {
  const checks = [
    hasAny(ngo, ["csr1Certificate", "csr_1", "csr1", "csrRegistration", "csr_registration_number"]),
    hasAny(ngo, ["fcra", "fcra_status", "fcraRegistration", "fcra_registration_number"]),
    hasAny(ngo, ["certificate80g", "eightyG", "80g", "certificate_80g"]),
    hasAny(ngo, ["certificate12a", "twelveA", "12a", "certificate_12a"]),
  ];
  const verifiedBoost = ngo.access_status === "active" || ngo.access_status === "verified" ? 10 : 0;
  return clampScore((checks.filter(Boolean).length / checks.length) * 90 + verifiedBoost);
}

function projectCount(ngo: NgoRecord) {
  return Math.max(
    numberValue(ngo.projects_completed),
    numberValue(ngo.completed_projects),
    numberValue(ngo.registration_data?.projectsCompleted),
    numberValue(ngo.registration_data?.projects_completed),
  );
}

function sectorScore(opportunity: OpportunityRecord, ngo: NgoRecord) {
  const sector = text(opportunity.focus_area).toLowerCase();
  if (!sector) return 55;
  const source = haystack(ngo);
  if (source.includes(sector)) return 95;
  const sectorWords = sector.split(/\s+/).filter((word) => word.length > 3);
  const matches = sectorWords.filter((word) => source.includes(word)).length;
  return clampScore(45 + matches * 18 + Math.min(projectCount(ngo), 5) * 3);
}

function budgetScore(opportunity: OpportunityRecord, ngo: NgoRecord) {
  const budget = numberValue(opportunity.budget);
  const experience = Math.max(
    numberValue(ngo.max_project_budget),
    numberValue(ngo.annual_revenue),
    numberValue(ngo.registration_data?.maxProjectBudget),
    numberValue(ngo.registration_data?.annualBudget),
    numberValue(ngo.registration_data?.revenue),
  );
  if (!budget || !experience) return clampScore(50 + Math.min(projectCount(ngo), 8) * 4);
  const ratio = Math.min(budget, experience) / Math.max(budget, experience);
  return clampScore(45 + ratio * 55);
}

function locationScore(opportunity: OpportunityRecord, ngo: NgoRecord) {
  const state = text(opportunity.state).toLowerCase();
  const district = text(opportunity.district).toLowerCase();
  const reg = ngo.registration_data ?? {};
  const ngoState = [ngo.state, reg.state, reg.operatingState].map(text).join(" ").toLowerCase();
  const ngoDistrict = [ngo.district, reg.district, reg.operatingDistrict].map(text).join(" ").toLowerCase();
  if (!state || state === "pan india") return 82;
  if (district && ngoDistrict.includes(district)) return 100;
  if (ngoState.includes(state)) return 88;
  return 48;
}

function impactScore(ngo: NgoRecord) {
  const beneficiaries = Math.max(
    numberValue(ngo.beneficiary_count),
    numberValue(ngo.communities_served),
    numberValue(ngo.registration_data?.beneficiaryCount),
    numberValue(ngo.registration_data?.beneficiariesServed),
  );
  return clampScore(45 + Math.min(projectCount(ngo), 20) * 2 + Math.min(beneficiaries / 1000, 30));
}

function financialScore(ngo: NgoRecord) {
  const revenue = Math.max(
    numberValue(ngo.annual_revenue),
    numberValue(ngo.revenue),
    numberValue(ngo.registration_data?.annualRevenue),
    numberValue(ngo.registration_data?.revenue),
  );
  const expenses = Math.max(numberValue(ngo.expenses), numberValue(ngo.registration_data?.expenses));
  const base = revenue > 0 ? 62 : 46;
  const stability = revenue && expenses ? Math.max(0, 20 - Math.abs(1 - expenses / revenue) * 20) : 8;
  return clampScore(base + stability + Math.min(projectCount(ngo), 6) * 2);
}

function transparencyScore(ngo: NgoRecord) {
  const checks = [
    hasAny(ngo, ["website"]),
    hasAny(ngo, ["annual_report", "annualReport"]),
    hasAny(ngo, ["audit_report", "auditReport"]),
    hasAny(ngo, ["leadership", "founder", "trustees"]),
  ];
  return clampScore(42 + checks.filter(Boolean).length * 14 + (ngo.access_status === "verified" || ngo.access_status === "active" ? 8 : 0));
}

function csrPartnershipScore(ngo: NgoRecord) {
  const partnerships = Math.max(
    numberValue(ngo.corporate_partnerships),
    numberValue(ngo.registration_data?.corporatePartnerships),
    numberValue(ngo.registration_data?.csrPartnerships),
  );
  return clampScore(50 + Math.min(partnerships, 10) * 5 + Math.min(projectCount(ngo), 8) * 2);
}

function organizationScaleScore(opportunity: OpportunityRecord, ngo: NgoRecord) {
  const budget = numberValue(opportunity.budget);
  const people =
    numberValue(ngo.employee_count) +
    numberValue(ngo.volunteer_count) +
    numberValue(ngo.registration_data?.employeeCount) +
    numberValue(ngo.registration_data?.volunteerCount);
  if (!people) return 62;
  if (budget < 2500000) return clampScore(100 - Math.min(Math.abs(people - 20), 80));
  if (budget < 10000000) return clampScore(100 - Math.min(Math.abs(people - 75) / 1.5, 70));
  return clampScore(55 + Math.min(people / 4, 45));
}

function recentActivityScore(ngo: NgoRecord) {
  const updated = text(ngo.updated_at || ngo.registration_data?.updatedAt);
  const verified = ngo.access_status === "active" || ngo.access_status === "verified" ? 18 : 0;
  if (!updated) return 52 + verified;
  const ageDays = Math.max(0, (Date.now() - new Date(updated).getTime()) / 86400000);
  return clampScore(82 - Math.min(ageDays / 10, 35) + verified);
}

export function calculateProjectTrustScore(opportunity: OpportunityRecord, ngo: NgoRecord): ProjectTrustScore {
  const breakdown: ProjectTrustBreakdown = {
    sectorMatch: sectorScore(opportunity, ngo),
    budgetMatch: budgetScore(opportunity, ngo),
    locationMatch: locationScore(opportunity, ngo),
    impact: impactScore(ngo),
    compliance: complianceScore(ngo),
    financialStability: financialScore(ngo),
    transparency: transparencyScore(ngo),
    pastCsrPartnerships: csrPartnershipScore(ngo),
    organizationScale: organizationScaleScore(opportunity, ngo),
    recentActivity: recentActivityScore(ngo),
  };

  const overallScore = clampScore(
    Object.entries(breakdown).reduce(
      (total, [factor, score]) => total + score * WEIGHTS[factor as ProjectTrustFactor],
      0,
    ) / Object.values(WEIGHTS).reduce((total, weight) => total + weight, 0),
  );

  const strengths = Object.entries(breakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([factor]) =>
      ({
        sectorMatch: "Sector experience",
        budgetMatch: "Budget fit",
        locationMatch: "Location familiarity",
        impact: "Impact delivery",
        compliance: "Compliance readiness",
        financialStability: "Financial stability",
        transparency: "Transparency",
        pastCsrPartnerships: "CSR partnerships",
        organizationScale: "Organization scale",
        recentActivity: "Recent activity",
      })[factor as ProjectTrustFactor],
    );

  return {
    opportunityId: opportunity.id,
    ngoId: ngo.id,
    ngoName: ngo.ngo_name,
    overallScore,
    breakdown,
    whyRecommended: `${ngo.ngo_name} scores ${overallScore}/100 for ${opportunity.title}, led by ${strengths.join(", ").toLowerCase()}.`,
    keyStrengths: strengths,
    pastSimilarProjects: projectCount(ngo)
      ? `${projectCount(ngo)} completed or reported projects in available records.`
      : "No completed project count available in current records.",
    budgetExperience: breakdown.budgetMatch >= 80 ? "Strong budget fit for this project size." : "Budget fit needs admin review.",
    complianceStatus: breakdown.compliance >= 80 ? "Core compliance evidence is strong." : "Compliance evidence should be reviewed before recommendation.",
  };
}

export async function generateProjectTrustScores(opportunityId: string) {
  const { data: opportunity, error: opportunityError } = await supabaseAdmin
    .from("opportunities")
    .select("*")
    .eq("id", opportunityId)
    .maybeSingle();

  if (opportunityError || !opportunity) {
    throw new Error(opportunityError?.message || "Opportunity not found.");
  }

  const { data: ngos, error: ngoError } = await supabaseAdmin
    .from("ngos")
    .select("*")
    .in("access_status", ["verified", "active"]);

  if (ngoError) throw new Error(ngoError.message);

  const scores = ((ngos ?? []) as NgoRecord[])
    .map((ngo) => calculateProjectTrustScore(opportunity as OpportunityRecord, ngo))
    .sort((a, b) => b.overallScore - a.overallScore);

  if (scores.length) {
    const { error } = await supabaseAdmin.from("ngo_project_trust_scores").upsert(
      scores.map((score, rank) => ({
        opportunity_id: score.opportunityId,
        ngo_id: score.ngoId,
        overall_score: score.overallScore,
        score_breakdown: score.breakdown,
        rank: rank + 1,
        why_recommended: score.whyRecommended,
        key_strengths: score.keyStrengths,
        past_similar_projects: score.pastSimilarProjects,
        budget_experience: score.budgetExperience,
        compliance_status: score.complianceStatus,
        recalculated_at: new Date().toISOString(),
      })),
      { onConflict: "opportunity_id,ngo_id" },
    );

    if (error && !error.message.includes("schema cache")) throw new Error(error.message);
  }

  return scores;
}
