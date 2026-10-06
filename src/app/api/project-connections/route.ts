import {
  defaultNgoCandidates,
  mapConnectionRow,
  projectNameForFocus,
  type NgoCandidate,
} from "@/lib/project-connections";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCaller, getCorporateIdForUser, getNgoIdForUser, type AuthUser } from "@/lib/access-control";

function isMissingConnectionTable(error?: { message?: string } | null) {
  return Boolean(
    error?.message?.includes("project_connections") &&
    error.message.includes("schema cache"),
  );
}

function jsonField(record: unknown, key: string) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return undefined;
  }

  const value = (record as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

async function getCorporateForUser(user: AuthUser) {
  const corporateId = await getCorporateIdForUser(user);
  if (!corporateId) return null;

  const { data, error } = await supabaseAdmin
    .from("corporates")
    .select("id, company_name")
    .eq("id", corporateId)
    .single();
  if (error || !data) return null;
  return data as { id: string; company_name: string };
}

async function getNgoForUser(user: AuthUser) {
  const accountType = user.user_metadata?.account_type;

  if (accountType === "ngo") {
    const { data, error } = await supabaseAdmin
      .from("ngos")
      .select("id, ngo_name")
      .eq("auth_user_id", user.id)
      .single();
    if (error || !data) return null;
    return data as { id: string; ngo_name: string };
  }

  if (accountType === "ngo_member") {
    const ngoId = await getNgoIdForUser(user);
    if (!ngoId) return null;

    const { data, error } = await supabaseAdmin
      .from("ngos")
      .select("id, ngo_name")
      .eq("id", ngoId)
      .single();
    if (error || !data) return null;
    return data as { id: string; ngo_name: string };
  }

  return null;
}

async function loadConnections(filter: { corporateId?: string; ngoId?: string }) {
  let query = supabaseAdmin
    .from("project_connections")
    .select("*")
    .order("created_at", { ascending: false });

  if (filter.corporateId) query = query.eq("corporate_id", filter.corporateId);
  if (filter.ngoId) query = query.eq("ngo_id", filter.ngoId);

  const { data, error } = await query;

  if (isMissingConnectionTable(error)) {
    return { connections: [], schemaMissing: true };
  }

  if (error) throw error;

  const rows = (data ?? []) as Record<string, unknown>[];
  const corporateIds = [...new Set(rows.map((row) => String(row.corporate_id)))];
  const ngoIds = [...new Set(rows.map((row) => String(row.ngo_id)))];

  const [{ data: corporates }, { data: ngos }] = await Promise.all([
    corporateIds.length
      ? supabaseAdmin.from("corporates").select("id, company_name").in("id", corporateIds)
      : Promise.resolve({ data: [] }),
    ngoIds.length
      ? supabaseAdmin.from("ngos").select("id, ngo_name").in("id", ngoIds)
      : Promise.resolve({ data: [] }),
  ]);

  const corporateNames = new Map(
    (corporates ?? []).map((row) => [row.id, row.company_name]),
  );
  const ngoNames = new Map((ngos ?? []).map((row) => [row.id, row.ngo_name]));

  return {
    connections: rows.map((row) =>
      mapConnectionRow(
        row,
        corporateNames.get(String(row.corporate_id)),
        ngoNames.get(String(row.ngo_id)),
      ),
    ),
    schemaMissing: false,
  };
}

async function loadCandidates(): Promise<NgoCandidate[]> {
  const { data, error } = await supabaseAdmin
    .from("ngos")
    .select("id, ngo_name, access_status, trust_score, registration_data")
    .in("access_status", ["verified", "active"])
    .order("trust_score", { ascending: false });

  if (error || !data?.length) return defaultNgoCandidates;

  return data.map((ngo) => ({
    id: ngo.id,
    name: ngo.ngo_name,
    focusArea: jsonField(ngo.registration_data, "focusArea") ?? "Education",
    state: jsonField(ngo.registration_data, "state") ?? "India",
    trustScore: ngo.trust_score ?? 0,
    status: ngo.access_status === "active" ? "Active" : "Verified",
    activeProjects: 0,
    rating: "4.6",
  }));
}

export async function GET(request: Request) {
  const user = await getCaller(request);
  if (!user) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const corporate = await getCorporateForUser(user);
  if (corporate) {
    const result = await loadConnections({ corporateId: corporate.id });
    const candidates = await loadCandidates();
    return Response.json({
      connections: result.connections,
      candidates,
      schemaMissing: result.schemaMissing,
    });
  }

  const ngo = await getNgoForUser(user);
  if (ngo) {
    const result = await loadConnections({ ngoId: ngo.id });
    return Response.json({
      connections: result.connections,
      candidates: [],
      schemaMissing: result.schemaMissing,
    });
  }

  return Response.json({ error: "Unsupported account type." }, { status: 403 });
}

export async function PATCH(request: Request) {
  const user = await getCaller(request);
  if (!user) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const ngo = await getNgoForUser(user);
  if (!ngo) {
    return Response.json(
      { error: "Only NGO accounts can post updates." },
      { status: 403 },
    );
  }

  const body = (await request.json()) as {
    connectionId: string;
    latest_update?: string;
    progress?: number;
    ngo_progress_notes?: string;
    ngo_milestone_status?: "on_track" | "delayed" | "completed";
    ngo_beneficiary_count?: number;
  };

  if (!body.connectionId) {
    return Response.json({ error: "connectionId is required." }, { status: 400 });
  }

  // Verify this connection belongs to this NGO
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("project_connections")
    .select("id, ngo_id")
    .eq("id", body.connectionId)
    .eq("ngo_id", ngo.id)
    .single();

  if (fetchError || !existing) {
    return Response.json({ error: "Connection not found." }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.latest_update === "string" && body.latest_update.trim()) {
    updates.latest_update = body.latest_update.trim();
  }
  if (typeof body.progress === "number" && body.progress >= 0 && body.progress <= 100) {
    updates.progress = body.progress;
  }
  if (typeof body.ngo_progress_notes === "string") {
    updates.ngo_progress_notes = body.ngo_progress_notes.trim() || null;
  }
  if (body.ngo_milestone_status === "on_track" || body.ngo_milestone_status === "delayed" || body.ngo_milestone_status === "completed") {
    updates.ngo_milestone_status = body.ngo_milestone_status;
  }
  if (typeof body.ngo_beneficiary_count === "number" && body.ngo_beneficiary_count >= 0) {
    updates.ngo_beneficiary_count = body.ngo_beneficiary_count;
  }

  if (!Object.keys(updates).length) {
    return Response.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("project_connections")
    .update(updates)
    .eq("id", body.connectionId)
    .select("*")
    .single();

  if (updateError || !updated) {
    return Response.json(
      { error: updateError?.message || "Update failed." },
      { status: 500 },
    );
  }

  // Look up corporate name for the response
  const { data: corporate } = await supabaseAdmin
    .from("corporates")
    .select("company_name")
    .eq("id", String((updated as Record<string, unknown>).corporate_id))
    .single();

  return Response.json({
    connection: mapConnectionRow(
      updated as Record<string, unknown>,
      corporate?.company_name,
      ngo.ngo_name,
    ),
  });
}

export async function POST(request: Request) {
  const user = await getCaller(request);
  if (!user) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const corporate = await getCorporateForUser(user);
  if (!corporate) {
    return Response.json(
      { error: "Only corporate accounts can assign projects." },
      { status: 403 },
    );
  }

  const body = (await request.json()) as {
    ngoId?: string;
    ngoName?: string;
    projectName?: string;
    focusArea?: string;
    budget?: number;
    proposalId?: string;
    opportunityId?: string;
  };

  let ngoId = body.ngoId;
  let ngoName = body.ngoName;

  if (!ngoId && ngoName) {
    const { data: ngo } = await supabaseAdmin
      .from("ngos")
      .select("id, ngo_name")
      .ilike("ngo_name", ngoName)
      .maybeSingle();
    ngoId = ngo?.id;
    ngoName = ngo?.ngo_name ?? ngoName;
  }

  if (!ngoId) {
    return Response.json(
      { error: "Select a registered NGO before assigning a project." },
      { status: 400 },
    );
  }

  const focusArea = body.focusArea?.trim() || "Education";
  const projectName = body.projectName?.trim() || projectNameForFocus(focusArea);

  const existingConnectionQuery = supabaseAdmin
    .from("project_connections")
    .select("*")
    .eq("corporate_id", corporate.id);

  const { data: existingConnection, error: existingError } = body.proposalId
    ? await existingConnectionQuery
        .eq("id", body.proposalId)
        .eq("ngo_id", ngoId)
        .maybeSingle()
    : await existingConnectionQuery
        .eq("ngo_id", ngoId)
        .eq("project_name", projectName)
        .maybeSingle();

  if (isMissingConnectionTable(existingError)) {
    return Response.json(
      { error: "Apply supabase-schema.sql so project_connections exists." },
      { status: 500 },
    );
  }

  if (existingError) {
    return Response.json({ error: existingError.message }, { status: 500 });
  }

  if (existingConnection) {
    if (existingConnection.status === "proposal") {
      const { data: pending, error: pendingError } = await supabaseAdmin
        .from("project_connections")
        .update({
          status: "pending_admin",
          progress: 18,
          milestone: "Kickoff and baseline",
          latest_update: "Corporate accepted proposal. Awaiting platform admin approval.",
          budget: typeof body.budget === "number" ? body.budget : existingConnection.budget,
          opportunity_id: body.opportunityId ?? existingConnection.opportunity_id ?? null,
        })
        .eq("id", existingConnection.id)
        .select("*")
        .single();

      if (pendingError || !pending) {
        return Response.json(
          { error: pendingError?.message || "Could not submit assignment for admin approval." },
          { status: 500 },
        );
      }

      await supabaseAdmin
        .from("opportunities")
        .update({ status: "assigned", assigned_ngo_id: ngoId })
        .eq("corporate_id", corporate.id)
        .ilike("title", projectName);

      return Response.json({
        connection: mapConnectionRow(
          pending as Record<string, unknown>,
          corporate.company_name,
          ngoName,
        ),
      });
    }

    return Response.json({
      connection: mapConnectionRow(
        existingConnection as Record<string, unknown>,
        corporate.company_name,
        ngoName,
      ),
    });
  }

  const { data: connection, error } = await supabaseAdmin
    .from("project_connections")
    .insert({
      corporate_id: corporate.id,
      ngo_id: ngoId,
      project_name: projectName,
      focus_area: focusArea,
      budget: typeof body.budget === "number" ? body.budget : 2500000,
      status: "pending_admin",
      progress: 18,
      milestone: "Kickoff and baseline",
      latest_update: "Corporate assigned the project. Awaiting platform admin approval.",
      document_requests: ["CSR-1 certificate", "Latest audit report"],
      opportunity_id: body.opportunityId ?? null,
    })
    .select("*")
    .single();

  if (isMissingConnectionTable(error)) {
    return Response.json(
      { error: "Apply supabase-schema.sql so project_connections exists." },
      { status: 500 },
    );
  }

  if (error || !connection) {
    return Response.json(
      { error: error?.message || "Could not assign project." },
      { status: 500 },
    );
  }

  await supabaseAdmin
    .from("opportunities")
    .update({ status: "assigned", assigned_ngo_id: ngoId })
    .eq("corporate_id", corporate.id)
    .ilike("title", projectName);

  return Response.json({
    connection: mapConnectionRow(
      connection as Record<string, unknown>,
      corporate.company_name,
      ngoName,
    ),
  });
}
