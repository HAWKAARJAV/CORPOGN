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
 * POST /api/admin/enrichment/retry
 * Re-queues all failed NGOs and triggers the enrichment script.
 */
export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });

  // Reset all failed NGOs back to pending
  const { data: resetData, error: resetErr } = await supabaseAdmin
    .from("ngos")
    .update({ enrichment_status: "pending", enrichment_error: null })
    .eq("enrichment_status", "failed")
    .is("deleted_at", null)
    .select("id");

  if (resetErr) {
    return Response.json({ error: `Could not reset failed NGOs: ${resetErr.message}` }, { status: 500 });
  }

  const retryCount = resetData?.length ?? 0;

  if (retryCount === 0) {
    return Response.json({ ok: true, message: "No failed NGOs to retry.", retryCount: 0 });
  }

  // Spawn enrichment script targeting all pending (which now includes the reset ones)
  const scriptPath = join(process.cwd(), "scripts", "ngo-enrichment", "enrich.mjs");
  const cmd = `node ${scriptPath} --retry-failed >> /tmp/ngo-enrich-retry.log 2>&1 &`;

  exec(cmd, (err) => {
    if (err) console.error("[enrichment/retry] spawn error:", err.message);
  });

  return Response.json({
    ok: true,
    message: `${retryCount} NGO(s) re-queued and enrichment started.`,
    retryCount,
    logFile: "/tmp/ngo-enrich-retry.log",
  });
}
