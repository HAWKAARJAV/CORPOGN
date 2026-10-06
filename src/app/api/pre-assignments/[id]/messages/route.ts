import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCaller, getCorporateIdForUser, getNgoIdForUser } from "@/lib/access-control";

/**
 * Messaging scoped to a specific pre_assignment (the NGO-corporate-project
 * relationship, from application/suggestion through pre-signed discussion —
 * Steps 6 and 7 share this same thread). Separate from the existing
 * connection_id-based project chat, which only makes sense once a project
 * is actually signed (Step 9) — this covers the phase before that exists.
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
    .from("pre_assignment_messages")
    .select("*")
    .eq("pre_assignment_id", preAssignmentId)
    .order("created_at", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ messages: data ?? [] });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: preAssignmentId } = await params;
  const user = await getCaller(request);
  if (!user) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const [corporateId, ngoId] = await Promise.all([getCorporateIdForUser(user), getNgoIdForUser(user)]);
  const pa = await verifyParticipant(preAssignmentId, corporateId, ngoId);
  if (!pa) return Response.json({ error: "Access denied." }, { status: 403 });

  const body = (await request.json()) as { body?: string };
  if (!body.body?.trim()) return Response.json({ error: "Message body is required." }, { status: 400 });

  const senderType = corporateId ? "corporate" : "ngo";

  const { data, error } = await supabaseAdmin
    .from("pre_assignment_messages")
    .insert({
      pre_assignment_id: preAssignmentId,
      sender_type: senderType,
      sender_user_id: user.id,
      body: body.body.trim(),
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ message: data }, { status: 201 });
}
