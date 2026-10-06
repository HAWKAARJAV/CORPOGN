import { supabaseAdmin } from "@/lib/supabase-admin";
import { getNgoIdForUser } from "@/lib/access-control";

/**
 * NGO applications now write into pre_assignments (source includes
 * 'ngo_applied'), the same table admin-recommended candidates (Step 5) will
 * write into — so the same NGO appearing via both paths merges into one row
 * instead of creating a duplicate. discovered_ngo_id is set best-effort via
 * a reverse claimed_ngo_id lookup; most applying NGOs won't have one yet,
 * which is fine — ngo_id (their real, live id) is always set and is what
 * actually identifies the application.
 *
 * Response shape is kept identical to the old project_connections-based
 * "proposal" objects the NGO dashboard already expects (project_name,
 * corporate_id, etc.) — the frontend's apply/status-check code is untouched.
 */

type AuthUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

async function getCaller(request: Request): Promise<AuthUser | null> {
  const token = (request.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user as AuthUser;
}

async function getNgoForUser(user: AuthUser) {
  const accountType = user.user_metadata?.account_type;

  if (accountType === "ngo") {
    const { data, error } = await supabaseAdmin.from("ngos").select("id, ngo_name").eq("auth_user_id", user.id).single();
    if (error || !data) return null;
    return data as { id: string; ngo_name: string };
  }

  if (accountType === "ngo_member") {
    const ngoId = await getNgoIdForUser(user);
    if (!ngoId) return null;
    const { data, error } = await supabaseAdmin.from("ngos").select("id, ngo_name").eq("id", ngoId).single();
    if (error || !data) return null;
    return data as { id: string; ngo_name: string };
  }

  return null;
}

function toProposalShape(row: Record<string, unknown>, opp: Record<string, unknown> | null, corporateName: string, ngoName: string) {
  const appData = (row.application_data as Record<string, unknown>) ?? {};
  return {
    id: String(row.id),
    corporate_id: String(opp?.corporate_id ?? appData.corporate_id ?? ""),
    ngo_id: String(row.ngo_id ?? ""),
    project_name: String(opp?.title ?? appData.project_name ?? "CSR Project"),
    focus_area: String(opp?.focus_area ?? appData.focus_area ?? ""),
    budget: Number(appData.proposed_budget ?? opp?.budget ?? 0),
    status: row.status === "assigned" ? "active" : "proposal",
    // Real sub-status, additive — the NGO dashboard's status pill type only
    // knows proposal/pending_admin/active/completed, so this rides alongside
    // rather than replacing it. Step 7: shortlisted = pre-signed discussion.
    isShortlisted: row.status === "shortlisted",
    progress: 0,
    milestone: row.status === "shortlisted" ? "Shortlisted — in discussion" : "Application submitted",
    document_requests: [] as string[],
    latest_update: String(appData.summary ? `Proposal submitted: ${appData.summary}` : "Application submitted."),
    corporate_name: corporateName,
    ngo_name: ngoName,
    created_at: String(row.created_at ?? new Date().toISOString()),
    opportunity_id: opp?.id ? String(opp.id) : null,
    lifecycle_status: opp?.lifecycle_status ? String(opp.lifecycle_status) : null,
  };
}

export async function GET(request: Request) {
  const user = await getCaller(request);
  if (!user) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const ngo = await getNgoForUser(user);
  if (!ngo) return Response.json({ error: "NGO not found or user is not associated with an NGO." }, { status: 403 });

  const { data: rows, error } = await supabaseAdmin
    .from("pre_assignments")
    .select("*")
    .eq("ngo_id", ngo.id)
    .contains("source", ["ngo_applied"])
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const oppIds = [...new Set((rows ?? []).map((r) => r.opportunity_id).filter(Boolean))];
  const { data: opps } = oppIds.length
    ? await supabaseAdmin.from("opportunities").select("id, title, corporate_id, focus_area, budget, lifecycle_status").in("id", oppIds)
    : { data: [] };
  const oppsById = new Map((opps ?? []).map((o) => [o.id, o]));

  const corporateIds = [...new Set((opps ?? []).map((o) => o.corporate_id))];
  const { data: corporates } = corporateIds.length
    ? await supabaseAdmin.from("corporates").select("id, company_name").in("id", corporateIds)
    : { data: [] };
  const corporateNames = new Map((corporates ?? []).map((c) => [c.id, c.company_name]));

  const proposals = (rows ?? []).map((row) => {
    const opp = oppsById.get(row.opportunity_id) ?? null;
    return toProposalShape(row, opp, corporateNames.get(opp?.corporate_id) || "Corporate Partner", ngo.ngo_name);
  });

  return Response.json({ proposals });
}

export async function POST(request: Request) {
  const user = await getCaller(request);
  if (!user) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const ngo = await getNgoForUser(user);
  if (!ngo) return Response.json({ error: "Only NGO accounts can submit proposals." }, { status: 403 });

  const body = (await request.json()) as {
    opportunity_id?: string;
    corporate_id?: string;
    project_name?: string;
    focus_area?: string;
    budget?: number;
    summary?: string;
  };

  let opportunity: { id: string; corporate_id: string; title: string; focus_area: string; budget: number; lifecycle_status?: string } | null = null;

  if (body.opportunity_id) {
    const { data } = await supabaseAdmin
      .from("opportunities")
      .select("id, corporate_id, title, focus_area, budget, lifecycle_status")
      .eq("id", body.opportunity_id)
      .maybeSingle();
    opportunity = data;
  } else if (body.corporate_id && body.project_name) {
    // Legacy fallback for any caller not yet sending opportunity_id.
    const { data } = await supabaseAdmin
      .from("opportunities")
      .select("id, corporate_id, title, focus_area, budget, lifecycle_status")
      .eq("corporate_id", body.corporate_id)
      .ilike("title", body.project_name)
      .maybeSingle();
    opportunity = data;
  }

  if (!opportunity) {
    return Response.json({ error: "Could not find the project you're applying to." }, { status: 404 });
  }
  if (opportunity.lifecycle_status && opportunity.lifecycle_status !== "published") {
    return Response.json({ error: "This project is not open for applications." }, { status: 400 });
  }

  // Best-effort link to the discovery pipeline id space, for Step 5's merge logic.
  const { data: discoveredMatch } = await supabaseAdmin
    .from("discovered_ngos")
    .select("id")
    .eq("claimed_ngo_id", ngo.id)
    .maybeSingle();

  const applicationData = {
    corporate_id: opportunity.corporate_id,
    project_name: opportunity.title,
    focus_area: opportunity.focus_area,
    proposed_budget: body.budget ?? opportunity.budget,
    summary: body.summary?.trim() || "No proposal summary provided.",
  };

  const { data: upserted, error: upsertError } = await supabaseAdmin
    .from("pre_assignments")
    .upsert(
      {
        opportunity_id: opportunity.id,
        ngo_id: ngo.id,
        discovered_ngo_id: discoveredMatch?.id ?? null,
        status: "applied",
        match_score: 0,
        source: ["ngo_applied"],
        application_data: applicationData,
      },
      { onConflict: "opportunity_id,ngo_id" },
    )
    .select("*")
    .single();

  if (upsertError) {
    return Response.json({ error: upsertError.message }, { status: 500 });
  }

  const { data: corporate } = await supabaseAdmin.from("corporates").select("company_name").eq("id", opportunity.corporate_id).single();

  return Response.json({
    proposal: toProposalShape(upserted, opportunity, corporate?.company_name || "Partner Corporate", ngo.ngo_name),
  });
}

/**
 * PATCH /api/ngo/proposals
 * Body: { pre_assignment_id, action: 'confirm' }
 * Step 8's NGO-side mutual confirmation. Sets ngo_confirmed_at. Both this
 * and the corporate's confirmation are required, tracked as two separate
 * timestamps, before an admin can activate.
 */
export async function PATCH(request: Request) {
  const user = await getCaller(request);
  if (!user) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const ngo = await getNgoForUser(user);
  if (!ngo) return Response.json({ error: "Only NGO accounts can confirm projects." }, { status: 403 });

  const body = (await request.json()) as { pre_assignment_id?: string; action?: string };
  if (!body.pre_assignment_id || body.action !== "confirm") {
    return Response.json({ error: "pre_assignment_id and action='confirm' are required." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("pre_assignments")
    .update({ ngo_confirmed_at: new Date().toISOString() })
    .eq("id", body.pre_assignment_id)
    .eq("ngo_id", ngo.id)
    .select()
    .single();

  if (error || !data) return Response.json({ error: error?.message ?? "Application not found." }, { status: 404 });
  return Response.json({ preAssignment: data });
}
