import { getCaller, getOrgContext } from "@/lib/access-control";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { generateProjectTrustScores } from "@/lib/trust-score-engine";

async function requireAdmin(request: Request) {
  const user = await getCaller(request);
  if (!user) return { error: "Unauthorized.", status: 401 } as const;

  const context = await getOrgContext(user);
  if (!context || context.accountType !== "admin") {
    return { error: "Only platform admins can access this endpoint.", status: 403 } as const;
  }

  return { user, context } as const;
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });

  const body = (await request.json()) as {
    opportunityId?: string;
    ngoIds?: string[];
    notes?: string;
  };

  const ngoIds = [...new Set(body.ngoIds ?? [])].filter(Boolean);
  if (!body.opportunityId || !ngoIds.length || ngoIds.length > 10) {
    return Response.json({ error: "Select 1 to 10 NGOs for this project." }, { status: 400 });
  }

  const { data: opportunity, error: opportunityError } = await supabaseAdmin
    .from("opportunities")
    .select("id, corporate_id")
    .eq("id", body.opportunityId)
    .maybeSingle();

  if (opportunityError || !opportunity) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  await generateProjectTrustScores(body.opportunityId);

  const { data: scoreRows, error: scoresError } = await supabaseAdmin
    .from("ngo_project_trust_scores")
    .select("*")
    .eq("opportunity_id", body.opportunityId)
    .in("ngo_id", ngoIds);

  if (scoresError) return Response.json({ error: scoresError.message }, { status: 500 });

  const scoreByNgo = new Map((scoreRows ?? []).map((score) => [score.ngo_id, score]));

  const { data: batch, error: batchError } = await supabaseAdmin
    .from("project_recommendation_batches")
    .insert({
      opportunity_id: body.opportunityId,
      corporate_id: opportunity.corporate_id,
      sent_by: auth.context.orgId,
      status: "sent",
      notes: body.notes?.trim() || null,
    })
    .select("*")
    .single();

  if (batchError || !batch) {
    return Response.json({ error: batchError?.message || "Could not create recommendation batch." }, { status: 500 });
  }

  const rows = ngoIds.map((ngoId, index) => {
    const score = scoreByNgo.get(ngoId);
    return {
      batch_id: batch.id,
      opportunity_id: body.opportunityId,
      corporate_id: opportunity.corporate_id,
      ngo_id: ngoId,
      trust_score_id: score?.id ?? null,
      rank: index + 1,
      trust_score: score?.overall_score ?? 0,
      score_breakdown: score?.score_breakdown ?? {},
      why_recommended: score?.why_recommended ?? "Recommended by platform admin.",
      key_strengths: score?.key_strengths ?? [],
      past_similar_projects: score?.past_similar_projects ?? "",
      budget_experience: score?.budget_experience ?? "",
      compliance_status: score?.compliance_status ?? "",
    };
  });

  const { data: recommendations, error: recommendationsError } = await supabaseAdmin
    .from("project_recommendations")
    .insert(rows)
    .select("*, ngos(id, ngo_name, ngo_email)");

  if (recommendationsError) {
    return Response.json({ error: recommendationsError.message }, { status: 500 });
  }

  await supabaseAdmin
    .from("opportunities")
    .update({
      admin_status: "recommendations_sent",
      corporate_decision_status: "reviewing",
      recommendation_sent_at: new Date().toISOString(),
    })
    .eq("id", body.opportunityId);

  return Response.json({ batch, recommendations });
}
