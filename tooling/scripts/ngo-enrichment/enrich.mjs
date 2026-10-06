#!/usr/bin/env node
/**
 * scripts/ngo-enrichment/enrich.mjs
 *
 * Autonomous NGO Data Enrichment Pipeline
 *
 * Iterates through every NGO in public.ngos, researches it from multiple
 * trusted public sources, merges data, calculates scores, and updates the DB.
 *
 * Usage:
 *   node scripts/ngo-enrichment/enrich.mjs
 *   node scripts/ngo-enrichment/enrich.mjs --dry-run
 *   node scripts/ngo-enrichment/enrich.mjs --ngo-id <uuid>
 *   node scripts/ngo-enrichment/enrich.mjs --batch 20
 *   node scripts/ngo-enrichment/enrich.mjs --retry-failed
 *   node scripts/ngo-enrichment/enrich.mjs --from-id <uuid>
 */

import { randomUUID } from "crypto";
import { supabase } from "./lib/supabase.mjs";
import { mergeResults, buildProjectRows, buildImpactRows } from "./lib/merger.mjs";
import { calculateScores } from "./lib/scorer.mjs";
import { scrapeWebsite } from "./lib/sources/website.mjs";
import { scrapeGiveDiscover } from "./lib/sources/give-discover.mjs";
import { scrapeCsrBox } from "./lib/sources/csrbox.mjs";

// ── CLI Arguments ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN     = args.includes("--dry-run");
const RETRY_FAILED = args.includes("--retry-failed");
const NGO_ID_IDX  = args.indexOf("--ngo-id");
const NGO_ID      = NGO_ID_IDX !== -1 ? (args[NGO_ID_IDX + 1] ?? null) : null;
const FROM_ID_IDX = args.indexOf("--from-id");
const FROM_ID     = FROM_ID_IDX !== -1 ? (args[FROM_ID_IDX + 1] ?? null) : null;
const BATCH_IDX   = args.indexOf("--batch");
const BATCH_SIZE  = BATCH_IDX !== -1 ? parseInt(args[BATCH_IDX + 1], 10) : (DRY_RUN ? 3 : 50);
const RUN_ID      = randomUUID();
const DELAY_MS    = 1500; // between NGOs — respect server load

if (NGO_ID && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(NGO_ID)) {
  console.error("❌ Invalid --ngo-id (must be a UUID)");
  process.exit(1);
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  banner();

  const runRow = await startRun();
  const ngos = await fetchTargetNgos();

  if (!ngos.length) {
    console.log("\n✅ No NGOs require enrichment at this time.");
    await finaliseRun(runRow.id, 0, 0, 0);
    return;
  }

  console.log(`\n📋 Processing ${ngos.length} NGO(s)...\n`);

  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < ngos.length; i++) {
    const ngo = ngos[i];
    const label = `[${i + 1}/${ngos.length}] ${ngo.ngo_name}`;

    process.stdout.write(`${label} ... `);

    try {
      await processNgo(ngo);
      succeeded++;
      console.log("✅ done");
    } catch (err) {
      failed++;
      console.log(`❌ ${err.message.slice(0, 80)}`);
      if (!DRY_RUN) {
        await supabase.from("ngos").update({
          enrichment_status: "failed",
          enrichment_error:  err.message.slice(0, 500),
        }).eq("id", ngo.id);
      }
    }

    // Rate-limit between NGOs
    if (i < ngos.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  await finaliseRun(runRow.id, ngos.length, succeeded, failed);
  printSummary(ngos.length, succeeded, failed);
}

// ── Core per-NGO workflow ─────────────────────────────────────────────────
async function processNgo(ngo) {
  if (!DRY_RUN) {
    await supabase.from("ngos").update({
      enrichment_status:     "processing",
      enrichment_started_at: new Date().toISOString(),
      enrichment_run_id:     RUN_ID,
      enrichment_error:      null,
    }).eq("id", ngo.id);
  }

  // ── Run all sources in parallel ────────────────────────────────────────
  const [websiteResult, giveResult, csrBoxResult] = await Promise.allSettled([
    scrapeWebsite(ngo),
    scrapeGiveDiscover(ngo),
    scrapeCsrBox(ngo),
  ]);

  const results = [
    websiteResult.status === "fulfilled" ? websiteResult.value : null,
    giveResult.status    === "fulfilled" ? giveResult.value    : null,
    csrBoxResult.status  === "fulfilled" ? csrBoxResult.value  : null,
  ];

  const sourcesAttempted = ["official_website", "give_discover", "csrbox"];
  const sourcesSucceeded = results.filter(r => r?.fetchSuccess).map(r => r.sourceType);

  // ── Merge ─────────────────────────────────────────────────────────────
  const { mergedFields, sourceContributions } = mergeResults(ngo, results);

  // ── Fetch supporting table counts for scoring ─────────────────────────
  const [finCount, projCount, docCount] = await Promise.all([
    countTable("ngo_financials",    ngo.id),
    countTable("ngo_projects",      ngo.id),
    countTable("ngo_documents",     ngo.id),
  ]);

  // ── Calculate scores ───────────────────────────────────────────────────
  const mergedNgo = { ...ngo, ...mergedFields };
  const scores = calculateScores(mergedNgo, finCount, projCount, docCount);

  if (DRY_RUN) {
    console.log("\n  📝 DRY RUN — Planned writes:");
    console.log("  mergedFields:", JSON.stringify(mergedFields, null, 2));
    console.log("  scores:", JSON.stringify(scores, null, 2));
    console.log("  sourceContributions:", sourceContributions.map(s => `${s.sourceType} → [${s.fieldsUpdated.join(", ")}]`).join("\n    "));
    return;
  }

  // ── Persist to DB ──────────────────────────────────────────────────────
  const now = new Date().toISOString();

  // 1. Update core NGO row
  const updatePayload = {
    ...mergedFields,
    ...scores,
    enrichment_status:       "done",
    enrichment_completed_at: now,
    last_enriched_at:        now,
    enrichment_error:        null,
  };
  const { error: ngoUpdateErr } = await supabase.from("ngos").update(updatePayload).eq("id", ngo.id);
  if (ngoUpdateErr) throw new Error(`NGO update failed: ${ngoUpdateErr.message}`);

  // 2. Insert project rows
  const projectRows = buildProjectRows(ngo.id, results);
  if (projectRows.length > 0) {
    const { error: projErr } = await supabase
      .from("ngo_projects")
      .upsert(projectRows, { onConflict: "ngo_id,project_name", ignoreDuplicates: true });
    if (projErr && !projErr.message.includes("schema cache")) {
      console.warn(`  ⚠️  project upsert warning: ${projErr.message}`);
    }
  }

  // 3. Insert impact metric rows
  const impactRows = buildImpactRows(ngo.id, results);
  if (impactRows.length > 0) {
    const { error: impactErr } = await supabase
      .from("ngo_impact_metrics")
      .upsert(impactRows, { onConflict: "ngo_id,metric_name,metric_year", ignoreDuplicates: true });
    if (impactErr && !impactErr.message.includes("schema cache")) {
      console.warn(`  ⚠️  impact upsert warning: ${impactErr.message}`);
    }
  }

  // 4. Insert enrichment source provenance rows
  const sourceRows = sourceContributions.map(c => ({
    ngo_id:        ngo.id,
    run_id:        RUN_ID,
    source_type:   c.sourceType,
    source_url:    c.sourceUrl,
    fields_updated: c.fieldsUpdated,
    raw_data:      c.rawData,
    confidence:    c.confidence,
    fetch_success: c.fetchSuccess,
    fetch_error:   c.fetchError ?? null,
    fetched_at:    now,
  }));

  // Also log failed sources for audit trail
  for (const r of results) {
    if (r && !r.fetchSuccess) {
      sourceRows.push({
        ngo_id:        ngo.id,
        run_id:        RUN_ID,
        source_type:   r.sourceType,
        source_url:    r.sourceUrl,
        fields_updated: [],
        raw_data:      {},
        confidence:    0,
        fetch_success: false,
        fetch_error:   r.fetchError,
        fetched_at:    now,
      });
    }
  }

  if (sourceRows.length > 0) {
    const { error: srcErr } = await supabase.from("ngo_enrichment_sources").insert(sourceRows);
    if (srcErr) console.warn(`  ⚠️  source log warning: ${srcErr.message}`);
  }
}

// ── DB Helpers ─────────────────────────────────────────────────────────────
async function fetchTargetNgos() {
  let query = supabase
    .from("ngos")
    .select("*");

  if (NGO_ID) {
    query = query.eq("id", NGO_ID);
  } else if (RETRY_FAILED) {
    // If schema not applied yet, fall back to all NGOs
    try { query = query.eq("enrichment_status", "failed"); } catch { /* noop */ }
  } else {
    // Try to filter by enrichment_status — if column doesn't exist yet, fetch all
    try { query = query.in("enrichment_status", ["pending", "failed"]); } catch { /* noop */ }
  }

  if (FROM_ID) {
    query = query.gt("id", FROM_ID);
  }

  const { data, error } = await query
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    // If enrichment_status column doesn't exist yet, run without that filter
    if (error.message.includes("enrichment_status") || error.message.includes("does not exist")) {
      console.warn("⚠️  enrichment_status column not found — schema.sql must be applied to Supabase.");
      console.warn("⚠️  Running against all NGOs for dry-run demonstration.\n");
      const { data: all, error: allErr } = await supabase
        .from("ngos")
        .select("id, ngo_name, registration_data")
        .order("created_at", { ascending: true })
        .limit(BATCH_SIZE);
      if (allErr) throw new Error(`Failed to fetch NGOs: ${allErr.message}`);
      return (all ?? []).map(n => ({ ...n, enrichment_status: "pending", state: null, website: null }));
    }
    throw new Error(`Failed to fetch NGOs: ${error.message}`);
  }
  return data ?? [];
}

async function countTable(table, ngoId) {
  try {
    const { count } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("ngo_id", ngoId);
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function startRun() {
  if (DRY_RUN) return { id: RUN_ID };
  const { data } = await supabase.from("ngo_enrichment_runs").insert({
    run_id:      RUN_ID,
    status:      "running",
    dry_run:     DRY_RUN,
    trigger_type: "manual",
  }).select("id").single();
  return data ?? { id: RUN_ID };
}

async function finaliseRun(rowId, total, succeeded, failed) {
  if (DRY_RUN) return;
  await supabase.from("ngo_enrichment_runs").update({
    status:       failed === total && total > 0 ? "failed" : (failed > 0 ? "partial" : "completed"),
    completed_at: new Date().toISOString(),
    total_ngos:   total,
    processed:    succeeded + failed,
    succeeded,
    failed,
  }).eq("run_id", RUN_ID);
}

// ── Utilities ──────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function banner() {
  console.log(`
╔══════════════════════════════════════════════════════╗
║     CorpoGN — NGO Data Enrichment Pipeline           ║
╚══════════════════════════════════════════════════════╝
  Run ID : ${RUN_ID}
  Mode   : ${DRY_RUN ? "DRY RUN (no DB writes)" : "LIVE"}
  Batch  : ${NGO_ID ? "single NGO" : `up to ${BATCH_SIZE}`}
  Source : website · give.do · csrbox.org
`);
}

function printSummary(total, succeeded, failed) {
  console.log(`
╔══════════════════════════════════════════════════════╗
║  Enrichment Complete                                 ║
╚══════════════════════════════════════════════════════╝
  Total  : ${total}
  Done   : ${succeeded}
  Failed : ${failed}
  Run ID : ${RUN_ID}
`);
}

main().catch(err => {
  console.error(`\n💥 Fatal: ${err.message}`);
  process.exit(1);
});
