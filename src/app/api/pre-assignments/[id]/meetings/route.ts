import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCaller, getCorporateIdForUser, getNgoIdForUser } from "@/lib/access-control";

/**
 * Lightweight meeting scheduling on a pre-signed deal — no external Calendar
 * API. Either side proposes a time; either side can confirm; either side can
 * attach a meeting link (Meet/Zoom/etc, pasted, not auto-generated) once
 * booked. Scoped to the same pre_assignment thread as messages.
 */
async function verifyParticipant(preAssignmentId: string, corporateId: string | null, ngoId: string | null) {
  const { data: pa } = await supabaseAdmin
    .from("pre_assignments")
    .select("id, opportunity_id, ngo_id, opportunities(corporate_id)")
    .eq("id", preAssignmentId)
    .maybeSingle();

  if (!pa) return null;
  const oppCorporateId = (pa.opportunities as unknown as { corporate_id: string } | null)?.corporate_id;

  if (corporateId && oppCorporateId === corporateId) return pa;
  if (ngoId && pa.ngo_id === ngoId) return pa;
  return null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: preAssignmentId } = await params;
  const user = await getCaller(request);
  if (!user) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const [corporateId, ngoId] = await Promise.all([getCorporateIdForUser(user), getNgoIdForUser(user)]);
  const pa = await verifyParticipant(preAssignmentId, corporateId, ngoId);
  if (!pa) return Response.json({ error: "Access denied." }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("pre_assignment_meetings")
    .select("*")
    .eq("pre_assignment_id", preAssignmentId)
    .order("scheduled_at", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ meetings: data ?? [] });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: preAssignmentId } = await params;
  const user = await getCaller(request);
  if (!user) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const [corporateId, ngoId] = await Promise.all([getCorporateIdForUser(user), getNgoIdForUser(user)]);
  const pa = await verifyParticipant(preAssignmentId, corporateId, ngoId);
  if (!pa) return Response.json({ error: "Access denied." }, { status: 403 });

  const body = (await request.json()) as { scheduled_at?: string; notes?: string };
  if (!body.scheduled_at) return Response.json({ error: "scheduled_at is required." }, { status: 400 });

  const proposedBy = corporateId ? "corporate" : "ngo";

  const { data, error } = await supabaseAdmin
    .from("pre_assignment_meetings")
    .insert({
      pre_assignment_id: preAssignmentId,
      proposed_by: proposedBy,
      proposed_by_user_id: user.id,
      scheduled_at: body.scheduled_at,
      notes: body.notes?.trim() || null,
      status: "proposed",
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ meeting: data }, { status: 201 });
}

/**
 * PATCH — either confirm a proposed time (sets that side's confirmed_at;
 * status flips to 'confirmed' once both sides have), attach/replace a
 * meeting link, or cancel.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: preAssignmentId } = await params;
  const user = await getCaller(request);
  if (!user) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const [corporateId, ngoId] = await Promise.all([getCorporateIdForUser(user), getNgoIdForUser(user)]);
  const pa = await verifyParticipant(preAssignmentId, corporateId, ngoId);
  if (!pa) return Response.json({ error: "Access denied." }, { status: 403 });

  const body = (await request.json()) as { meeting_id?: string; action?: string; meeting_link?: string };
  if (!body.meeting_id) return Response.json({ error: "meeting_id is required." }, { status: 400 });

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("pre_assignment_meetings")
    .select("*")
    .eq("id", body.meeting_id)
    .eq("pre_assignment_id", preAssignmentId)
    .maybeSingle();
  if (fetchError || !existing) return Response.json({ error: "Meeting not found." }, { status: 404 });

  const update: Record<string, unknown> = {};

  if (body.action === "cancel") {
    update.status = "cancelled";
  } else if (body.action === "confirm") {
    if (corporateId) update.confirmed_by_corporate_at = new Date().toISOString();
    if (ngoId) update.confirmed_by_ngo_at = new Date().toISOString();
    const willBothBeConfirmed =
      (corporateId ? true : Boolean(existing.confirmed_by_corporate_at)) &&
      (ngoId ? true : Boolean(existing.confirmed_by_ngo_at));
    if (willBothBeConfirmed) update.status = "confirmed";
  }

  if (typeof body.meeting_link === "string") {
    update.meeting_link = body.meeting_link.trim() || null;
  }

  if (Object.keys(update).length === 0) {
    return Response.json({ error: "No valid action or field provided." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("pre_assignment_meetings")
    .update(update)
    .eq("id", body.meeting_id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ meeting: data });
}
