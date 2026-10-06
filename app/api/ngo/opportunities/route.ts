import { getCaller, getNgoIdForUser } from "@/lib/access-control";
import { opportunityFitForNgo } from "@/lib/ai-insights";
import { supabaseAdmin } from "@/lib/supabase-admin";

type OpportunityRow = {
  id: string;
  corporate_id: string;
  title: string;
  description: string | null;
  focus_area: string;
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

    if (missingLifecycle) {
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

      let ngoTrustLegacy = 0;
      const ngoIdLegacy = await getNgoIdForUser(user);
      if (ngoIdLegacy) {
        const { data: ngo } = await supabaseAdmin
          .from("ngos")
          .select("trust_score, overall_trust_score")
          .eq("id", ngoIdLegacy)
          .maybeSingle();
        ngoTrustLegacy = Number(ngo?.overall_trust_score ?? ngo?.trust_score ?? 0);
      }

      return Response.json({
        opportunities: (legacy ?? []).map((row) => {
          const base = formatOpportunity(row as OpportunityRow);
          const ai = opportunityFitForNgo(ngoTrustLegacy, base.min_trust_score);
          return { ...base, ai_fit_score: ai.score, ai_fit_label: ai.label, ai_insight: ai.insight };
        }),
      });
    }

    console.error("[opportunities API] Error fetching opportunities:", error.message);
    return Response.json({ error: "Could not load opportunities." }, { status: 500 });
  }

  const visible = (data ?? []).filter((row) => isVisibleToNgo(row as OpportunityRow));

  let ngoTrust = 0;
  const ngoId = await getNgoIdForUser(user);
  if (ngoId) {
    const { data: ngo } = await supabaseAdmin
      .from("ngos")
      .select("trust_score, overall_trust_score")
      .eq("id", ngoId)
      .maybeSingle();
    ngoTrust = Number(ngo?.overall_trust_score ?? ngo?.trust_score ?? 0);
  }

  return Response.json({
    opportunities: visible.map((row) => {
      const base = formatOpportunity(row as OpportunityRow);
      const ai = opportunityFitForNgo(ngoTrust, base.min_trust_score);
      return {
        ...base,
        ai_fit_score: ai.score,
        ai_fit_label: ai.label,
        ai_insight: ai.insight,
      };
    }),
  });
}
