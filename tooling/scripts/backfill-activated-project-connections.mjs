/**
 * Backfill missing project_connections for pre_assignments that were activated
 * before the activate route synced legacy connections (ff3e82a).
 *
 *   node tooling/scripts/backfill-activated-project-connections.mjs
 *   node tooling/scripts/backfill-activated-project-connections.mjs --dry-run
 *   node tooling/scripts/backfill-activated-project-connections.mjs --title "old age"
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readEnv() {
  const raw = readFileSync(join(__dirname, "../../.env.local"), "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const [key, ...rest] = line.split("=");
    if (key && rest.length) env[key.trim()] = rest.join("=").trim();
  }
  return env;
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const titleIdx = args.indexOf("--title");
const titleFilter = titleIdx >= 0 ? args[titleIdx + 1]?.toLowerCase() : null;

const env = readEnv();
const URL = env["NEXT_PUBLIC_SUPABASE_URL"];
const KEY = env["SUPABASE_SERVICE_ROLE_KEY"];

if (!URL || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  console.log("\n🔗  Backfill project_connections from activated pre_assignments\n");
  if (dryRun) console.log("(dry run — no writes)\n");

  const { data: rows, error } = await admin
    .from("pre_assignments")
    .select(
      "id, ngo_id, activated_at, opportunity_id, opportunities(id, corporate_id, title, focus_area, budget, lifecycle_status)",
    )
    .not("activated_at", "is", null);

  if (error) {
    console.error("Failed to load pre_assignments:", error.message);
    process.exit(1);
  }

  let synced = 0;
  let skipped = 0;

  for (const row of rows ?? []) {
    const opp = row.opportunities;
    if (!opp?.corporate_id || !row.ngo_id || !opp.title) {
      skipped++;
      continue;
    }
    if (titleFilter && !opp.title.toLowerCase().includes(titleFilter)) {
      continue;
    }

    const { data: existing } = await admin
      .from("project_connections")
      .select("id, status")
      .eq("corporate_id", opp.corporate_id)
      .eq("ngo_id", row.ngo_id)
      .eq("project_name", opp.title)
      .maybeSingle();

    if (existing?.status === "active" || existing?.status === "completed") {
      skipped++;
      continue;
    }

    const payload = {
      corporate_id: opp.corporate_id,
      ngo_id: row.ngo_id,
      project_name: opp.title,
      focus_area: opp.focus_area ?? "CSR",
      budget: opp.budget ?? 2500000,
      status: "active",
      progress: 0,
      milestone: "Kickoff and baseline",
      latest_update: "Project workspace activated (backfill).",
    };

    console.log(`${dryRun ? "[dry-run] would upsert" : "Upserting"}: "${opp.title}" → NGO ${row.ngo_id.slice(0, 8)}…`);

    if (!dryRun) {
      const { error: upsertError } = await admin.from("project_connections").upsert(payload, {
        onConflict: "corporate_id,ngo_id,project_name",
      });
      if (upsertError) {
        console.error(`  ❌ ${upsertError.message}`);
        continue;
      }
      if (opp.lifecycle_status !== "signed") {
        await admin.from("opportunities").update({ lifecycle_status: "signed" }).eq("id", opp.id);
      }
      await admin.from("ngos").update({ has_project: true }).eq("id", row.ngo_id);
    }
    synced++;
  }

  console.log(`\nDone. ${synced} connection(s) ${dryRun ? "would be" : ""} synced, ${skipped} skipped.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
