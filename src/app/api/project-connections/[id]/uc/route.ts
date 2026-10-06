import { supabaseAdmin } from "@/lib/supabase-admin";
import { authorizeProjectAccess } from "@/lib/access-control";

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
 * POST /api/project-connections/[id]/uc
 *
 * NGO submits a Utilization Certificate for a project connection.
 * On success: marks `uc_submitted = true` and `uc_submitted_at = now()` on project_connections.
 *
 * Body:
 *   amountCertified  number (INR)        required
 *   periodFrom       string (YYYY-MM-DD) optional
 *   periodTo         string (YYYY-MM-DD) optional
 *   milestoneId      string (uuid)       optional – link to a specific milestone
 *   storageObjectId  string              optional – Supabase Storage object path
 *   bucketName       string              optional
 *   fileName         string              optional
 *   mimeType         string              optional
 *   fileSize         number              optional
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: connectionId } = await params;

  const user = await getCaller(request);
  if (!user) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const access = await authorizeProjectAccess(user, connectionId, {
    area: "reports",
    action: "edit",
  });
  if (!access.ok) {
    return Response.json({ error: access.error }, { status: access.status });
  }
  if (access.context.orgType !== "ngo" && access.context.orgType !== "admin") {
    return Response.json(
      { error: "Only NGO accounts can submit Utilization Certificates." },
      { status: 403 },
    );
  }

  const body = (await request.json()) as {
    amountCertified?: number;
    periodFrom?: string;
    periodTo?: string;
    milestoneId?: string;
    storageObjectId?: string;
    bucketName?: string;
    fileName?: string;
    mimeType?: string;
    fileSize?: number;
  };

  if (typeof body.amountCertified !== "number" || body.amountCertified <= 0) {
    return Response.json(
      { error: "amountCertified must be a positive number (INR)." },
      { status: 400 },
    );
  }

  // Insert the UC record
  const { data: uc, error: ucError } = await supabaseAdmin
    .from("utilization_certificates")
    .insert({
      connection_id: connectionId,
      milestone_id: body.milestoneId ?? null,
      submitted_by: user.id,
      amount_certified: body.amountCertified,
      period_from: body.periodFrom ?? null,
      period_to: body.periodTo ?? null,
      storage_object_id: body.storageObjectId ?? null,
      bucket_name: body.bucketName ?? null,
      file_name: body.fileName ?? null,
      mime_type: body.mimeType ?? null,
      file_size: body.fileSize ?? null,
      status: "SUBMITTED",
    })
    .select("*")
    .single();

  if (ucError || !uc) {
    return Response.json(
      { error: ucError?.message || "Failed to create UC record." },
      { status: 500 },
    );
  }

  // Mark the project connection as UC submitted
  const { error: flagError } = await supabaseAdmin
    .from("project_connections")
    .update({
      uc_submitted: true,
      uc_submitted_at: new Date().toISOString(),
    })
    .eq("id", connectionId);

  if (flagError) {
    // UC record inserted successfully but flag failed — log and continue
    console.error("[UC] Failed to set uc_submitted flag:", flagError.message);
  }

  return Response.json({ utilization_certificate: uc }, { status: 201 });
}

/**
 * GET /api/project-connections/[id]/uc
 *
 * Returns all UCs for the given project connection.
 * Accessible to both the NGO and the corporate.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: connectionId } = await params;

  const user = await getCaller(request);
  if (!user) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const access = await authorizeProjectAccess(user, connectionId, {
    area: "reports",
    action: "read_only",
  });
  if (!access.ok) {
    return Response.json({ error: access.error }, { status: access.status });
  }

  const { data, error } = await supabaseAdmin
    .from("utilization_certificates")
    .select("*")
    .eq("connection_id", connectionId)
    .order("submitted_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ utilization_certificates: data ?? [] });
}
