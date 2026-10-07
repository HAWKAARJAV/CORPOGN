import { supabaseAdmin } from "@/lib/supabase-admin";

function dateOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Starter milestones for a newly activated workspace. Titles are generic CSR
 * phases with the opportunity name woven into the delivery step when present.
 */
export function buildDefaultMilestoneRows(projectTitle?: string | null) {
  const delivery =
    projectTitle && projectTitle.trim().length > 0
      ? `${projectTitle.trim()} — core delivery`
      : "Core program delivery";

  return [
    { title: "Kickoff & baseline", due_date: dateOffset(-14), status: "in_progress", progress: 25 },
    { title: delivery, due_date: dateOffset(30), status: "pending", progress: 0 },
    { title: "Mid-program review", due_date: dateOffset(60), status: "pending", progress: 0 },
    { title: "Outcome measurement", due_date: dateOffset(90), status: "pending", progress: 0 },
    { title: "Final impact report", due_date: dateOffset(120), status: "pending", progress: 0 },
  ];
}

/**
 * Idempotent: inserts starter rows only when the project has zero milestones.
 */
export async function ensureDefaultMilestones(
  projectId: string,
  options?: { projectTitle?: string | null; createdBy?: string | null },
): Promise<{ seeded: boolean; count: number }> {
  const { count, error: countError } = await supabaseAdmin
    .from("milestones")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);

  if (countError) throw new Error(countError.message);
  if ((count ?? 0) > 0) return { seeded: false, count: count ?? 0 };

  const templates = buildDefaultMilestoneRows(options?.projectTitle);
  const createdBy = options?.createdBy ?? null;

  for (const m of templates) {
    const row = { project_id: projectId, ...m, created_by: createdBy };
    const { error: insertError } = await supabaseAdmin.from("milestones").insert(row);
    if (insertError?.message?.includes("progress")) {
      const { progress: _p, ...rest } = m;
      await supabaseAdmin.from("milestones").insert({ project_id: projectId, ...rest, created_by: createdBy });
    } else if (insertError) {
      throw new Error(insertError.message);
    }
  }

  return { seeded: true, count: templates.length };
}
