/**
 * Insert starter milestone rows for activated workspaces that have none.
 *
 *   npm run backfill:milestones
 *   npm run backfill:milestones -- --dry-run
 *   npm run backfill:milestones -- --title "old age"
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

function dateOffset(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildTemplates(projectTitle) {
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
  console.log("\n📍  Backfill default milestones for activated workspaces\n");
  if (dryRun) console.log("(dry run — no writes)\n");

  const { data: workspaces, error } = await admin
    .from("project_workspaces")
    .select("opportunity_id, ngo_id, opportunities(id, title, lifecycle_status)");

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  let seeded = 0;
  let skipped = 0;

  for (const ws of workspaces ?? []) {
    const opp = ws.opportunities;
    if (!opp || opp.lifecycle_status !== "signed") {
      skipped++;
      continue;
    }
    if (titleFilter && !String(opp.title).toLowerCase().includes(titleFilter)) {
      continue;
    }

    const projectId = ws.opportunity_id;
    const { count } = await admin
      .from("milestones")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId);

    if ((count ?? 0) > 0) {
      skipped++;
      continue;
    }

    const templates = buildTemplates(opp.title);
    console.log(`  + ${opp.title} (${projectId.slice(0, 8)}…) — ${templates.length} milestones`);

    if (!dryRun) {
      for (const m of templates) {
        const row = { project_id: projectId, ...m, created_by: null };
        const { error: insErr } = await admin.from("milestones").insert(row);
        if (insErr?.message?.includes("progress")) {
          const { progress, ...rest } = m;
          await admin.from("milestones").insert({ project_id: projectId, ...rest, created_by: null });
        } else if (insErr) {
          console.error(`    insert failed: ${insErr.message}`);
        }
      }
    }
    seeded++;
  }

  console.log(`\nDone. Seeded ${seeded} workspace(s), skipped ${skipped}.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
