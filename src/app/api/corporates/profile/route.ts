import { supabaseAdmin } from "@/lib/supabase-admin";

async function getCaller(request: Request) {
  const token = (request.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

/**
 * PATCH /api/corporates/profile
 * Updates company_name, company_email, and merges extra fields into registration_data.
 */
export async function PATCH(request: Request) {
  const user = await getCaller(request);
  if (!user) return Response.json({ error: "Unauthorized." }, { status: 401 });

  if (user.user_metadata?.account_type !== "corporate") {
    return Response.json(
      { error: "Only the Corporate account owner can update the profile." },
      { status: 403 },
    );
  }

  const body = (await request.json()) as {
    company_name?: string;
    company_email?: string;
    extra_profile?: Record<string, unknown>;
  };

  const updates: Record<string, unknown> = {};

  if (typeof body.company_name === "string" && body.company_name.trim()) {
    updates.company_name = body.company_name.trim();
  }
  if (typeof body.company_email === "string" && body.company_email.trim()) {
    updates.company_email = body.company_email.trim().toLowerCase();
  }

  // Fetch current registration_data first for merge
  const { data: existing } = await supabaseAdmin
    .from("corporates")
    .select("registration_data")
    .eq("auth_user_id", user.id)
    .single();

  const currentData =
    existing?.registration_data && typeof existing.registration_data === "object"
      ? (existing.registration_data as Record<string, unknown>)
      : {};

  if (body.extra_profile && typeof body.extra_profile === "object") {
    updates.registration_data = {
      ...currentData,
      ...body.extra_profile,
    };
  }

  if (!Object.keys(updates).length) {
    return Response.json({ error: "No fields to update." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("corporates")
    .update(updates)
    .eq("auth_user_id", user.id)
    .select("id, company_name, company_email, slug, access_status, registration_data")
    .single();

  if (error || !data) {
    return Response.json({ error: error?.message || "Profile update failed." }, { status: 500 });
  }

  return Response.json({ corporate: data });
}
