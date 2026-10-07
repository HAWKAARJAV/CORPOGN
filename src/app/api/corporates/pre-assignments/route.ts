import { getCaller, getCorporateIdForUser } from "@/lib/access-control";
import { shapeCorporatePreAssignments } from "@/lib/server/corporate-pre-assignments";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * GET /api/corporates/pre-assignments
 *
 * Portfolio-wide view of matchmaking rows for this corporate — used by
 * Recommended NGOs, dashboard badges, and applicant counts (NGO apply +
 * admin suggest paths both live in pre_assignments).
 */
export async function GET(request: Request) {
  const user = await getCaller(request);
  if (!user) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const corporateId = await getCorporateIdForUser(user);
  if (!corporateId) {
    return Response.json({ error: "Only corporate accounts can view pre-assignments." }, { status: 403 });
  }

  const { data: opps, error: oppError } = await supabaseAdmin
    .from("opportunities")
    .select("id, title, focus_area, state, budget, lifecycle_status, status")
    .eq("corporate_id", corporateId)
    .order("created_at", { ascending: false });

  if (oppError) return Response.json({ error: oppError.message }, { status: 500 });

  const oppIds = (opps ?? []).map((o) => o.id);
  if (!oppIds.length) {
    return Response.json({
      totals: { applicants: 0, adminSuggested: 0, awaitingCorporateConfirm: 0, awaitingActivation: 0 },
      byOpportunity: [],
    });
  }

  const { data: rows, error } = await supabaseAdmin
    .from("pre_assignments")
    .select("*")
    .in("opportunity_id", oppIds)
    .order("match_score", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const shaped = await shapeCorporatePreAssignments(rows ?? []);
  const applicants = shaped.filter((s) => s.source.includes("ngo_applied"));
  const adminSuggested = shaped.filter((s) => s.source.includes("admin_recommended"));

  const awaitingCorporateConfirm = shaped.filter(
    (s) => s.status === "shortlisted" && !s.corporateConfirmedAt && !s.activatedAt,
  ).length;

  const awaitingActivation = shaped.filter(
    (s) => s.corporateConfirmedAt && s.ngoConfirmedAt && !s.activatedAt,
  ).length;

  const oppById = new Map((opps ?? []).map((o) => [o.id, o]));

  const byOpportunity = oppIds.map((oppId) => {
    const opp = oppById.get(oppId);
    const oppRows = shaped.filter((s) => s.opportunityId === oppId);
    return {
      opportunityId: oppId,
      title: opp?.title ?? "CSR Project",
      focusArea: opp?.focus_area ?? null,
      state: opp?.state ?? null,
      budget: opp?.budget ?? null,
      lifecycleStatus: opp?.lifecycle_status ?? null,
      status: opp?.status ?? null,
      applicants: oppRows.filter((s) => s.source.includes("ngo_applied")),
      adminSuggested: oppRows.filter((s) => s.source.includes("admin_recommended")),
    };
  });

  return Response.json({
    totals: {
      applicants: applicants.length,
      adminSuggested: adminSuggested.length,
      awaitingCorporateConfirm,
      awaitingActivation,
    },
    byOpportunity,
  });
}
