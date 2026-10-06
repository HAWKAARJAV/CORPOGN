/**
 * Seed script: creates the Rural Education Mission project connection
 * between Demo Corporation and Green Earth Foundation.
 *
 * Run AFTER creating the project_connections table in Supabase SQL Editor.
 *
 *   node scripts/seed-project-connection.mjs
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

const env   = readEnv();
const URL   = env["NEXT_PUBLIC_SUPABASE_URL"];
const KEY   = env["SUPABASE_SERVICE_ROLE_KEY"];
const admin = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const CORPORATE_ID = "b890460b-58be-4943-a8fb-61679960dbe8"; // Demo Corporation
const NGO_ID       = "26ee7712-7e9b-4bb5-ae37-38da6a75a886"; // Green Earth Foundation

async function main() {
  console.log("\n🔗  Seeding Rural Education Mission project connection...\n");

  // Verify both entities exist
  const { data: corp } = await admin.from("corporates").select("company_name, slug, access_status").eq("id", CORPORATE_ID).single();
  const { data: ngo  } = await admin.from("ngos").select("ngo_name, access_status, has_project").eq("id", NGO_ID).single();

  if (!corp) { console.error("❌ Demo Corporation not found."); process.exit(1); }
  if (!ngo)  { console.error("❌ Green Earth Foundation not found."); process.exit(1); }

  console.log(`Corporate : ${corp.company_name} (${corp.access_status})`);
  console.log(`NGO       : ${ngo.ngo_name} (${ngo.access_status}, has_project: ${ngo.has_project})`);

  // Check if project_connections table exists
  const { error: tableCheck } = await admin.from("project_connections").select("id").limit(1);
  if (tableCheck?.message?.includes("schema cache")) {
    console.error(`
❌  project_connections table does not exist yet.

   Open your Supabase project → SQL Editor → paste and run this SQL:

─────────────────────────────────────────────────────────────────────
create table if not exists public.project_connections (
  id               uuid primary key default gen_random_uuid(),
  corporate_id     uuid not null references public.corporates(id) on delete cascade,
  ngo_id           uuid not null references public.ngos(id)       on delete cascade,
  project_name     text not null,
  focus_area       text not null default 'Education',
  budget           text not null default 'Rs 25L',
  status           text not null default 'active'
                   check (status in ('proposal','active','completed')),
  progress         integer not null default 0 check (progress >= 0 and progress <= 100),
  milestone        text not null default 'Kickoff',
  document_requests jsonb not null default '[]'::jsonb,
  latest_update    text not null default 'Shared workspace opened.',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (corporate_id, ngo_id, project_name)
);

alter table public.project_connections replica identity full;
alter table public.project_connections enable row level security;

create policy "corporates read own project connections"
on public.project_connections for select to authenticated
using (
  exists (select 1 from public.corporates where corporates.id = project_connections.corporate_id and corporates.auth_user_id = auth.uid())
  or exists (select 1 from public.corporate_employees where corporate_employees.corporate_id = project_connections.corporate_id and corporate_employees.auth_user_id = auth.uid() and corporate_employees.is_active = true)
);

create policy "ngos read own project connections"
on public.project_connections for select to authenticated
using (
  exists (select 1 from public.ngos where ngos.id = project_connections.ngo_id and ngos.auth_user_id = auth.uid())
  or project_connections.ngo_id = ((auth.jwt() -> 'user_metadata' ->> 'ngo_id')::uuid)
);

do $$ begin alter publication supabase_realtime add table public.project_connections; exception when duplicate_object then null; end; $$;
─────────────────────────────────────────────────────────────────────

   Then re-run this script: node scripts/seed-project-connection.mjs
`);
    process.exit(1);
  }

  // Check if connection already exists
  const { data: existing } = await admin
    .from("project_connections")
    .select("id, project_name, progress, latest_update")
    .eq("corporate_id", CORPORATE_ID)
    .eq("ngo_id", NGO_ID)
    .eq("project_name", "Rural Education Mission")
    .single();

  if (existing) {
    console.log(`\n↩  Connection already exists (${existing.id})`);
    console.log(`   Progress: ${existing.progress}%`);
    console.log(`   Latest:   ${existing.latest_update}`);
    console.log("\n✅  Nothing to seed — connection is live.\n");
    return;
  }

  // Insert the project connection
  const { data: conn, error: connErr } = await admin
    .from("project_connections")
    .insert({
      corporate_id:      CORPORATE_ID,
      ngo_id:            NGO_ID,
      project_name:      "Rural Education Mission",
      focus_area:        "Education",
      budget:            "Rs 25L",
      status:            "active",
      progress:          18,
      milestone:         "Kickoff and baseline survey",
      document_requests: ["CSR-1 certificate", "Latest audit report"],
      latest_update:     "Demo Corporation assigned the project. Shared workspace is now live for both teams.",
    })
    .select("id")
    .single();

  if (connErr) {
    console.error("❌ Failed to insert connection:", connErr.message);
    process.exit(1);
  }

  console.log(`\n✓  Project connection created (${conn.id})`);

  // Mark NGO as has_project + active
  const { error: ngoErr } = await admin
    .from("ngos")
    .update({ has_project: true, access_status: "active" })
    .eq("id", NGO_ID);

  if (ngoErr) console.warn("   ⚠ Could not update NGO has_project:", ngoErr.message);
  else console.log("✓  NGO marked has_project=true, access_status=active");

  // Ensure Demo Corporation is access_status=active
  const { error: corpErr } = await admin
    .from("corporates")
    .update({ access_status: "active" })
    .eq("id", CORPORATE_ID);

  if (corpErr) console.warn("   ⚠ Could not update Corporate status:", corpErr.message);
  else console.log("✓  Demo Corporation access_status=active");

  console.log(`
✅  Done! Rural Education Mission is now live.

   Corporate  : Demo Corporation   → demo@corpdemo.com   / CorpoGN@2026
   NGO Admin  : Green Earth Found. → admin@greenearthngo.in / GreenEarth@2026
   Project    : Rural Education Mission  |  Rs 25L  |  18% complete
   Milestone  : Kickoff and baseline survey

   Dashboard URLs:
   Corporate : http://localhost:3000/corporate/demo-corporation/dashboard
   NGO       : http://localhost:3000/ngo/green-earth-foundation/dashboard

   Demo flow:
   1. Log in as Corporate  → Project Workspace → see NGO connected
   2. Log in as NGO Admin  → My Projects → Shared Workspace → post update
   3. Refresh Corporate    → "Latest NGO update" changes live
`);
}

main().catch(err => { console.error("❌", err.message); process.exit(1); });
