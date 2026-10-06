import { supabaseAdmin } from "@/lib/supabase-admin";
import { getNgoIdForUser } from "@/lib/access-control";

const NGO_PROFILE_SELECT =
  "id, ngo_name, ngo_email, access_status, has_project, trust_score, slug, registration_data, created_at, ngo_type, state, contact_number, website, mission, registration_number, pan_number, year_of_establishment, employee_count, volunteer_count, focus_areas, beneficiary_types";
const NGO_BASE_SELECT =
  "id, ngo_name, ngo_email, access_status, has_project, trust_score, slug, registration_data, created_at";

function isMissingProfileColumn(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
      (error.code === "42703" ||
        error.code === "PGRST204" ||
        error.code === "PGRST205" ||
        error.message?.includes("column") ||
        error.message?.includes("schema cache")),
  );
}

async function selectNgoProfileById(ngoId: string) {
  const result = await supabaseAdmin
    .from("ngos")
    .select(NGO_PROFILE_SELECT)
    .eq("id", ngoId)
    .maybeSingle();

  if (!isMissingProfileColumn(result.error)) {
    return result;
  }

  return supabaseAdmin
    .from("ngos")
    .select(NGO_BASE_SELECT)
    .eq("id", ngoId)
    .maybeSingle();
}

async function getCaller(request: Request) {
  const token = (request.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

/**
 * GET /api/ngo/profile
 * Returns NGO profile details.
 * If ?ngoId=<id> is provided, returns that specific NGO (for corporate review/comparison).
 * Otherwise, returns the caller NGO's own profile.
 */
export async function GET(request: Request) {
  const user = await getCaller(request);
  if (!user) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const url = new URL(request.url);
  const ngoId = url.searchParams.get("ngoId");

  if (ngoId) {
    const { data: ngo, error } = await selectNgoProfileById(ngoId);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
    if (!ngo) {
      return Response.json({ error: "NGO not found." }, { status: 404 });
    }
    return Response.json({ ngo });
  }

  // Fetch caller NGO's profile
  const accountType = user.user_metadata?.account_type;
  let queryId: string | null = null;

  if (accountType === "ngo") {
    const { data: ngo } = await supabaseAdmin
      .from("ngos")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    queryId = ngo?.id || null;
  } else if (accountType === "ngo_member") {
    queryId = await getNgoIdForUser(user);
  }

  if (!queryId) {
    return Response.json({ error: "NGO profile not found." }, { status: 404 });
  }

  const { data: ngo, error } = await selectNgoProfileById(queryId);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ngo });
}

/**
 * PATCH /api/ngo/profile
 * Updates ngo_name and/or ngo_email for the authenticated NGO owner.
 * Optionally accepts extra_profile (object) to merge into registration_data.
 * Only account_type="ngo" (super_admin) can call this.
 */
export async function PATCH(request: Request) {
  const user = await getCaller(request);
  if (!user) return Response.json({ error: "Unauthorized." }, { status: 401 });

  if (user.user_metadata?.account_type !== "ngo") {
    return Response.json(
      { error: "Only the NGO account owner can update the profile." },
      { status: 403 },
    );
  }

  const body = (await request.json()) as {
    ngo_name?: string;
    ngo_email?: string;
    trust_score?: number;
    extra_profile?: Record<string, unknown>;
  };

  const updates: Record<string, unknown> = {};

  if (typeof body.ngo_name === "string" && body.ngo_name.trim()) {
    updates.ngo_name = body.ngo_name.trim();
  }
  if (typeof body.ngo_email === "string" && body.ngo_email.trim()) {
    updates.ngo_email = body.ngo_email.trim().toLowerCase();
  }
  if (typeof body.trust_score === "number") {
    updates.trust_score = body.trust_score;
  }

  // Merge extra_profile into registration_data if provided, and update explicit columns
  if (body.extra_profile && typeof body.extra_profile === "object") {
    const ep = body.extra_profile;

    if (typeof ep.ngo_type === "string") updates.ngo_type = ep.ngo_type.trim();
    if (typeof ep.state === "string") updates.state = ep.state.trim();
    if (typeof ep.contact_number === "string") updates.contact_number = ep.contact_number.trim();
    if (typeof ep.website === "string") updates.website = ep.website.trim();
    if (typeof ep.mission === "string") updates.mission = ep.mission.trim();
    if (typeof ep.registration_number === "string") updates.registration_number = ep.registration_number.trim();
    if (typeof ep.pan_number === "string") updates.pan_number = ep.pan_number.trim();

    if (ep.year_of_establishment !== undefined) {
      const yr = parseInt(String(ep.year_of_establishment), 10);
      updates.year_of_establishment = isNaN(yr) ? null : yr;
    }
    if (ep.number_of_employees !== undefined) {
      const emp = parseInt(String(ep.number_of_employees), 10);
      updates.employee_count = isNaN(emp) ? null : emp;
    }
    if (ep.number_of_volunteers !== undefined) {
      const vol = parseInt(String(ep.number_of_volunteers), 10);
      updates.volunteer_count = isNaN(vol) ? null : vol;
    }
    if (Array.isArray(ep.focus_areas)) {
      updates.focus_areas = ep.focus_areas.map(String);
    }
    if (Array.isArray(ep.beneficiary_types)) {
      updates.beneficiary_types = ep.beneficiary_types.map(String);
    }

    // Fetch current registration_data first for fallback merge
    const { data: existing } = await supabaseAdmin
      .from("ngos")
      .select("registration_data")
      .eq("auth_user_id", user.id)
      .single();

    const currentData =
      existing?.registration_data && typeof existing.registration_data === "object"
        ? (existing.registration_data as Record<string, unknown>)
        : {};

    updates.registration_data = {
      ...currentData,
      ...body.extra_profile,
    };
  }

  if (!Object.keys(updates).length) {
    return Response.json({ error: "No valid fields to update." }, { status: 400 });
  }

  let { data, error } = await supabaseAdmin
    .from("ngos")
    .update(updates)
    .eq("auth_user_id", user.id)
    .select("id, ngo_name, ngo_email, access_status, has_project, trust_score, slug, registration_data")
    .single();

  if (error && (error.message.includes("column") || error.message.includes("schema cache") || error.code === "PGRST205")) {
    console.warn("[PATCH Profile] Missing explicit profile columns in DB. Falling back to base columns only.");
    const baseUpdates: Record<string, unknown> = {};
    if (updates.ngo_name !== undefined) baseUpdates.ngo_name = updates.ngo_name;
    if (updates.ngo_email !== undefined) baseUpdates.ngo_email = updates.ngo_email;
    if (updates.trust_score !== undefined) baseUpdates.trust_score = updates.trust_score;
    if (updates.registration_data !== undefined) baseUpdates.registration_data = updates.registration_data;

    const retry = await supabaseAdmin
      .from("ngos")
      .update(baseUpdates)
      .eq("auth_user_id", user.id)
      .select("id, ngo_name, ngo_email, access_status, has_project, trust_score, slug, registration_data")
      .single();

    data = retry.data;
    error = retry.error;
  }

  if (error || !data) {
    return Response.json({ error: error?.message || "Update failed." }, { status: 500 });
  }

  return Response.json({ ngo: data });
}
