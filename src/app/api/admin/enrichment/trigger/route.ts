import { getCaller, getOrgContext } from "@/lib/access-control";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { exec } from "child_process";
import { join } from "path";

async function requireAdmin(request: Request) {
  const user = await getCaller(request);
  if (!user) return { error: "Unauthorized.", status: 401 } as const;
  const context = await getOrgContext(user);
  if (!context || context.accountType !== "admin") {
    return { error: "Only platform admins can access this endpoint.", status: 403 } as const;
  }
  return { user, context } as const;
}

/**
 * POST /api/admin/enrichment/trigger
 * Body: { ngoId?: string }   — omit for batch, provide to enrich one NGO
 *
 * Spawns the enrichment script in the background (fire-and-forget).
 * Returns immediately — the caller should poll /progress for status.
 */
export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });

  let body: { ngoId?: string; batch?: number } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine
  }

  const { ngoId, batch } = body;

  if (ngoId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ngoId)) {
    return Response.json({ error: "Invalid ngoId (must be a UUID)." }, { status: 400 });
  }

  // If a single NGO: mark it pending so the script picks it up
  if (ngoId) {
    const { error } = await supabaseAdmin
      .from("ngos")
      .update({ enrichment_status: "pending", enrichment_error: null })
      .eq("id", ngoId)
      .is("deleted_at", null);

    if (error) {
      return Response.json({ error: `Could not reset NGO status: ${error.message}` }, { status: 500 });
    }
  }

  // Spawn the Node enrichment script as a background process.
  // The cwd must be the project root so env.mjs resolves .env.local correctly.
  const scriptPath = join(process.cwd(), "scripts", "ngo-enrichment", "enrich.mjs");

  const args: string[] = [];
  if (ngoId)  args.push(`--ngo-id ${ngoId}`);
  if (batch)  args.push(`--batch ${batch}`);

  const cmd = `node ${scriptPath} ${args.join(" ")} >> /tmp/ngo-enrich.log 2>&1 &`;

  exec(cmd, (err) => {
    if (err) console.error("[enrichment/trigger] spawn error:", err.message);
  });

  return Response.json({
    ok: true,
    message: ngoId
      ? `Enrichment triggered for NGO ${ngoId}.`
      : "Batch enrichment triggered. Poll /api/admin/enrichment/progress for updates.",
    logFile: "/tmp/ngo-enrich.log",
  });
}
