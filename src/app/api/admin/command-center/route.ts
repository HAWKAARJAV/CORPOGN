import { getCaller, getOrgContext } from "@/lib/access-control";
import { mapConnectionRow } from "@/lib/project-connections";
import { generateProjectTrustScores } from "@/lib/trust-score-engine";
import { supabaseAdmin } from "@/lib/supabase-admin";

async function requireAdmin(request: Request) {
  const user = await getCaller(request);
  if (!user) return { error: "Unauthorized.", status: 401 } as const;

  const context = await getOrgContext(user);
  if (!context || context.accountType !== "admin") {
    return { error: "Only platform admins can access this endpoint.", status: 403 } as const;
  }

  return { user, context } as const;
}

function isSchemaMissing(error?: { message?: string } | null) {
  return Boolean(error?.message?.includes("schema cache") || error?.message?.includes("does not exist"));
}

async function loadNames(rows: Record<string, unknown>[]) {
  const corporateIds = [...new Set(rows.map((row) => String(row.corporate_id)).filter(Boolean))];
  const ngoIds = [...new Set(rows.map((row) => String(row.ngo_id)).filter(Boolean))];

  const [{ data: corporates }, { data: ngos }] = await Promise.all([
    corporateIds.length
      ? supabaseAdmin.from("corporates").select("id, company_name, company_email, registration_data").in("id", corporateIds)
      : Promise.resolve({ data: [] }),
    ngoIds.length
      ? supabaseAdmin.from("ngos").select("id, ngo_name, ngo_email, access_status, trust_score, registration_data").in("id", ngoIds)
      : Promise.resolve({ data: [] }),
  ]);

  return {
    corporates: new Map((corporates ?? []).map((row) => [row.id, row])),
    ngos: new Map((ngos ?? []).map((row) => [row.id, row])),
  };
}

async function loadOpportunities() {
  const { data, error } = await supabaseAdmin
    .from("opportunities")
    .select("*, corporates(id, company_name, company_email)")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

async function loadScores(opportunityIds: string[]) {
  if (!opportunityIds.length) return [];

  const { data, error } = await supabaseAdmin
    .from("ngo_project_trust_scores")
    .select("*, ngos(id, ngo_name, ngo_email, access_status, trust_score, registration_data)")
    .in("opportunity_id", opportunityIds)
    .order("rank", { ascending: true });

  if (isSchemaMissing(error)) return [];
  if (error) throw error;
  return data ?? [];
}

async function loadRecommendations() {
  const { data, error } = await supabaseAdmin
    .from("project_recommendations")
    .select("*, ngos(id, ngo_name), opportunities(id, title), corporates(id, company_name)")
    .order("created_at", { ascending: false });

  if (isSchemaMissing(error)) return [];
  if (error) throw error;
  return data ?? [];
}

async function loadAllocations() {
  const { data, error } = await supabaseAdmin
    .from("project_allocations")
    .select("*, ngos(id, ngo_name), corporates(id, company_name), opportunities(id, title, budget, duration_months), project_connections(*)")
    .order("allocation_date", { ascending: false });

  if (isSchemaMissing(error)) return [];
  if (error) throw error;
  return data ?? [];
}

async function loadConnections() {
  const { data, error } = await supabaseAdmin
    .from("project_connections")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return [];

  const rows = (data ?? []) as Record<string, unknown>[];
  const names = await loadNames(rows);
  return rows.map((row) =>
    mapConnectionRow(
      row,
      names.corporates.get(String(row.corporate_id))?.company_name,
      names.ngos.get(String(row.ngo_id))?.ngo_name,
    ),
  );
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });

  const opportunities = await loadOpportunities();
  const opportunityIds = opportunities.map((opp) => String(opp.id));

  const [scores, recommendations, allocations, connections, corporates, ngos] = await Promise.all([
    loadScores(opportunityIds),
    loadRecommendations(),
    loadAllocations(),
    loadConnections(),
    supabaseAdmin.from("corporates").select("id, company_name, company_email, access_status, registration_data, created_at"),
    supabaseAdmin.from("ngos").select("*").order("trust_score", { ascending: false }),
  ]);

  return Response.json({
    overview: {
      projects: opportunities.length,
      pendingRecommendation: opportunities.filter((opp) => (opp.admin_status ?? "pending_recommendation") === "pending_recommendation").length,
      recommendationsSent: opportunities.filter((opp) => opp.admin_status === "recommendations_sent" || opp.admin_status === "corporate_reviewing").length,
      allocated: allocations.length,
      liveProjects: connections.filter((connection) => connection.status === "active").length,
      completedProjects: connections.filter((connection) => connection.status === "completed").length,
    },
    projects: opportunities,
    scores,
    recommendations,
    allocations,
    connections,
    corporates: corporates.data ?? [],
    ngos: ngos.data ?? [],
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });

  const body = (await request.json()) as { opportunityId?: string };
  if (!body.opportunityId) {
    return Response.json({ error: "opportunityId is required." }, { status: 400 });
  }

  try {
    const scores = await generateProjectTrustScores(body.opportunityId);
    return Response.json({ scores });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not calculate trust scores." },
      { status: 500 },
    );
  }
}
