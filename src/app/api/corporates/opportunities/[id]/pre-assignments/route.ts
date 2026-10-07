import { shapeCorporatePreAssignments } from "@/lib/server/corporate-pre-assignments";
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

  const shaped = await shapeCorporatePreAssignments(rows ?? []);

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
