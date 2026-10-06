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

type KeyOutcome = {
  metric: string;
  target: number | string;
  actual: number | string;
  unit: string;
};

/**
 * POST /api/project-connections/[id]/impact-report
 *
 * NGO submits an Impact Report for a project connection.
 * On success: marks `impact_report_submitted = true` on project_connections.
 *
 * Body:
 *   title              string                required
 *   periodFrom         string (YYYY-MM-DD)   optional
 *   periodTo           string (YYYY-MM-DD)   optional
 *   beneficiaryCount   number                required (>= 0)
 *   keyOutcomes        KeyOutcome[]           optional  — { metric, target, actual, unit }
 *   narrative          string                optional
 *   storageObjectId    string                optional – Supabase Storage object path (for PDF)
 *   bucketName         string                optional
 *   fileName           string                optional
 *   mimeType           string                optional
 *   fileSize           number                optional
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
      { error: "Only NGO accounts can submit Impact Reports." },
      { status: 403 },
    );
  }

  const body = (await request.json()) as {
    title?: string;
    periodFrom?: string;
    periodTo?: string;
    beneficiaryCount?: number;
    keyOutcomes?: KeyOutcome[];
    narrative?: string;
    storageObjectId?: string;
    bucketName?: string;
    fileName?: string;
    mimeType?: string;
    fileSize?: number;
  };

  if (!body.title?.trim()) {
    return Response.json({ error: "title is required." }, { status: 400 });
  }
  if (typeof body.beneficiaryCount !== "number" || body.beneficiaryCount < 0) {
    return Response.json(
      { error: "beneficiaryCount must be a non-negative number." },
      { status: 400 },
    );
  }

  // Validate keyOutcomes shape (if provided)
  const keyOutcomes: KeyOutcome[] = [];
  if (Array.isArray(body.keyOutcomes)) {
    for (const outcome of body.keyOutcomes) {
      if (typeof outcome?.metric !== "string" || !outcome.metric.trim()) continue;
      keyOutcomes.push({
        metric: outcome.metric.trim(),
        target: outcome.target ?? 0,
        actual: outcome.actual ?? 0,
        unit: typeof outcome.unit === "string" ? outcome.unit.trim() : "",
      });
    }
  }

  // Insert the impact report record
  const { data: report, error: reportError } = await supabaseAdmin
    .from("impact_reports")
    .insert({
      connection_id: connectionId,
      submitted_by: user.id,
      title: body.title.trim(),
      period_from: body.periodFrom ?? null,
      period_to: body.periodTo ?? null,
      beneficiary_count: body.beneficiaryCount,
      key_outcomes: keyOutcomes,
      narrative: body.narrative?.trim() ?? null,
      storage_object_id: body.storageObjectId ?? null,
      bucket_name: body.bucketName ?? null,
      file_name: body.fileName ?? null,
      mime_type: body.mimeType ?? null,
      file_size: body.fileSize ?? null,
      status: "SUBMITTED",
    })
    .select("*")
    .single();

  if (reportError || !report) {
    return Response.json(
      { error: reportError?.message || "Failed to create Impact Report." },
      { status: 500 },
    );
  }

  // Mark the project connection as impact report submitted
  const { error: flagError } = await supabaseAdmin
    .from("project_connections")
    .update({
      impact_report_submitted: true,
      impact_report_submitted_at: new Date().toISOString(),
    })
    .eq("id", connectionId);

  if (flagError) {
    console.error("[ImpactReport] Failed to set impact_report_submitted flag:", flagError.message);
  }

  return Response.json({ impact_report: report }, { status: 201 });
}

/**
 * GET /api/project-connections/[id]/impact-report
 *
 * Returns all impact reports for the given project connection.
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
    .from("impact_reports")
    .select("*")
    .eq("connection_id", connectionId)
    .order("submitted_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ impact_reports: data ?? [] });
}
