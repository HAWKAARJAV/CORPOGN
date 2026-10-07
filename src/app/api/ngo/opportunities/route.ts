import { getCaller, getNgoIdForUser } from "@/lib/access-control";
import {
  computeNgoOpportunityFit,
  loadDiscoveredEngineContextForNgo,
  loadNgoProfileForMatch,
  type NgoProfileForMatch,
} from "@/lib/server/ngo-opportunity-match";
import { supabaseAdmin } from "@/lib/supabase-admin";

type OpportunityRow = {
  id: string;
  corporate_id: string;
  title: string;
  description: string | null;
  focus_area: string;
  csr_focus_area?: string | null;
  budget: number | string;
  state: string | null;
  district: string | null;
  sdg_targets: string[] | null;
  target_beneficiaries: string[] | null;
  expected_start_date: string | null;
  duration_months: number | null;
  min_trust_score: number | null;
  status: string | null;
  lifecycle_status?: string | null;
  created_at: string;
  corporates?: { company_name: string } | { company_name: string }[] | null;
};

function formatOpportunity(opp: OpportunityRow) {
  const corporate = Array.isArray(opp.corporates) ? opp.corporates[0] : opp.corporates;

  return {
    id: opp.id,
    corporate_id: opp.corporate_id,
    title: opp.title,
    description: opp.description ?? "",
    focus_area: opp.focus_area,
    csr_focus_area: opp.csr_focus_area ?? null,
    budget: Number(opp.budget),
    state: opp.state ?? "Pan India",
    district: opp.district ?? "",
    sdg_targets: opp.sdg_targets ?? [],
    target_beneficiaries: opp.target_beneficiaries ?? [],
    expected_start_date: opp.expected_start_date ?? null,
    duration_months: opp.duration_months ?? null,
    min_trust_score: opp.min_trust_score ?? 0,
    status: opp.status,
    created_at: opp.created_at,
    corporate_name: corporate?.company_name ?? "Partner Corporate",
  };
}

function isVisibleToNgo(opp: OpportunityRow) {
  if (opp.status !== "open" && opp.status != null) return false;

  const lifecycle = opp.lifecycle_status;
  if (lifecycle == null || lifecycle === undefined) return true;
  if (lifecycle === "published") return true;
  // Legacy rows: corporates posted before lifecycle publish was wired — still open.
  if (lifecycle === "draft") return true;

  return false;
}

const OPPORTUNITY_SELECT = `
  id,
  corporate_id,
  title,
  description,
  focus_area,
  csr_focus_area,
  budget,
  state,
  district,
  sdg_targets,
  target_beneficiaries,
  expected_start_date,
  duration_months,
  min_trust_score,
  status,
  lifecycle_status,
  created_at,
  corporates (
    company_name
  )
`;

async function attachMatchScores(
  rows: OpportunityRow[],
  ngoProfile: NgoProfileForMatch | null,
  engineContext: Awaited<ReturnType<typeof loadDiscoveredEngineContextForNgo>> | null,
) {
  const formatted = rows.map((row) => formatOpportunity(row));

  if (!ngoProfile) {
    return formatted.map((base) => ({
      ...base,
      match_score: null,
      fit_label: null,
      fit_insight: null,
      matched_criteria: null,
      scoring_source: null,
    }));
  }

  const withScores = await Promise.all(
    formatted.map(async (base) => {
      const fit = await computeNgoOpportunityFit(
        ngoProfile,
        {
          id: base.id,
          title: base.title,
          description: base.description,
          focus_area: base.focus_area,
          csr_focus_area: base.csr_focus_area,
          budget: base.budget,
          state: base.state,
          district: base.district,
          sdg_targets: base.sdg_targets,
          target_beneficiaries: base.target_beneficiaries,
          min_trust_score: base.min_trust_score,
        },
        engineContext,
      );
      return { ...base, ...fit };
    }),
  );

  return withScores.sort((a, b) => {
    const sa = a.match_score ?? -1;
    const sb = b.match_score ?? -1;
    if (sb !== sa) return sb - sa;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export async function GET(request: Request) {
  const user = await getCaller(request);
  if (!user) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const accountType = user.user_metadata?.account_type;
  if (
    accountType !== "ngo" &&
    accountType !== "ngo_member" &&
    accountType !== "admin"
  ) {
    return Response.json({ error: "Only NGO accounts can browse opportunities." }, { status: 403 });
  }

  let ngoProfile: NgoProfileForMatch | null = null;
  let engineContext: Awaited<ReturnType<typeof loadDiscoveredEngineContextForNgo>> | null = null;
  const ngoId = await getNgoIdForUser(user);
  if (ngoId) {
    ngoProfile = await loadNgoProfileForMatch(ngoId);
    if (ngoProfile) {
      engineContext = await loadDiscoveredEngineContextForNgo(ngoId);
    }
  }

  const { data, error } = await supabaseAdmin
    .from("opportunities")
    .select(OPPORTUNITY_SELECT)
    .eq("status", "open")
    .order("created_at", { ascending: false });

  if (error) {
    const missingLifecycle =
      error.message?.includes("lifecycle_status") ||
      error.code === "42703" ||
      error.message?.includes("schema cache");

    const missingCsrFocus =
      error.message?.includes("csr_focus_area") ||
      (error.code === "42703" && error.message?.includes("csr_focus_area"));

    if (missingLifecycle || missingCsrFocus) {
      const { data: legacy, error: legacyError } = await supabaseAdmin
        .from("opportunities")
        .select(`
          id,
          corporate_id,
          title,
          description,
          focus_area,
          budget,
          state,
          district,
          sdg_targets,
          target_beneficiaries,
          expected_start_date,
          duration_months,
          min_trust_score,
          status,
          created_at,
          corporates (
            company_name
          )
        `)
        .eq("status", "open")
        .order("created_at", { ascending: false });

      if (legacyError) {
        console.error("[opportunities API] Legacy fetch failed:", legacyError.message);
        return Response.json({ error: "Could not load opportunities." }, { status: 500 });
      }

      const opportunities = await attachMatchScores(
        (legacy ?? []) as OpportunityRow[],
        ngoProfile,
        engineContext,
      );
      return Response.json({ opportunities });
    }

    console.error("[opportunities API] Error fetching opportunities:", error.message);
    return Response.json({ error: "Could not load opportunities." }, { status: 500 });
  }

  const visible = (data ?? []).filter((row) => isVisibleToNgo(row as OpportunityRow));
  const opportunities = await attachMatchScores(visible as OpportunityRow[], ngoProfile, engineContext);

  return Response.json({ opportunities });
}
