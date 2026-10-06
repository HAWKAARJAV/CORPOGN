#!/usr/bin/env node
/**
 * scripts/ngo-enrichment/push-to-supabase.mjs
 *
 * Pushes the locally deep-enriched NGO profiles (scripts/ngo-enrichment/data/ngos/*.json,
 * produced by local-enrich.mjs) into the live public.ngos table (+ public.ngo_financials
 * for latest-year figures, + public.ngo_enrichment_sources for provenance).
 *
 * Skips any NGO whose name or PAN already exists in public.ngos. Explicit,
 * only-run-when-told step — nothing here runs automatically.
 *
 * Usage:
 *   node scripts/ngo-enrichment/push-to-supabase.mjs --dry-run
 *   node scripts/ngo-enrichment/push-to-supabase.mjs
 */

import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { supabase } from "../ngo-discovery/lib/supabase.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const NGOS_DIR = join(__dirname, "data", "ngos");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const FILE_IDX = args.indexOf("--file");
const SELECTION_PATH = FILE_IDX !== -1 ? args[FILE_IDX + 1] : null;
const RUN_ID = randomUUID();

function toSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function parseMoney(str) {
  if (!str || str === "--") return null;
  const n = parseFloat(String(str).replace(/[₹,\s]/g, ""));
  return isNaN(n) ? null : n;
}

function buildNgoPayload(record, existingSlugs) {
  const p = record.profile;
  const card = record.listing_card ?? {};

  let slug = record.slug || toSlug(record.ngo_name);
  let counter = 1;
  const base = slug;
  while (existingSlugs.has(slug)) { slug = `${base}-${counter}`; counter++; }
  existingSlugs.add(slug);

  let domain = "placeholder.org";
  if (p.website && p.website.startsWith("http")) {
    try { domain = new URL(p.website).hostname.replace(/^www\./, ""); } catch { /* noop */ }
  }
  const ngoEmail = p.email_public || `info@${domain}`;

  // No dedicated `vision` column exists on public.ngos — fold it into mission
  // rather than lose the data.
  let mission = p.mission ?? null;
  if (p.vision) {
    mission = mission ? `Vision: ${p.vision}\n\nMission: ${mission}` : `Vision: ${p.vision}`;
  }

  return {
    auth_user_id: randomUUID(),
    slug,
    ngo_name: record.ngo_name,
    ngo_email: ngoEmail,
    access_status: "pending",
    has_project: false,
    trust_score: p.overall_trust_score ?? 0,
    registration_data: {
      orgName: record.ngo_name,
      orgType: p.legal_status || "NGO",
      regNumber: p.registration_number || "",
      focusArea: p.sector_primary || "",
      state: p.state || "",
      city: card.city || "",
      contactEmail: ngoEmail,
      website: p.website || "",
      give_discover_url: record.give_discover_url,
    },
    description: p.description ?? null,
    mission,
    founded_year: p.founded_year ?? null,
    logo_url: p.logo_url ?? card.logo_url ?? null,
    registration_number: p.registration_number ?? null,
    pan_number: p.pan_number ?? null,
    fcra_number: p.fcra_number ?? null,
    ngo_darpan_id: p.ngo_darpan_id ?? null,
    csr1_number: p.csr1_number ?? null,
    cert_12a: p.cert_12a ?? null,
    cert_80g: p.cert_80g ?? null,
    legal_status: p.legal_status ?? null,
    email_public: p.email_public ?? null,
    phone: p.phone ?? null,
    address_head_office: p.address_head_office ?? null,
    state: p.state ?? null,
    district: p.district ?? null,
    website: p.website ?? null,
    linkedin_url: p.linkedin_url ?? null,
    facebook_url: p.facebook_url ?? null,
    instagram_url: p.instagram_url ?? null,
    twitter_url: p.twitter_url ?? null,
    youtube_url: p.youtube_url ?? null,
    sector_primary: p.sector_primary ?? null,
    sectors_secondary: p.sectors_secondary ?? [],
    csr_focus_areas: p.csr_focus_areas ?? [],
    states_served: p.states_served ?? [],
    districts_served: p.districts_served ?? [],
    leadership_team: p.leadership_team ?? [],
    beneficiary_types: p.beneficiary_types ?? [],
    enrichment_status: "done",
    enrichment_started_at: record.enriched_at,
    enrichment_completed_at: record.enriched_at,
    enrichment_run_id: RUN_ID,
    last_enriched_at: record.enriched_at,
    enrichment_sources_used: p.enrichment_sources_used ?? [],
    profile_completeness: p.profile_completeness ?? 0,
    transparency_score: p.transparency_score ?? 0,
    verification_score: p.verification_score ?? 0,
    documentation_score: p.documentation_score ?? 0,
    financial_completeness: p.financial_completeness ?? 0,
    project_completeness: p.project_completeness ?? 0,
    overall_trust_score: p.overall_trust_score ?? 0,
  };
}

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║  Push locally-enriched NGOs → Supabase public.ngos    ║");
  console.log(`║  Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE            "}                        ║`);
  console.log("╚══════════════════════════════════════════════════════╝\n");

  let files = readdirSync(NGOS_DIR).filter(f => f.endsWith(".json"));

  if (SELECTION_PATH) {
    const selection = JSON.parse(readFileSync(SELECTION_PATH, "utf8"));
    const allowedSlugs = new Set(selection.ngos.map(n => n.slug));
    files = files.filter(f => allowedSlugs.has(f.replace(/\.json$/, "")));
    console.log(`Restricting to ${files.length} NGOs from ${SELECTION_PATH} (selection had ${allowedSlugs.size}).\n`);
  } else {
    console.log(`Found ${files.length} locally enriched NGO files.\n`);
  }

  const { data: existing, error: existErr } = await supabase.from("ngos").select("slug, ngo_name, pan_number");
  if (existErr) { console.error("Failed to fetch existing NGOs:", existErr.message); process.exit(1); }

  const existingSlugs = new Set(existing.map(n => n.slug));
  const existingNames = new Set(existing.map(n => n.ngo_name.toLowerCase().trim()));
  const existingPans = new Set(existing.map(n => n.pan_number).filter(Boolean));

  let inserted = 0, skipped = 0, failed = 0;

  for (const file of files) {
    const record = JSON.parse(readFileSync(join(NGOS_DIR, file), "utf8"));
    const nameLower = record.ngo_name.toLowerCase().trim();
    const pan = record.profile.pan_number;

    if (existingNames.has(nameLower) || (pan && existingPans.has(pan))) {
      skipped++;
      continue;
    }

    const payload = buildNgoPayload(record, existingSlugs);

    if (DRY_RUN) {
      inserted++;
      continue;
    }

    const { data: inserted_row, error: insertErr } = await supabase.from("ngos").insert(payload).select("id").single();
    if (insertErr) {
      failed++;
      console.error(`  FAILED "${record.ngo_name}": ${insertErr.message}`);
      continue;
    }

    existingNames.add(nameLower);
    if (pan) existingPans.add(pan);
    inserted++;

    // ── Latest-year financials from the listing card ──────────────────────
    const card = record.listing_card ?? {};
    const revenue = parseMoney(card.total_revenue);
    const expenses = parseMoney(card.total_expenses);
    if (card.financial_year && (revenue !== null || expenses !== null)) {
      const fyMatch = card.financial_year.match(/(\d{2,4})[\s-]+(\d{2,4})/);
      const financialYear = fyMatch ? `20${fyMatch[1].slice(-2)}-${fyMatch[2].slice(-2)}` : card.financial_year;
      await supabase.from("ngo_financials").upsert({
        ngo_id: inserted_row.id,
        financial_year: financialYear,
        income_total: revenue,
        expenses_total: expenses,
        source_url: record.give_discover_url,
        confidence: 0.75,
        verified: false,
      }, { onConflict: "ngo_id,financial_year", ignoreDuplicates: true });
    }

    // ── Provenance ───────────────────────────────────────────────────────
    const sourceRows = (record.sources ?? []).map(s => ({
      ngo_id: inserted_row.id,
      run_id: RUN_ID,
      source_type: s.sourceType,
      source_url: s.sourceUrl,
      fields_updated: s.fieldsUpdated,
      raw_data: s.rawData ?? {},
      confidence: s.confidence,
      fetch_success: s.fetchSuccess,
      fetched_at: record.enriched_at,
    }));
    if (sourceRows.length) {
      const { error: srcErr } = await supabase.from("ngo_enrichment_sources").insert(sourceRows);
      if (srcErr) console.warn(`    source log warning for "${record.ngo_name}": ${srcErr.message}`);
    }

    console.log(`  [${inserted}] ${record.ngo_name} → trust ${payload.overall_trust_score}`);
  }

  console.log(`\nDone. Inserted ${inserted}, skipped (dupes) ${skipped}, failed ${failed}.`);
  if (DRY_RUN) console.log("(dry run — nothing was actually written)");
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
