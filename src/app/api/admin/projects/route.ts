import { requirePlatformAdmin } from "@/lib/access-control";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const auth = await requirePlatformAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = parseInt(searchParams.get("limit") ?? "20", 10);
  const status = searchParams.get("status");
  const search = searchParams.get("search");
  const offset = (page - 1) * limit;

  // Query only columns that actually exist in project_connections
  // Resolve corporate name and NGO name via foreign key joins
  let q = supabaseAdmin
    .from("project_connections")
    .select(
      `id, project_name, focus_area, budget, status, progress, milestone,
       latest_update, created_at,
       corporate:corporates(company_name),
       ngo:ngos(ngo_name)`,
      { count: "exact" }
    );

  if (status) q = q.eq("status", status);

  q = q.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

  const { data, count, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Map the records to fit the UI expectation
  const projects = (data ?? []).map((row: any) => {
    // If corporate or ngo joins are arrays (rare) or objects, handle them
    const corpName = row.corporate?.company_name ?? "Corporate Partner";
    const ngoName = row.ngo?.ngo_name ?? "NGO Partner";

    // Clean up budget display: if it's a string like "₹25,00,000", convert to number or keep as is
    // Let's parse budget string if it is formatted, or default to 2500000
    let numericBudget = 2500000;
    if (row.budget) {
      const budgetStr = String(row.budget);
      const cleaned = budgetStr.replace(/[^0-9]/g, "");
      const parsed = parseInt(cleaned, 10);
      if (!isNaN(parsed)) {
        // If it was written as "25L" or similar, scale it (budget is numeric
        // post-migration, but keep this fallback for legacy string values)
        if (budgetStr.toLowerCase().includes("l") && parsed < 100) {
          numericBudget = parsed * 100000;
        } else if (budgetStr.toLowerCase().includes("cr") && parsed < 100) {
          numericBudget = parsed * 10000000;
        } else {
          numericBudget = parsed;
        }
      }
    }

    return {
      id: row.id,
      project_name: row.project_name,
      focus_area: row.focus_area,
      budget: numericBudget,
      status: row.status,
      progress: row.progress,
      milestone: row.milestone,
      latest_update: row.latest_update,
      corporate_name: corpName,
      ngo_name: ngoName,
      created_at: row.created_at,
      uc_submitted: false,
      impact_report_submitted: false,
      ngo_beneficiary_count: null,
    };
  });

  // Client side search filter if search term is provided (since we cannot easily do text search across joined tables in postgrest simple query)
  let filteredProjects = projects;
  if (search) {
    const s = search.toLowerCase();
    filteredProjects = projects.filter(
      (p) =>
        p.project_name.toLowerCase().includes(s) ||
        p.corporate_name.toLowerCase().includes(s) ||
        p.ngo_name.toLowerCase().includes(s)
    );
  }

  return NextResponse.json({
    projects: filteredProjects,
    total: count ?? filteredProjects.length,
    page,
    limit,
  });
}

/**
 * PATCH /api/admin/projects
 *
 * Admin approval workflow for project_connections rows sitting in
 * `pending_admin` (a Corporate accepted an NGO match and it's awaiting
 * platform-admin sign-off before it goes live).
 *
 * Body: { id: string; action: "approve" | "reject" }
 *  - approve: status -> "active", creates project_assignees rows linking
 *    both the corporate owner and the NGO owner to the project, and flips
 *    ngos.has_project to true.
 *  - reject: status -> "proposal" (sent back to the corporate).
 */
export async function PATCH(req: Request) {
  const auth = await requirePlatformAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await req.json().catch(() => null)) as
    | { id?: string; action?: "approve" | "reject" }
    | null;

  const id = body?.id;
  const action = body?.action;

  if (!id || (action !== "approve" && action !== "reject")) {
    return NextResponse.json(
      { error: "id and action ('approve' | 'reject') are required." },
      { status: 400 }
    );
  }

  const { data: connection, error: fetchError } = await supabaseAdmin
    .from("project_connections")
    .select("id, corporate_id, ngo_id, status")
    .eq("id", id)
    .single();

  if (fetchError || !connection) {
    return NextResponse.json({ error: "Connection not found." }, { status: 404 });
  }

  if (action === "reject") {
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("project_connections")
      .update({ status: "proposal" })
      .eq("id", id)
      .select("id, status")
      .single();

    if (updateError || !updated) {
      return NextResponse.json(
        { error: updateError?.message || "Could not reject connection." },
        { status: 500 }
      );
    }

    return NextResponse.json({ connection: updated });
  }

  // action === "approve"
  const { data: updated, error: updateError } = await supabaseAdmin
    .from("project_connections")
    .update({ status: "active" })
    .eq("id", id)
    .select("id, status, corporate_id, ngo_id")
    .single();

  if (updateError || !updated) {
    return NextResponse.json(
      { error: updateError?.message || "Could not approve connection." },
      { status: 500 }
    );
  }

  const [{ data: corporate }, { data: ngo }] = await Promise.all([
    supabaseAdmin.from("corporates").select("id, auth_user_id").eq("id", connection.corporate_id).single(),
    supabaseAdmin.from("ngos").select("id, auth_user_id").eq("id", connection.ngo_id).single(),
  ]);

  const assigneeRows = [
    corporate?.auth_user_id
      ? { project_id: id, user_id: corporate.auth_user_id, role_in_project: "corporate" }
      : null,
    ngo?.auth_user_id
      ? { project_id: id, user_id: ngo.auth_user_id, role_in_project: "ngo" }
      : null,
  ].filter(Boolean) as { project_id: string; user_id: string; role_in_project: string }[];

  if (assigneeRows.length) {
    const { error: assigneeError } = await supabaseAdmin
      .from("project_assignees")
      .upsert(assigneeRows, { onConflict: "project_id,user_id" });
    if (assigneeError) {
      return NextResponse.json({ error: assigneeError.message }, { status: 500 });
    }
  }

  if (connection.ngo_id) {
    await supabaseAdmin.from("ngos").update({ has_project: true }).eq("id", connection.ngo_id);
  }

  return NextResponse.json({ connection: updated });
}
