import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCorporateIdForUser } from "@/lib/access-control";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.replace("Bearer ", "");

  if (!token) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(token);

  if (userError || !user) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { corporateId, body } = (await request.json()) as {
    corporateId?: string;
    body?: string;
  };

  if (!corporateId || !body?.trim()) {
    return Response.json({ error: "Message is required." }, { status: 400 });
  }

  // Accepts both the corporate owner account and its employees — an
  // employee's own corporate_id (resolved from corporate_employees, not the
  // request body) must match the corporateId they're posting to.
  const callerCorporateId = await getCorporateIdForUser(user);

  const { data: corporate, error: corporateError } = await supabaseAdmin
    .from("corporates")
    .select("id, access_status")
    .eq("id", corporateId)
    .maybeSingle();

  if (corporateError || !corporate || !callerCorporateId || callerCorporateId !== corporate.id) {
    return Response.json({ error: "Corporate profile not found." }, { status: 404 });
  }

  const { data: message, error: messageError } = await supabaseAdmin
    .from("corporate_messages")
    .insert({
      corporate_id: corporateId,
      sender_type: "corporate",
      body: body.trim(),
    })
    .select("id, corporate_id, sender_type, body, created_at")
    .single();

  if (messageError) {
    return Response.json({ error: messageError.message }, { status: 500 });
  }

  if (corporate.access_status !== "active") {
    const { error: unlockError } = await supabaseAdmin
      .from("corporates")
      .update({
        access_status: "active",
        unlocked_at: new Date().toISOString(),
      })
      .eq("id", corporateId);

    if (unlockError) {
      return Response.json({ error: unlockError.message }, { status: 500 });
    }
  }

  return Response.json({ message });
}
