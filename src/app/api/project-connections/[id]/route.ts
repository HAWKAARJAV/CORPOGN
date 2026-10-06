import { supabaseAdmin } from "@/lib/supabase-admin";
import { mapConnectionRow } from "@/lib/project-connections";
import { getNgoIdForUser } from "@/lib/access-control";

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

async function getCorporateForUser(user: AuthUser) {
  const accountType = user.user_metadata?.account_type;

  if (accountType === "corporate") {
    const { data, error } = await supabaseAdmin
      .from("corporates")
      .select("id, company_name")
      .eq("auth_user_id", user.id)
      .single();
    if (error || !data) return null;
    return data as { id: string; company_name: string };
  }

  if (accountType === "corporate_employee") {
    const { data: employee } = await supabaseAdmin
      .from("corporate_employees")
      .select("corporate_id, is_active")
      .eq("auth_user_id", user.id)
      .single();

    const corporateId =
      employee?.is_active && employee.corporate_id
        ? employee.corporate_id
        : (user.user_metadata?.corporate_id as string | undefined);

    if (!corporateId) return null;

    const { data, error } = await supabaseAdmin
      .from("corporates")
      .select("id, company_name")
      .eq("id", corporateId)
      .single();
    if (error || !data) return null;
    return data as { id: string; company_name: string };
  }

  return null;
}

/**
 * PATCH /api/project-connections/[id]
 *
 * Supports updates from both Corporate (updates document_requests list)
 * and NGO (updates progress, latest_update, etc.).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: connectionId } = await params;

  const user = await getCaller(request);
  if (!user) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const ngo = await getNgoForUser(user);
  const corporate = await getCorporateForUser(user);

  if (!ngo && !corporate) {
    return Response.json(
      { error: "Unauthorized account type." },
      { status: 403 },
    );
  }

  // 1. NGO Update Flow
  if (ngo) {
    // Verify this connection belongs to this NGO
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("project_connections")
      .select("id, ngo_id, corporate_id")
      .eq("id", connectionId)
      .eq("ngo_id", ngo.id)
      .single();

    if (fetchError || !existing) {
      return Response.json({ error: "Connection not found." }, { status: 404 });
    }

    const body = (await request.json()) as {
      latest_update?: string;
      progress?: number;
      ngo_progress_notes?: string;
      ngo_milestone_status?: "on_track" | "delayed" | "completed";
      ngo_beneficiary_count?: number;
    };

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
    if (
      body.ngo_milestone_status === "on_track" ||
      body.ngo_milestone_status === "delayed" ||
      body.ngo_milestone_status === "completed"
    ) {
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
      .eq("id", connectionId)
      .select("*")
      .single();

    if (updateError || !updated) {
      return Response.json(
        { error: updateError?.message || "Update failed." },
        { status: 500 },
      );
    }

    const { data: corp } = await supabaseAdmin
      .from("corporates")
      .select("company_name")
      .eq("id", String((updated as Record<string, unknown>).corporate_id))
      .single();

    return Response.json({
      connection: mapConnectionRow(
        updated as Record<string, unknown>,
        corp?.company_name,
        ngo.ngo_name,
      ),
    });
  }

  // 2. Corporate Update Flow
  if (corporate) {
    // Verify this connection belongs to this corporate
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("project_connections")
      .select("id, ngo_id, corporate_id")
      .eq("id", connectionId)
      .eq("corporate_id", corporate.id)
      .single();

    if (fetchError || !existing) {
      return Response.json({ error: "Connection not found." }, { status: 404 });
    }

    const body = (await request.json()) as {
      document_requests?: string[];
    };

    if (!body.document_requests || !Array.isArray(body.document_requests)) {
      return Response.json(
        { error: "document_requests is required as an array of strings." },
        { status: 400 },
      );
    }

    const updates = {
      document_requests: body.document_requests,
    };

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("project_connections")
      .update(updates)
      .eq("id", connectionId)
      .select("*")
      .single();

    if (updateError || !updated) {
      return Response.json(
        { error: updateError?.message || "Update failed." },
        { status: 500 },
      );
    }

    const { data: ngoRow } = await supabaseAdmin
      .from("ngos")
      .select("ngo_name")
      .eq("id", String((updated as Record<string, unknown>).ngo_id))
      .single();

    return Response.json({
      connection: mapConnectionRow(
        updated as Record<string, unknown>,
        corporate.company_name,
        ngoRow?.ngo_name || "NGO Partner",
      ),
    });
  }
}

/**
 * GET /api/project-connections/[id]
 * Returns a single project connection. Accessible to both corporate and NGO participants.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: connectionId } = await params;

  const user = await getCaller(request);
  if (!user) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const { data: row, error } = await supabaseAdmin
    .from("project_connections")
    .select("*")
    .eq("id", connectionId)
    .single();

  if (error || !row) {
    return Response.json({ error: "Connection not found." }, { status: 404 });
  }

  const r = row as Record<string, unknown>;

  // Authorisation: caller must be the corporate or the NGO
  const accountType = user.user_metadata?.account_type;
  let authorized = false;

  if (accountType === "corporate") {
    const { data: corp } = await supabaseAdmin
      .from("corporates")
      .select("id")
      .eq("auth_user_id", user.id)
      .single();
    authorized = corp?.id === r.corporate_id;
  } else if (accountType === "corporate_employee") {
    const { data: emp } = await supabaseAdmin
      .from("corporate_employees")
      .select("corporate_id, is_active")
      .eq("auth_user_id", user.id)
      .single();
    authorized = Boolean(emp?.is_active && emp.corporate_id === r.corporate_id);
  } else if (accountType === "ngo") {
    const { data: ngo } = await supabaseAdmin
      .from("ngos")
      .select("id")
      .eq("auth_user_id", user.id)
      .single();
    authorized = ngo?.id === r.ngo_id;
  } else if (accountType === "ngo_member") {
    const ngoId = await getNgoIdForUser(user);
    authorized = Boolean(ngoId) && ngoId === r.ngo_id;
  }

  if (!authorized) {
    return Response.json({ error: "Access denied." }, { status: 403 });
  }

  const [{ data: corps }, { data: ngos }] = await Promise.all([
    supabaseAdmin.from("corporates").select("company_name").eq("id", String(r.corporate_id)).single(),
    supabaseAdmin.from("ngos").select("ngo_name").eq("id", String(r.ngo_id)).single(),
  ]);

  return Response.json({
    connection: mapConnectionRow(r, corps?.company_name, ngos?.ngo_name),
  });
}
