#!/usr/bin/env node
/**
 * scripts/ngo-enrichment/local-enrich.mjs
 *
 * LOCAL-ONLY deep enrichment pass. Reads the NGO list produced by
 * discover-listings.mjs (scripts/ngo-enrichment/data/listing-crawl.json) —
 * no Supabase involved anywhere in this pipeline — and deep-scrapes each
 * NGO's Give Discover profile page, CSRBox, the FCRA Online portal, and
 * (where a real official site can be found) the NGO's own website.
 *
 * All output is written to local JSON files under scripts/ngo-enrichment/data/.
 * Nothing is written to any database.
 *
 * Usage:
 *   node scripts/ngo-enrichment/local-enrich.mjs
 *   node scripts/ngo-enrichment/local-enrich.mjs --limit 50
 *   node scripts/ngo-enrichment/local-enrich.mjs --from 100 --limit 50
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { scrapeGiveDiscoverUrl } from "./lib/sources/give-discover.mjs";
import { scrapeCsrBox } from "./lib/sources/csrbox.mjs";
import { scrapeWebsite } from "./lib/sources/website.mjs";
import { fetchFcraStatus } from "../ngo-discovery/lib/parsers/fcra-online.mjs";
import { mergeResults } from "./lib/merger.mjs";
import { calculateScores } from "./lib/scorer.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "data");
const NGOS_DIR = join(DATA_DIR, "ngos");

const args = process.argv.slice(2);
const LIMIT_IDX = args.indexOf("--limit");
const LIMIT = LIMIT_IDX !== -1 ? parseInt(args[LIMIT_IDX + 1], 10) : Infinity;
const FROM_IDX = args.indexOf("--from");
const FROM = FROM_IDX !== -1 ? parseInt(args[FROM_IDX + 1], 10) : 0;
const FILE_IDX = args.indexOf("--file");
const LISTING_PATH = FILE_IDX !== -1 ? args[FILE_IDX + 1] : join(DATA_DIR, "listing-crawl.json");

const SOCIAL_DOMAINS = ["linkedin.com", "facebook.com", "instagram.com", "twitter.com", "x.com", "youtube.com", "google.com"];

function isRealOrgWebsite(url) {
  if (!url || !url.startsWith("http")) return false;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return !SOCIAL_DOMAINS.some(d => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

/** Map a listing-crawl card onto the public.ngos column shape merger/scorer expect. */
function toBaseNgoShape(card) {
  const revenue = parseMoney(card.total_revenue);
  const expenses = parseMoney(card.total_expenses);
  return {
    ngo_name: card.name,
    description: card.description ?? null,
    mission: null,
    vision: null,
    founded_year: null,
    logo_url: card.logo_url ?? null,
    registration_number: null,
    pan_number: null,
    fcra_number: card.compliance_badges?.includes("FCRA") ? "listed" : null, // placeholder flag; real number filled by FCRA lookup below
    ngo_darpan_id: null,
    cert_12a: card.compliance_badges?.includes("12A") ? "Registered" : null,
    cert_80g: card.compliance_badges?.includes("80G") ? "Registered" : null,
    state: card.state ?? null,
    district: card.city ?? null,
    address_head_office: null,
    website: null,
    sector_primary: null,
    sectors_secondary: [],
    csr_focus_areas: [],
    states_served: card.state ? [card.state] : [],
    enrichment_sources_used: [],
    _listing_certification_tier: card.certification_tier ?? null,
    _listing_financial_year: card.financial_year ?? null,
    _listing_total_revenue: revenue,
    _listing_total_expenses: expenses,
    _listing_csr1: card.compliance_badges?.includes("CSR-1") ?? false,
  };
}

function parseMoney(str) {
  if (!str || str === "--") return null;
  const n = parseFloat(str.replace(/[₹,\s]/g, ""));
  return isNaN(n) ? null : n;
}

function wrapFcraResult(fcraStatus) {
  if (!fcraStatus) return null;
  return {
    sourceType: "fcra_online",
    sourceUrl: "https://fcraonline.nic.in/fc8_statewise.aspx",
    fetchSuccess: true,
    fields: {
      fcra_number: fcraStatus.fcraNumber,
      address_head_office: fcraStatus.address ?? undefined,
    },
    rawData: { rawRow: fcraStatus.rawRow, matchConfidence: fcraStatus.matchConfidence },
    confidence: fcraStatus.matchConfidence,
  };
}

async function enrichOne(card) {
  // fcra_number was seeded as the placeholder "listed" above so the merger's
  // immutable-once-set guard doesn't block a real lookup — clear it here.
  const baseNgo = toBaseNgoShape(card);
  baseNgo.fcra_number = null;

  const [giveResult, csrBoxResult, fcraStatus] = await Promise.allSettled([
    scrapeGiveDiscoverUrl(card.profile_url),
    scrapeCsrBox({ ngo_name: card.name }),
    fetchFcraStatus(card.name, card.state).catch(() => null),
  ]);

  const results = [
    giveResult.status === "fulfilled" ? giveResult.value : { sourceType: "give_discover", sourceUrl: card.profile_url, fetchSuccess: false, fetchError: String(giveResult.reason?.message ?? giveResult.reason), fields: {}, rawData: {}, confidence: 0 },
    csrBoxResult.status === "fulfilled" ? csrBoxResult.value : { sourceType: "csrbox", sourceUrl: null, fetchSuccess: false, fetchError: String(csrBoxResult.reason?.message ?? csrBoxResult.reason), fields: {}, rawData: {}, confidence: 0 },
    fcraStatus.status === "fulfilled" ? wrapFcraResult(fcraStatus.value) : { sourceType: "fcra_online", sourceUrl: null, fetchSuccess: false, fetchError: String(fcraStatus.reason?.message ?? fcraStatus.reason), fields: {}, rawData: {}, confidence: 0 },
  ];

  // ── Follow the official website, if Give Discover's page pointed to one ──
  let websiteResult = null;
  const candidateWebsite = results[0]?.fields?.website;
  if (isRealOrgWebsite(candidateWebsite)) {
    websiteResult = await scrapeWebsite({ website: candidateWebsite }).catch(err => ({
      sourceType: "official_website", sourceUrl: candidateWebsite, fetchSuccess: false, fetchError: err.message, fields: {}, confidence: 0,
    }));
    if (websiteResult) results.push(websiteResult);
  }

  const { mergedFields, sourceContributions } = mergeResults(baseNgo, results);
  const mergedNgo = { ...baseNgo, ...mergedFields };
  const scores = calculateScores(mergedNgo, 0, 0, 0);

  return {
    slug: card.slug,
    ngo_name: card.name,
    give_discover_url: card.profile_url,
    listing_card: card,
    profile: { ...mergedNgo, ...scores },
    sources: sourceContributions,
    raw: {
      give_discover: results[0],
      csrbox: results[1],
      fcra_online: results[2],
      official_website: websiteResult,
    },
    enriched_at: new Date().toISOString(),
  };
}

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║  CorpoGN — LOCAL NGO Deep Enrichment (no DB writes)   ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  if (!existsSync(LISTING_PATH)) {
    console.error(`Missing ${LISTING_PATH} — run discover-listings.mjs first.`);
    process.exit(1);
  }
  if (!existsSync(NGOS_DIR)) mkdirSync(NGOS_DIR, { recursive: true });

  const listing = JSON.parse(readFileSync(LISTING_PATH, "utf8"));
  const targets = listing.ngos.slice(FROM, FROM + (LIMIT === Infinity ? listing.ngos.length : LIMIT));
  console.log(`Listing has ${listing.ngos.length} NGOs — processing ${targets.length} (from index ${FROM}).\n`);

  const index = [];
  let ok = 0, failed = 0;

  for (let i = 0; i < targets.length; i++) {
    const card = targets[i];
    process.stdout.write(`[${FROM + i + 1}/${listing.ngos.length}] ${card.name} ... `);
    try {
      const result = await enrichOne(card);
      const outPath = join(NGOS_DIR, `${result.slug}.json`);
      writeFileSync(outPath, JSON.stringify(result, null, 2));
      index.push({
        slug: result.slug,
        ngo_name: result.ngo_name,
        state: result.profile.state,
        sector_primary: result.profile.sector_primary,
        overall_trust_score: result.profile.overall_trust_score,
        profile_completeness: result.profile.profile_completeness,
        sources_used: result.profile.enrichment_sources_used ?? [],
        file: `ngos/${result.slug}.json`,
      });
      ok++;
      console.log(`done (trust ${result.profile.overall_trust_score}, sources: ${(result.profile.enrichment_sources_used ?? []).join(", ") || "none"})`);
    } catch (err) {
      failed++;
      console.log(`FAILED: ${err.message}`);
      index.push({ slug: card.slug, ngo_name: card.name, error: err.message });
    }
  }

  writeFileSync(join(DATA_DIR, "index.json"), JSON.stringify({
    generated_at: new Date().toISOString(),
    total: targets.length,
    succeeded: ok,
    failed,
    ngos: index,
  }, null, 2));

  console.log(`\nDone. ${ok} succeeded, ${failed} failed.`);
  console.log(`Output: ${NGOS_DIR}`);
  console.log(`Index:  ${join(DATA_DIR, "index.json")}`);
  console.log(`\nNothing was written to any database.\n`);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
