import { getCaller, getCorporateIdForUser, type AuthUser } from "@/lib/access-control";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { generateProjectTrustScores } from "@/lib/trust-score-engine";

async function getCorporateForUser(user: AuthUser) {
  const corporateId = await getCorporateIdForUser(user);
  if (!corporateId) return null;

  const { data, error } = await supabaseAdmin
    .from("corporates")
    .select("id, company_name")
    .eq("id", corporateId)
    .single();
  if (error || !data) return null;
  return data as { id: string; company_name: string };
}

/**
 * POST /api/corporates/opportunities
 * Create a new CSR opportunity (posted project). Corporate admin or active employee only.
 */
export async function POST(request: Request) {
  const user = await getCaller(request);
  if (!user) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const corp = await getCorporateForUser(user);
  if (!corp) {
    return Response.json({ error: "Only corporate accounts or their active employees can post opportunities." }, { status: 403 });
  }

  const body = (await request.json()) as {
    title?: string;
    focus_area?: string;
    state?: string;
    district?: string;
    budget?: number;
    description?: string;
    sdg_targets?: string[];
    target_beneficiaries?: string[];
    expected_start_date?: string;
    duration_months?: number;
    min_trust_score?: number;
  };

  if (!body.title?.trim() || !body.focus_area?.trim() || !body.budget) {
    return Response.json({ error: "Title, focus area, and budget are required." }, { status: 400 });
  }

  // Attempt to insert with all the new fields on the opportunities table
  const { data, error } = await supabaseAdmin
    .from("opportunities")
    .insert({
      corporate_id: corp.id,
      title: body.title.trim(),
      focus_area: body.focus_area.trim(),
      state: body.state?.trim() || "Pan India",
      budget: body.budget,
      description: body.description?.trim() || "",
      district: body.district?.trim() || null,
      sdg_targets: body.sdg_targets ?? [],
      target_beneficiaries: body.target_beneficiaries ?? [],
      expected_start_date: body.expected_start_date || null,
      duration_months: body.duration_months || null,
      min_trust_score: body.min_trust_score ?? 0,
      status: "open",
      // Post CSR Project is a publish action — NGOs only see published rows.
      lifecycle_status: "published",
      published_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    const isColumnError = error.code === "42703" || error.message?.includes("column") || error.message?.includes("schema cache");
    if (isColumnError) {
      console.warn("New opportunities columns not found in DB. Falling back to legacy columns...");
      const { data: fallbackData, error: fallbackError } = await supabaseAdmin
        .from("opportunities")
        .insert({
          corporate_id: corp.id,
          title: body.title.trim(),
          focus_area: body.focus_area.trim(),
          state: body.state?.trim() || "Pan India",
          budget: body.budget,
          description: body.description?.trim() || "",
        })
        .select()
        .single();
      
      if (fallbackError) {
        return Response.json({ error: fallbackError.message }, { status: 500 });
      }

      try {
        await generateProjectTrustScores(fallbackData.id);
      } catch (scoreError) {
        console.warn("[opportunities API] Trust score generation skipped:", scoreError);
      }

      return Response.json({ opportunity: fallbackData }, { status: 201 });
    }

    return Response.json({ error: error.message }, { status: 500 });
  }

  try {
    await generateProjectTrustScores(data.id);
  } catch (scoreError) {
    console.warn("[opportunities API] Trust score generation skipped:", scoreError);
  }

  return Response.json({ opportunity: data }, { status: 201 });
}

/**
 * GET /api/corporates/opportunities
 * Fetch all opportunities for the authenticated corporate.
 */
export async function GET(request: Request) {
  const user = await getCaller(request);
  if (!user) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const corp = await getCorporateForUser(user);
  if (!corp) {
    return Response.json({ opportunities: [] });
  }

  const { data: opps, error } = await supabaseAdmin
    .from("opportunities")
    .select("*")
    .eq("corporate_id", corp.id)
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ opportunities: opps ?? [] });
}

/**
 * PATCH /api/corporates/opportunities
 * Publish a draft project. Body: { id, action: "publish" }.
 * The creation form still one-shot creates a draft (lifecycle_status
 * defaults to 'draft' at the DB level) — this is the separate publish step.
 */
export async function PATCH(request: Request) {
  const user = await getCaller(request);
  if (!user) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const corp = await getCorporateForUser(user);
  if (!corp) {
    return Response.json({ error: "Only corporate accounts or their active employees can manage opportunities." }, { status: 403 });
  }

  const body = (await request.json()) as { id?: string; action?: string };
  if (!body.id || body.action !== "publish") {
    return Response.json({ error: "id and action='publish' are required." }, { status: 400 });
  }

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("opportunities")
    .select("id, corporate_id, lifecycle_status")
    .eq("id", body.id)
    .eq("corporate_id", corp.id)
    .maybeSingle();

  if (fetchError || !existing) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }
  if (existing.lifecycle_status !== "draft") {
    return Response.json({ error: `Cannot publish — project is already '${existing.lifecycle_status}'.` }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("opportunities")
    .update({ lifecycle_status: "published", published_at: new Date().toISOString() })
    .eq("id", body.id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ opportunity: data });
}
