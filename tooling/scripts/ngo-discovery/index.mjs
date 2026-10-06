/**
 * scripts/ngo-discovery/index.mjs
 *
 * CorpoGN — NGO Auto-Discovery Pipeline Orchestrator
 * Branch: feature/auto-ngo-discovery
 *
 * Usage:
 *   node scripts/ngo-discovery/index.mjs                # Full run
 *   node scripts/ngo-discovery/index.mjs --dry-run      # Discover + rank only, no DB writes
 *   node scripts/ngo-discovery/index.mjs --max 5        # Full pipeline, cap at 5 NGOs
 *   node scripts/ngo-discovery/index.mjs --max 5 --dry-run
 *
 * Pipeline steps:
 *   1. Discover  — paginate Give Discover city/state directories for 6 NCR locations
 *   2. Cross-ref — fetch Wikipedia NGO list, mark wikipedia_match
 *   3. Rank      — sort by Gold > Silver > Bronze > None, then transparency_rating desc
 *   4. Dedup     — by slug / reg# / PAN / domain / name-similarity (Jaro-Winkler ≥0.92)
 *   5. Enrich    — fetch Give Discover profile + official website per NGO
 *   6. Categorize — multi-tag with confidence levels
 *   7. Score     — compute 4 scores + composite_rank
 *   8. Upload    — upsert to Supabase (service role), log to research_logs
 *
 * Hard constraints:
 *   - robots.txt: LOUD failure (throws), not silent skip
 *   - MAX_FETCHES: hard ceiling (default 1500) — exits if exceeded
 *   - ngo_darpan_id: ALWAYS NULL (admin fills later — portal is login-gated, no API)
 *   - Profile URLs: captured verbatim from listing page href, NEVER reconstructed
 */

import { randomUUID } from "crypto";
import { supabase, logStep } from "./lib/supabase.mjs";
import { NCR_LOCATIONS, discoverLocation } from "./lib/parsers/give-discover.mjs";
import { fetchWikipediaList, normalizeName } from "./lib/parsers/wikipedia.mjs";
import { deduplicate } from "./lib/dedup.mjs";
import { enrichCandidate } from "./lib/enricher.mjs";
import { categorize } from "./lib/categorizer.mjs";
import { scoreNgo } from "./lib/scorer.mjs";
import { getFetchCount } from "./lib/fetcher.mjs";

// ─── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const MAX_IDX = args.indexOf("--max");
const MAX_NGOS = MAX_IDX !== -1 ? parseInt(args[MAX_IDX + 1], 10) : 100;
const VERBOSE = args.includes("--verbose");

if (isNaN(MAX_NGOS) || MAX_NGOS < 1) {
  console.error("❌  Invalid --max value. Must be a positive integer.");
  process.exit(1);
}

// ─── Run ID ───────────────────────────────────────────────────────────────────
const RUN_ID = randomUUID();

// ─── Tier rank (for sorting) ──────────────────────────────────────────────────
const TIER_RANK = { Gold: 4, Silver: 3, Bronze: 2, None: 1 };
function certRank(t) { return TIER_RANK[t] ?? 0; }
function rankScore(c) { return certRank(c.certificationTier) * 10 + (c.transparencyRating ?? 0); }

// ─── Supabase upload helpers ──────────────────────────────────────────────────

async function upsertNgo(enriched, scores, wikiNames) {
  const now = new Date().toISOString();

  const wikipedia_match = wikiNames.has(normalizeName(enriched.name)) ||
    [...wikiNames].some((wn) => {
      const sim = jaroWinklerSimple(normalizeName(enriched.name), wn);
      return sim >= 0.9;
    });

  const row = {
    pipeline_run_id: RUN_ID,
    give_discover_slug: enriched.give_discover_slug,
    give_discover_url: enriched.give_discover_url,
    certification_tier: enriched.certification_tier ?? "None",
    transparency_rating: enriched.transparency_rating ?? null,
    name: enriched.name,
    legal_name: enriched.legal_name ?? null,
    org_type: enriched.org_type ?? null,
    registration_number: enriched.registration_number ?? null,
    pan: enriched.pan ?? null,
    fcra_number: enriched.fcra_number ?? null,
    ngo_darpan_id: null,  // ALWAYS NULL from pipeline
    founded_year: enriched.founded_year ?? null,
    csr_eligible: enriched.csr_eligible ?? null,
    website: enriched.website ?? null,
    website_domain: enriched.website_domain ?? null,
    city: enriched.city ?? null,
    state: enriched.state ?? null,
    headquarters_address: enriched.headquarters_address ?? null,
    wikipedia_match,
    wikipedia_name: null,
    claimed_ngo_id: null,
    impact_score: scores.impact_score,
    transparency_score: scores.transparency_score,
    completeness_score: scores.completeness_score,
    verification_score: scores.verification_score,
    composite_rank: scores.composite_rank,
    enrich_status: enriched.enrich_status,
    enrich_error: enriched.enrich_error ?? null,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("discovered_ngos")
    .upsert(row, { onConflict: "give_discover_slug", ignoreDuplicates: false })
    .select("id")
    .single();

  if (error) throw new Error(`upsert discovered_ngos (${enriched.give_discover_slug}): ${error.message}`);

  return data.id;
}

async function insertRelated(ngoId, enriched) {
  const now = new Date().toISOString();

  // Categories
  if (enriched._categories?.length) {
    const catRows = enriched._categories.map((c) => ({
      ngo_id: ngoId,
      category: c.category,
      confidence: c.confidence,
      source: c.source,
      created_at: now,
    }));
    await supabase.from("discovered_ngo_categories").upsert(catRows, {
      onConflict: "ngo_id,category", ignoreDuplicates: true,
    });
  }

  // Financials
  if (enriched.financials?.length) {
    const finRows = enriched.financials.map((f) => ({
      ngo_id: ngoId,
      year: f.year,
      total_income: f.total_income ?? null,
      total_expenditure: f.total_expenditure ?? null,
      programme_expenses: f.programme_expenses ?? null,
      admin_expenses: f.admin_expenses ?? null,
      source_url: f.source_url ?? null,
      verified: false,
      last_checked: now,
      confidence: f.confidence ?? "high",
    }));
    await supabase.from("discovered_ngo_financials").upsert(finRows, {
      onConflict: "ngo_id,year", ignoreDuplicates: true,
    });
  }

  // Projects / Programs
  if (enriched.programs?.length) {
    const progRows = enriched.programs.map((p) => ({
      ngo_id: ngoId,
      name: p.name,
      description: p.description ?? null,
      beneficiaries: p.beneficiaries ?? null,
      location: p.location ?? null,
      status: p.status ?? "ongoing",
      source_url: p.source_url ?? null,
      confidence: p.confidence ?? "medium",
    }));
    await supabase.from("discovered_ngo_projects").insert(progRows);
  }

  // Contacts
  const contactRows = [];
  if (enriched.email) {
    contactRows.push({
      ngo_id: ngoId,
      contact_type: "email",
      value: enriched.email,
      label: "Primary",
      source_url: enriched.give_discover_url,
      verified: false,
      last_checked: now,
      confidence: "high",
    });
  }
  if (enriched.phone) {
    contactRows.push({
      ngo_id: ngoId,
      contact_type: "phone",
      value: enriched.phone,
      label: "Primary",
      source_url: enriched.give_discover_url,
      verified: false,
      last_checked: now,
      confidence: "high",
    });
  }
  if (contactRows.length) {
    await supabase.from("discovered_ngo_contacts").insert(contactRows);
  }

  // Socials
  if (enriched.socials?.length) {
    const socialRows = enriched.socials.map((s) => ({
      ngo_id: ngoId,
      platform: s.platform,
      url: s.url,
      source_url: s.source_url ?? null,
      verified: false,
      last_checked: now,
      confidence: s.confidence ?? "high",
    }));
    await supabase.from("discovered_ngo_socials").upsert(socialRows, {
      onConflict: "ngo_id,platform", ignoreDuplicates: true,
    });
  }

  // Metrics
  if (enriched.metrics?.length) {
    const metricRows = enriched.metrics.map((m) => ({
      ngo_id: ngoId,
      metric_name: m.metric_name,
      metric_value: m.metric_value ?? null,
      unit: m.unit ?? null,
      year: m.year ?? null,
      source_url: m.source_url ?? null,
      verified: false,
      last_checked: now,
      confidence: m.confidence ?? "low",
    }));
    await supabase.from("discovered_ngo_metrics").insert(metricRows);
  }

  // Reports
  if (enriched.reports?.length) {
    const reportRows = enriched.reports.map((r) => ({
      ngo_id: ngoId,
      report_type: r.report_type,
      title: r.title ?? null,
      year: r.year ?? null,
      url: r.url ?? null,
      source_url: r.source_url ?? null,
      confidence: r.confidence ?? "high",
    }));
    await supabase.from("discovered_ngo_reports").insert(reportRows);
  }

  // Sources
  if (enriched._sources?.length) {
    const srcRows = enriched._sources.map((s) => ({
      ...s,
      ngo_id: ngoId,
      run_id: RUN_ID,
    }));
    await supabase.from("discovered_ngo_sources").insert(srcRows);
  }
}

// ─── Simple Jaro-Winkler for wiki name check ──────────────────────────────────
function jaroWinklerSimple(s1, s2) {
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  const len1 = s1.length, len2 = s2.length;
  const dist = Math.max(Math.floor(Math.max(len1, len2) / 2) - 1, 0);
  const m1 = new Array(len1).fill(false), m2 = new Array(len2).fill(false);
  let matches = 0;
  for (let i = 0; i < len1; i++) {
    for (let j = Math.max(0, i - dist); j < Math.min(len2, i + dist + 1); j++) {
      if (m2[j] || s1[i] !== s2[j]) continue;
      m1[i] = m2[j] = true; matches++; break;
    }
  }
  if (!matches) return 0;
  let t = 0, k = 0;
  for (let i = 0; i < len1; i++) {
    if (!m1[i]) continue;
    while (!m2[k]) k++;
    if (s1[i] !== s2[k]) t++;
    k++;
  }
  const jaro = (matches / len1 + matches / len2 + (matches - t / 2) / matches) / 3;
  let p = 0;
  for (let i = 0; i < Math.min(4, len1, len2); i++) { if (s1[i] === s2[i]) p++; else break; }
  return jaro + p * 0.1 * (1 - jaro);
}

// ─── Main Pipeline ────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🚀  CorpoGN NGO Discovery Pipeline`);
  console.log(`    Run ID   : ${RUN_ID}`);
  console.log(`    Mode     : ${DRY_RUN ? "DRY RUN (no DB writes)" : "LIVE"}`);
  console.log(`    Max NGOs : ${MAX_NGOS}`);
  console.log(`    Max Fetches: ${process.env.MAX_FETCHES ?? 1500}\n`);

  await logStep(RUN_ID, "pipeline", "Pipeline started", {
    metadata: { dry_run: DRY_RUN, max_ngos: MAX_NGOS, mode: DRY_RUN ? "dry_run" : "live" },
  });

  // ═══ STEP 1: DISCOVER ═════════════════════════════════════════════════════
  console.log("═".repeat(60));
  console.log("STEP 1 — DISCOVER (Give Discover listings)");
  console.log("═".repeat(60));

  let allCandidates = [];

  for (const locationCfg of NCR_LOCATIONS) {
    console.log(`\n📍 ${locationCfg.label}`);
    try {
      const { candidates, usedUrl, usedFallback } = await discoverLocation(locationCfg, {
        dryRun: DRY_RUN,
        maxNgos: MAX_NGOS * 5,  // collect more than needed before dedup/rank
      });
      console.log(`  → ${candidates.length} candidates from ${usedUrl}${usedFallback ? " (fallback)" : ""}`);
      await logStep(RUN_ID, "discover", `${locationCfg.label}: ${candidates.length} candidates`, {
        entityType: "pipeline",
        metadata: { location: locationCfg.label, count: candidates.length, url: usedUrl, fallback: usedFallback },
      });
      allCandidates = allCandidates.concat(candidates);
    } catch (err) {
      // robots.txt block = fatal
      if (err.message.startsWith("🚫")) {
        console.error(`\n${err.message}`);
        await logStep(RUN_ID, "discover", `FATAL: robots.txt block on ${locationCfg.label}`, {
          severity: "error",
          metadata: { error: err.message },
        });
        process.exit(1);
      }
      // Other errors: warn and continue (single location failure = non-fatal)
      console.warn(`  ⚠  Discover failed for ${locationCfg.label}: ${err.message}`);
      await logStep(RUN_ID, "discover", `WARN: ${locationCfg.label} failed: ${err.message}`, {
        severity: "warn",
        metadata: { location: locationCfg.label, error: err.message },
      });
    }
  }

  console.log(`\n✓  Total discovered: ${allCandidates.length} candidates\n`);

  // ═══ STEP 2: WIKIPEDIA CROSS-REFERENCE ════════════════════════════════════
  console.log("═".repeat(60));
  console.log("STEP 2 — WIKIPEDIA CROSS-REFERENCE");
  console.log("═".repeat(60));

  let wikiNames = new Set();
  try {
    const wikiResult = await fetchWikipediaList();
    wikiNames = wikiResult.names;
    await logStep(RUN_ID, "discover", `Wikipedia: ${wikiResult.rawEntries.length} NGOs extracted`, {
      metadata: { ok: wikiResult.ok, count: wikiResult.rawEntries.length },
    });
  } catch (err) {
    if (err.message.startsWith("🚫")) {
      console.error(`\n${err.message}`);
      process.exit(1);
    }
    console.warn(`  ⚠  Wikipedia failed (non-fatal): ${err.message}`);
  }

  // ═══ STEP 3: RANK ═════════════════════════════════════════════════════════
  console.log("\n" + "═".repeat(60));
  console.log("STEP 3 — RANK (Gold > Silver > Bronze > None, then rating desc)");
  console.log("═".repeat(60));

  const ranked = [...allCandidates].sort((a, b) => rankScore(b) - rankScore(a));

  console.log("\n  Top 20 by rank:");
  ranked.slice(0, 20).forEach((c, i) => {
    console.log(`  ${String(i + 1).padStart(3)}. [${c.certificationTier ?? "None"}] ${c.name} (rating: ${c.transparencyRating ?? "—"})`);
  });

  await logStep(RUN_ID, "rank", `Ranked ${ranked.length} candidates`, {
    metadata: {
      top20: ranked.slice(0, 20).map((c) => ({
        name: c.name,
        slug: c.slug,
        tier: c.certificationTier,
        rating: c.transparencyRating,
      })),
    },
  });

  // ═══ STEP 4: DEDUP ════════════════════════════════════════════════════════
  console.log("\n" + "═".repeat(60));
  console.log("STEP 4 — DEDUP");
  console.log("═".repeat(60));

  const { unique, duplicates } = await deduplicate(ranked);
  console.log(`\n  Before dedup: ${ranked.length} | After: ${unique.length} | Duplicates removed: ${duplicates.length}`);

  if (VERBOSE && duplicates.length) {
    console.log("\n  Duplicate pairs:");
    duplicates.slice(0, 10).forEach((d) => {
      console.log(`    [${d.reason}] Kept: "${d.kept?.name ?? "—"}" | Discarded: "${d.discarded?.name ?? "—"}"`);
    });
  }

  await logStep(RUN_ID, "dedup", `Dedup: ${ranked.length} → ${unique.length} (-${duplicates.length})`, {
    metadata: {
      before: ranked.length,
      after: unique.length,
      duplicates: duplicates.length,
      reasons: Object.fromEntries(
        [...new Set(duplicates.map((d) => d.reason.split("_")[0]))].map((k) => [
          k,
          duplicates.filter((d) => d.reason.startsWith(k)).length,
        ])
      ),
    },
  });

  // Take top MAX_NGOS after dedup
  const toEnrich = unique.slice(0, MAX_NGOS);
  console.log(`\n  → Proceeding to enrich top ${toEnrich.length} NGOs\n`);

  if (DRY_RUN) {
    console.log("\n✅  DRY RUN complete — no DB writes performed.");
    console.log(`    Fetch count: ${getFetchCount()}`);
    console.log(`    Top ${Math.min(20, toEnrich.length)} candidates to be enriched:`);
    toEnrich.slice(0, 20).forEach((c, i) => {
      console.log(`      ${String(i + 1).padStart(3)}. ${c.name} [${c.certificationTier}] ${c.profileUrl}`);
    });
    await logStep(RUN_ID, "pipeline", "Dry run complete", {
      metadata: { candidates: toEnrich.length, fetch_count: getFetchCount() },
    });
    return;
  }

  // ═══ STEP 5: ENRICH ═══════════════════════════════════════════════════════
  console.log("═".repeat(60));
  console.log("STEP 5 — ENRICH (Give Discover profile + official website)");
  console.log("═".repeat(60));

  const enriched = [];
  let enrichFailed = 0;

  for (let i = 0; i < toEnrich.length; i++) {
    const candidate = toEnrich[i];
    process.stdout.write(`  [${i + 1}/${toEnrich.length}] ${candidate.name} ... `);
    try {
      const result = await enrichCandidate(candidate, { runId: RUN_ID, supabase });
      enriched.push(result);
      console.log(`✓ (${result.enrich_status})`);
      await logStep(RUN_ID, "enrich", `Enriched: ${candidate.name}`, {
        entityType: "ngo",
        entityRef: candidate.slug,
        metadata: { status: result.enrich_status },
      });
    } catch (err) {
      if (err.message.startsWith("🚫")) {
        // MAX_FETCHES or robots.txt = fatal
        console.error(`\n${err.message}`);
        process.exit(1);
      }
      enrichFailed++;
      console.log(`⚠ FAILED: ${err.message}`);
      await logStep(RUN_ID, "enrich", `FAILED: ${candidate.name}: ${err.message}`, {
        severity: "warn",
        entityType: "ngo",
        entityRef: candidate.slug,
        metadata: { error: err.message },
      });
      // Push with failure marker so we still have the basic data
      enriched.push({
        ...candidate,
        enrich_status: "failed",
        enrich_error: err.message,
        categories: [],
        socials: [],
        financials: [],
        metrics: [],
        programs: [],
        reports: [],
        _sources: [],
        _categories: [],
      });
    }
  }

  console.log(`\n  ✓ Enriched: ${enriched.length - enrichFailed} | Failed: ${enrichFailed}\n`);

  // ═══ STEP 6: CATEGORIZE ═══════════════════════════════════════════════════
  console.log("═".repeat(60));
  console.log("STEP 6 — CATEGORIZE");
  console.log("═".repeat(60));

  for (const ngo of enriched) {
    ngo._categories = categorize(ngo);
  }
  console.log(`  ✓ Categorized ${enriched.length} NGOs\n`);

  // ═══ STEP 7: SCORE ════════════════════════════════════════════════════════
  console.log("═".repeat(60));
  console.log("STEP 7 — SCORE");
  console.log("═".repeat(60));

  for (const ngo of enriched) {
    ngo._scores = scoreNgo({ ...ngo, categories: ngo._categories, wikipedia_match: wikiNames.has(normalizeName(ngo.name)) });
  }
  const avgComposite = enriched.reduce((s, n) => s + (n._scores?.composite_rank ?? 0), 0) / enriched.length;
  console.log(`  ✓ Scored ${enriched.length} NGOs | Avg composite rank: ${avgComposite.toFixed(1)}\n`);

  // ═══ STEP 8: UPLOAD ═══════════════════════════════════════════════════════
  console.log("═".repeat(60));
  console.log("STEP 8 — UPLOAD to Supabase");
  console.log("═".repeat(60));

  let uploaded = 0, uploadFailed = 0;

  for (const ngo of enriched) {
    process.stdout.write(`  Upserting: ${ngo.name} ... `);
    try {
      const ngoId = await upsertNgo(ngo, ngo._scores, wikiNames);
      await insertRelated(ngoId, ngo);
      uploaded++;
      console.log(`✓ (id: ${ngoId})`);
    } catch (err) {
      uploadFailed++;
      console.warn(`⚠ Upload failed: ${err.message}`);
      await logStep(RUN_ID, "upload", `Upload failed: ${ngo.name}: ${err.message}`, {
        severity: "error",
        entityType: "ngo",
        entityRef: ngo.give_discover_slug,
        metadata: { error: err.message },
      });
    }
  }

  // ═══ SUMMARY ══════════════════════════════════════════════════════════════
  const summary = {
    run_id: RUN_ID,
    discovered: allCandidates.length,
    after_dedup: unique.length,
    enriched: enriched.length - enrichFailed,
    enrich_failed: enrichFailed,
    uploaded,
    upload_failed: uploadFailed,
    fetch_count: getFetchCount(),
    wiki_names: wikiNames.size,
  };

  console.log(`\n${"═".repeat(60)}`);
  console.log("✅  PIPELINE COMPLETE");
  console.log("═".repeat(60));
  console.log(`  Run ID       : ${RUN_ID}`);
  console.log(`  Discovered   : ${summary.discovered}`);
  console.log(`  After dedup  : ${summary.after_dedup}`);
  console.log(`  Enriched     : ${summary.enriched}  (failed: ${summary.enrich_failed})`);
  console.log(`  Uploaded     : ${summary.uploaded}  (failed: ${summary.upload_failed})`);
  console.log(`  Total fetches: ${summary.fetch_count} / ${process.env.MAX_FETCHES ?? 1500}`);
  console.log(`  Wiki NGOs    : ${summary.wiki_names}`);

  await logStep(RUN_ID, "pipeline", "Pipeline completed successfully", {
    metadata: summary,
  });

  if (uploadFailed > 0) {
    console.warn(`\n  ⚠  ${uploadFailed} NGO(s) failed to upload. Check research_logs for details.`);
    process.exit(2);  // Exit 2 = partial success
  }
}

main().catch((err) => {
  console.error("\n❌  Fatal pipeline error:", err.message);
  if (VERBOSE) console.error(err.stack);
  process.exit(1);
});
