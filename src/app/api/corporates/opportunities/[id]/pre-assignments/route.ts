import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCaller, getCorporateIdForUser } from "@/lib/access-control";

/**
 * GET /api/corporates/opportunities/:id/pre-assignments
 *
 * Step 6 — returns the two intake paths for this project SEPARATELY
 * (applicants vs admin-suggested), never merged into one ranked list, per
 * the spec's explicit requirement. A row with both sources appears in BOTH
 * arrays (it genuinely is both), not picked into just one.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: opportunityId } = await params;

  const user = await getCaller(request);
  if (!user) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const corporateId = await getCorporateIdForUser(user);
  if (!corporateId) return Response.json({ error: "Only corporate accounts can view this." }, { status: 403 });

  const { data: opp, error: oppError } = await supabaseAdmin
    .from("opportunities")
    .select("id, corporate_id, title")
    .eq("id", opportunityId)
    .eq("corporate_id", corporateId)
    .maybeSingle();

  if (oppError || !opp) return Response.json({ error: "Project not found." }, { status: 404 });

  const { data: rows, error } = await supabaseAdmin
    .from("pre_assignments")
    .select("*")
    .eq("opportunity_id", opportunityId)
    .order("match_score", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const discoveredIds = [...new Set((rows ?? []).map((r) => r.discovered_ngo_id).filter(Boolean))];
  const liveIds = [...new Set((rows ?? []).map((r) => r.ngo_id).filter(Boolean))];

  const [{ data: discoveredNgos }, { data: liveNgos }] = await Promise.all([
    discoveredIds.length
      ? supabaseAdmin.from("discovered_ngos").select("id, name, city, state, certification_tier").in("id", discoveredIds)
      : Promise.resolve({ data: [] }),
    liveIds.length
      ? supabaseAdmin.from("ngos").select("id, ngo_name, slug, state, overall_trust_score, logo_url").in("id", liveIds)
      : Promise.resolve({ data: [] }),
  ]);

  const discoveredById = new Map((discoveredNgos ?? []).map((n) => [n.id, n]));
  const liveById = new Map((liveNgos ?? []).map((n) => [n.id, n]));

  const shaped = (rows ?? []).map((row) => {
    const discovered = row.discovered_ngo_id ? discoveredById.get(row.discovered_ngo_id) : null;
    const live = row.ngo_id ? liveById.get(row.ngo_id) : null;
    return {
      id: row.id,
      status: row.status,
      source: row.source ?? [],
      matchScore: row.match_score,
      wasInTop10: row.was_in_top_10,
      overrideNotes: row.override_notes,
      applicationData: row.application_data,
      ngoId: row.ngo_id, // live id — present only if this NGO is claimed/linked
      ngoName: live?.ngo_name ?? discovered?.name ?? "Unknown NGO",
      ngoSlug: live?.slug ?? null,
      ngoState: live?.state ?? discovered?.state ?? null,
      ngoCity: discovered?.city ?? null,
      certificationTier: discovered?.certification_tier ?? null,
      trustScore: live?.overall_trust_score ?? null,
      logoUrl: live?.logo_url ?? null,
      hasFullProfile: Boolean(row.ngo_id), // full-profile page needs a live ngos.id
      createdAt: row.created_at,
    };
  });

  return Response.json({
    opportunity: opp,
    applicants: shaped.filter((s) => s.source.includes("ngo_applied")),
    adminSuggested: shaped.filter((s) => s.source.includes("admin_recommended")),
  });
}

/**
 * PATCH /api/corporates/opportunities/:id/pre-assignments
 * Body: { pre_assignment_id, status: 'shortlisted' } — shortlist action, OR
 * Body: { pre_assignment_id, action: 'confirm' } — Step 8's corporate-side
 * mutual confirmation. Sets corporate_confirmed_at; does NOT itself activate
 * anything — that's a separate admin action once both sides have confirmed.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: opportunityId } = await params;

  const user = await getCaller(request);
  if (!user) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const corporateId = await getCorporateIdForUser(user);
  if (!corporateId) return Response.json({ error: "Only corporate accounts can manage applicants." }, { status: 403 });

  const body = (await request.json()) as { pre_assignment_id?: string; status?: string; action?: string };
  if (!body.pre_assignment_id) {
    return Response.json({ error: "pre_assignment_id is required." }, { status: 400 });
  }
  if (body.status !== "shortlisted" && body.action !== "confirm") {
    return Response.json({ error: "status='shortlisted' or action='confirm' is required." }, { status: 400 });
  }

  const { data: opp } = await supabaseAdmin
    .from("opportunities")
    .select("id")
    .eq("id", opportunityId)
    .eq("corporate_id", corporateId)
    .maybeSingle();
  if (!opp) return Response.json({ error: "Project not found." }, { status: 404 });

  const updatePayload = body.action === "confirm"
    ? { corporate_confirmed_at: new Date().toISOString() }
    : { status: "shortlisted" };

  const { data, error } = await supabaseAdmin
    .from("pre_assignments")
    .update(updatePayload)
    .eq("id", body.pre_assignment_id)
    .eq("opportunity_id", opportunityId)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ preAssignment: data });
}
