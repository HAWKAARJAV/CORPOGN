import { getCaller } from "@/lib/access-control";
import { mapConnectionRow } from "@/lib/project-connections";
import { supabaseAdmin } from "@/lib/supabase-admin";

type AuthUser = {
  id: string;
  user_metadata?: Record<string, unknown>;
};

async function getCorporateForUser(user: AuthUser) {
  const accountType = user.user_metadata?.account_type;

  if (accountType === "corporate") {
    const { data } = await supabaseAdmin
      .from("corporates")
      .select("id, company_name, auth_user_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    return data;
  }

  if (accountType === "corporate_employee") {
    const { data: employee } = await supabaseAdmin
      .from("corporate_employees")
      .select("corporate_id, is_active")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    const corporateId =
      employee?.is_active && employee.corporate_id
        ? employee.corporate_id
        : typeof user.user_metadata?.corporate_id === "string"
          ? user.user_metadata.corporate_id
          : "";

    if (!corporateId) return null;

    const { data } = await supabaseAdmin
      .from("corporates")
      .select("id, company_name, auth_user_id")
      .eq("id", corporateId)
      .maybeSingle();
    return data;
  }

  return null;
}

function schemaMissing(error?: { message?: string } | null) {
  return Boolean(error?.message?.includes("schema cache") || error?.message?.includes("does not exist"));
}

export async function GET(request: Request) {
  const user = await getCaller(request);
  if (!user) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const corporate = await getCorporateForUser(user);
  if (!corporate) return Response.json({ recommendations: [] });

  const { data, error } = await supabaseAdmin
    .from("project_recommendations")
    .select("*, ngos(*), opportunities(*)")
    .eq("corporate_id", corporate.id)
    .order("created_at", { ascending: false });

  if (schemaMissing(error)) return Response.json({ recommendations: [] });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ recommendations: data ?? [] });
}

export async function PATCH(request: Request) {
  const user = await getCaller(request);
  if (!user) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const corporate = await getCorporateForUser(user);
  if (!corporate) return Response.json({ error: "Unsupported account type." }, { status: 403 });

  const body = (await request.json()) as {
    recommendationId?: string;
    opportunityId?: string;
    decision?: "accept" | "reject" | "request_more";
  };

  if (!body.decision || (body.decision !== "request_more" && !body.recommendationId)) {
    return Response.json({ error: "decision and recommendationId are required." }, { status: 400 });
  }

  if (body.decision === "request_more") {
    if (!body.opportunityId) return Response.json({ error: "opportunityId is required." }, { status: 400 });

    await supabaseAdmin
      .from("opportunities")
      .update({ corporate_decision_status: "requested_more", admin_status: "pending_recommendation" })
      .eq("id", body.opportunityId)
      .eq("corporate_id", corporate.id);

    await supabaseAdmin
      .from("project_recommendation_batches")
      .update({ status: "requested_more", decision_at: new Date().toISOString() })
      .eq("opportunity_id", body.opportunityId)
      .eq("corporate_id", corporate.id)
      .in("status", ["sent", "reviewing"]);

    return Response.json({ ok: true });
  }

  const { data: recommendation, error: recommendationError } = await supabaseAdmin
    .from("project_recommendations")
    .select("*, opportunities(*), ngos(id, ngo_name, auth_user_id)")
    .eq("id", body.recommendationId)
    .eq("corporate_id", corporate.id)
    .maybeSingle();

  if (recommendationError || !recommendation) {
    return Response.json({ error: "Recommendation not found." }, { status: 404 });
  }

  if (body.decision === "reject") {
    const { data: updated, error } = await supabaseAdmin
      .from("project_recommendations")
      .update({ decision: "rejected", decision_at: new Date().toISOString() })
      .eq("id", recommendation.id)
      .select("*, ngos(*), opportunities(*)")
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ recommendation: updated });
  }

  await supabaseAdmin
    .from("project_recommendations")
    .update({ decision: "rejected", decision_at: new Date().toISOString() })
    .eq("batch_id", recommendation.batch_id)
    .neq("id", recommendation.id);

  await supabaseAdmin
    .from("project_recommendations")
    .update({ decision: "accepted", decision_at: new Date().toISOString() })
    .eq("id", recommendation.id);

  await supabaseAdmin
    .from("project_recommendation_batches")
    .update({ status: "accepted", decision_at: new Date().toISOString() })
    .eq("id", recommendation.batch_id);

  const opportunity = recommendation.opportunities as Record<string, unknown>;
  const projectName = String(opportunity.title ?? "CSR Project");
  const focusArea = String(opportunity.focus_area ?? "Education");
  const budget = Number(opportunity.budget ?? 2500000);

  const { data: connection, error: connectionError } = await supabaseAdmin
    .from("project_connections")
    .upsert(
      {
        corporate_id: corporate.id,
        ngo_id: recommendation.ngo_id,
        opportunity_id: recommendation.opportunity_id,
        project_name: projectName,
        focus_area: focusArea,
        budget,
        status: "active",
        progress: 0,
        milestone: "Allocated",
        latest_update: "Corporate accepted admin recommendation. Project allocated.",
        document_requests: ["CSR-1 certificate", "Latest audit report"],
      },
      { onConflict: "corporate_id,ngo_id,project_name" },
    )
    .select("*")
    .single();

  if (connectionError || !connection) {
    return Response.json({ error: connectionError?.message || "Could not allocate project." }, { status: 500 });
  }

  const { data: allocation } = await supabaseAdmin
    .from("project_allocations")
    .upsert(
      {
        opportunity_id: recommendation.opportunity_id,
        recommendation_id: recommendation.id,
        connection_id: connection.id,
        corporate_id: corporate.id,
        ngo_id: recommendation.ngo_id,
        status: "allocated",
      },
      { onConflict: "opportunity_id" },
    )
    .select("*")
    .single();

  await supabaseAdmin
    .from("opportunities")
    .update({
      status: "assigned",
      assigned_ngo_id: recommendation.ngo_id,
      admin_status: "allocated",
      corporate_decision_status: "accepted",
    })
    .eq("id", recommendation.opportunity_id);

  await supabaseAdmin
    .from("ngos")
    .update({ has_project: true, access_status: "active" })
    .eq("id", recommendation.ngo_id);

  const assignments = [
    corporate.auth_user_id && {
      project_id: connection.id,
      user_id: corporate.auth_user_id,
      role_in_project: "Corporate Owner",
      permissions: { all: "edit" },
    },
    recommendation.ngos?.auth_user_id && {
      project_id: connection.id,
      user_id: recommendation.ngos.auth_user_id,
      role_in_project: "NGO Owner",
      permissions: { all: "edit" },
    },
  ].filter(Boolean);

  if (assignments.length) {
    await supabaseAdmin.from("project_assignees").upsert(assignments, {
      onConflict: "project_id,user_id",
    });
  }

  return Response.json({
    allocation,
    connection: mapConnectionRow(connection as Record<string, unknown>, corporate.company_name, recommendation.ngos?.ngo_name),
  });
}
