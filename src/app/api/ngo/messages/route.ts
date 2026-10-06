import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCorporateIdForUser, getNgoIdForUser } from "@/lib/access-control";

type AuthUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

function tokenFrom(request: Request) {
  return (request.headers.get("Authorization") ?? "")
    .replace("Bearer ", "")
    .trim();
}

async function getCaller(request: Request): Promise<AuthUser | null> {
  const token = tokenFrom(request);
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user as AuthUser;
}

/**
 * Derive sender_type from auth session — never trust the client body.
 * account_type "ngo" | "ngo_member" → "ngo"
 * account_type "corporate" | "corporate_employee" → "corporate"
 */
function deriveSenderType(user: AuthUser): "ngo" | "corporate" | null {
  const at = user.user_metadata?.account_type;
  if (at === "ngo" || at === "ngo_member") return "ngo";
  if (at === "corporate" || at === "corporate_employee") return "corporate";
  return null;
}

/**
 * Verify the caller is a participant in this project connection.
 * Returns the connection row or null.
 */
async function verifyParticipant(
  user: AuthUser,
  connectionId: string,
): Promise<boolean> {
  const senderType = deriveSenderType(user);
  if (!senderType) return false;

  const { data: connection } = await supabaseAdmin
    .from("project_connections")
    .select("corporate_id, ngo_id")
    .eq("id", connectionId)
    .maybeSingle();

  if (!connection) return false;

  if (senderType === "corporate") {
    const corporateId = await getCorporateIdForUser(user);
    return Boolean(corporateId && corporateId === connection.corporate_id);
  }

  const ngoId = await getNgoIdForUser(user);
  return Boolean(ngoId && ngoId === connection.ngo_id);
}

/**
 * GET /api/ngo/messages?connectionId=<uuid>
 * Returns all messages for a project connection (paginated).
 */
export async function GET(request: Request) {
  const user = await getCaller(request);
  if (!user) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const url = new URL(request.url);
  const connectionId = url.searchParams.get("connectionId");
  if (!connectionId) {
    return Response.json({ error: "connectionId is required." }, { status: 400 });
  }

  const isParticipant = await verifyParticipant(user, connectionId);
  if (!isParticipant) {
    return Response.json({ error: "Access denied." }, { status: 403 });
  }

  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
  const before = url.searchParams.get("before"); // ISO timestamp for cursor-based pagination

  let query = supabaseAdmin
    .from("ngo_project_messages")
    .select("*")
    .eq("connection_id", connectionId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (before) {
    query = query.lt("created_at", before);
  }

  const { data, error } = await query;
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ messages: (data ?? []).reverse() });
}

/**
 * POST /api/ngo/messages
 * Send a message on a project connection.
 * sender_type is derived from the session — client cannot override it.
 */
export async function POST(request: Request) {
  const user = await getCaller(request);
  if (!user) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const senderType = deriveSenderType(user);
  if (!senderType) {
    return Response.json(
      { error: "Only NGO and corporate accounts can send messages." },
      { status: 403 },
    );
  }

  const body = (await request.json()) as {
    connectionId?: string;
    body?: string;
    // Note: sender_type intentionally NOT accepted from client body
  };

  if (!body.connectionId) {
    return Response.json({ error: "connectionId is required." }, { status: 400 });
  }
  if (!body.body?.trim()) {
    return Response.json({ error: "Message body cannot be empty." }, { status: 400 });
  }
  if (body.body.length > 10000) {
    return Response.json({ error: "Message body too long (max 10,000 characters)." }, { status: 400 });
  }

  const isParticipant = await verifyParticipant(user, body.connectionId);
  if (!isParticipant) {
    return Response.json({ error: "Access denied." }, { status: 403 });
  }

  const { data: message, error } = await supabaseAdmin
    .from("ngo_project_messages")
    .insert({
      connection_id: body.connectionId,
      sender_user_id: user.id,        // always from session — never from body
      sender_type: senderType,        // always derived from session — never from body
      body: body.body.trim(),
    })
    .select("*")
    .single();

  if (error || !message) {
    return Response.json({ error: error?.message || "Failed to send message." }, { status: 500 });
  }

  return Response.json({ message }, { status: 201 });
}
