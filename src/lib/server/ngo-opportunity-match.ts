import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  scoreOpportunityForNgo,
  scoreWithMatchEngine,
} from "@/lib/server/scoring/ngo-opportunity-fit.mjs";

export type NgoProfileForMatch = {
  id: string;
  state?: string | null;
  district?: string | null;
  mission?: string | null;
  focus_areas?: string[] | null;
  beneficiary_types?: string[] | null;
  sector_primary?: string | null;
  states_served?: string[] | null;
  trust_score?: number | null;
  overall_trust_score?: number | null;
};

export type OpportunityForMatch = {
  id: string;
  title: string;
  description?: string | null;
  focus_area: string;
  csr_focus_area?: string | null;
  budget: number | string;
  state?: string | null;
  district?: string | null;
  sdg_targets?: string[] | null;
  target_beneficiaries?: string[] | null;
  min_trust_score?: number | null;
};

export type NgoOpportunityFit = {
  match_score: number;
  fit_label: string;
  fit_insight: string;
  matched_criteria: Record<string, unknown>;
  scoring_source: string;
};

const NGO_MATCH_SELECT =
  "id, state, district, mission, focus_areas, beneficiary_types, sector_primary, states_served, trust_score, overall_trust_score";

export async function loadNgoProfileForMatch(ngoId: string): Promise<NgoProfileForMatch | null> {
  const { data, error } = await supabaseAdmin.from("ngos").select(NGO_MATCH_SELECT).eq("id", ngoId).maybeSingle();
  if (error || !data) return null;
  return data as NgoProfileForMatch;
}

async function loadDiscoveredMatchEngineContext(ngoId: string) {
  const { data: discovered } = await supabaseAdmin
    .from("discovered_ngos")
    .select("*")
    .eq("claimed_ngo_id", ngoId)
    .maybeSingle();

  if (!discovered) return null;

  const ngoDiscoveredId = discovered.id as string;

  const [trustRes, categoriesRes, projectsRes, financialsRes, liveNgoRes] = await Promise.all([
    supabaseAdmin
      .from("ngo_trust_scores")
      .select("*")
      .eq("ngo_id", ngoDiscoveredId)
      .eq("is_current", true)
      .maybeSingle(),
    supabaseAdmin.from("discovered_ngo_categories").select("ngo_id, category").eq("ngo_id", ngoDiscoveredId),
    supabaseAdmin.from("discovered_ngo_projects").select("*").eq("ngo_id", ngoDiscoveredId),
    supabaseAdmin.from("discovered_ngo_financials").select("*").eq("ngo_id", ngoDiscoveredId),
    supabaseAdmin.from("ngos").select("id, states_served, cert_12a, cert_80g").eq("id", ngoId).maybeSingle(),
  ]);

  return {
    discovered,
    trust: trustRes.data,
    categories: categoriesRes.data ?? [],
    projects: projectsRes.data ?? [],
    financials: financialsRes.data ?? [],
    linkedNgo: liveNgoRes.data,
  };
}

export function ngoTrustFromProfile(ngo: NgoProfileForMatch): number {
  return Number(ngo.overall_trust_score ?? ngo.trust_score ?? 0);
}

type DiscoveredEngineContext = Awaited<ReturnType<typeof loadDiscoveredMatchEngineContext>>;

export async function computeNgoOpportunityFit(
  ngo: NgoProfileForMatch,
  project: OpportunityForMatch,
  cachedEngineContext?: DiscoveredEngineContext | null,
): Promise<NgoOpportunityFit> {
  const ngoTrust = ngoTrustFromProfile(ngo);
  const engineContext =
    cachedEngineContext !== undefined ? cachedEngineContext : await loadDiscoveredMatchEngineContext(ngo.id);

  let matchEngine: { result: ReturnType<typeof scoreWithMatchEngine> } | null = null;
  if (engineContext?.discovered && engineContext.trust) {
    const result = scoreWithMatchEngine(
      engineContext.discovered,
      { ...project, budget: Number(project.budget) || 0 },
      engineContext.trust,
      {
        categories: engineContext.categories,
        projects: engineContext.projects,
        financials: engineContext.financials,
        linkedNgo: engineContext.linkedNgo,
      },
    );
    matchEngine = { result };
  }

  const scored = scoreOpportunityForNgo({
    ngo,
    project: { ...project, min_trust_score: project.min_trust_score ?? 0 },
    ngoTrustScore: ngoTrust,
    matchEngine,
  });

  return {
    match_score: scored.matchScore,
    fit_label: scored.fitLabel,
    fit_insight: scored.fitInsight,
    matched_criteria: scored.matchedCriteria,
    scoring_source: scored.scoringSource,
  };
}

export async function loadDiscoveredEngineContextForNgo(ngoId: string) {
  return loadDiscoveredMatchEngineContext(ngoId);
}
