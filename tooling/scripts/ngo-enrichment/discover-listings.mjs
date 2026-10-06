#!/usr/bin/env node
/**
 * scripts/ngo-enrichment/discover-listings.mjs
 *
 * LOCAL-ONLY discovery pass. Crawls Give Discover (give.do/discover) city
 * listing pages to build a fresh NGO directory — no Supabase involved at all.
 *
 * Each listing card already carries: name, city/state, short description,
 * certification tier, compliance badges (FCRA/80G/12A/CSR-1), and latest-FY
 * revenue/expenses. We capture all of that plus the exact profile URL for
 * deeper enrichment later.
 *
 * Usage:
 *   node scripts/ngo-enrichment/discover-listings.mjs
 *   node scripts/ngo-enrichment/discover-listings.mjs --max-pages 15
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { rateLimitedFetch, assertRobotsAllowed } from "../ngo-discovery/lib/fetcher.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "data");

const args = process.argv.slice(2);
const MAX_PAGES_IDX = args.indexOf("--max-pages");
const MAX_PAGES = MAX_PAGES_IDX !== -1 ? parseInt(args[MAX_PAGES_IDX + 1], 10) : 40;

const CITIES = [
  "Agra", "Ahmedabad", "Aurangabad", "Bangalore", "Chennai", "Delhi",
  "Hyderabad", "Indore", "Jaipur", "Kanpur", "Kochi", "Kolkata",
  "Lucknow", "Mumbai", "Nagpur", "Nashik", "Patna", "Pune", "Surat",
  "Vadodara", "Visakhapatnam",
];

const CARD_MARKER = '"result search-result search_outer" data-href="';

function parseCards(html) {
  const parts = html.split(CARD_MARKER).slice(1);
  const cards = [];
  for (const chunk of parts) {
    const urlMatch = chunk.match(/^([^"]+)"/);
    if (!urlMatch) continue;
    const profileUrl = `https://give.do${urlMatch[1]}`;
    const slugMatch = urlMatch[1].match(/^\/discover\/([A-Za-z0-9]+)\/([a-z0-9-]+)\/?$/);

    const nameMatch = chunk.match(/aria-label="([^"]+)">[^<]*<\/a>/);
    const name = nameMatch ? decodeHtml(nameMatch[1].trim()) : null;
    if (!name) continue;

    const subMatch = chunk.match(/result__sub-heading">([\s\S]*?)<\/div>/);
    const location = subMatch ? cleanText(subMatch[1]) : null;
    const [city, state] = location ? location.split(",").map(s => s.trim()) : [null, null];

    const descMatch = chunk.match(/<p class="par">([\s\S]*?)<\/p>/);
    const description = descMatch ? cleanText(descMatch[1]) : null;

    const badges = [...chunk.matchAll(/search_badge[^"]*">([^<]+)</g)].map(m => cleanText(m[1]));
    const certBadge = badges.find(b => /certified/i.test(b)) ?? null;
    const certification_tier = certBadge ? (certBadge.match(/^(Gold|Silver|Bronze)/i)?.[1] ?? null) : null;

    const fyMatch = chunk.match(/search_right--fy">([^<]+)</);
    const financial_year = fyMatch ? cleanText(fyMatch[1]) : null;

    const priceMatches = [...chunk.matchAll(/<p>(Total Revenue|Total Expenses)<\/p>\s*<p class="pricee">([\s\S]*?)<\/p>/g)]
      .map(m => [m[1], cleanText(m[2])]);
    const total_revenue = priceMatches.find(([k]) => k === "Total Revenue")?.[1] ?? null;
    const total_expenses = priceMatches.find(([k]) => k === "Total Expenses")?.[1] ?? null;

    const logoMatch = chunk.match(/<img src="([^"]+)"[^>]*class="img-dimensions"/);
    const logo_url = logoMatch ? `https://give.do${logoMatch[1]}` : null;

    cards.push({
      profile_url: profileUrl,
      slug: slugMatch ? slugMatch[2] : null,
      give_discover_code: slugMatch ? slugMatch[1] : null,
      name,
      city,
      state,
      description,
      certification_tier,
      compliance_badges: badges.filter(b => !/certified/i.test(b)),
      financial_year,
      total_revenue,
      total_expenses,
      logo_url,
    });
  }
  return cards;
}

function cleanText(html) {
  return decodeHtml(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function decodeHtml(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x2F;|&#47;/g, "/");
}

async function crawlCity(city) {
  const results = new Map();
  let firstPageSignature = null;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = page === 1
      ? `https://give.do/discover/city/${city}/`
      : `https://give.do/discover/city/${city}/?page=${page}`;

    let html;
    try {
      await assertRobotsAllowed(url);
      const res = await rateLimitedFetch(url, { timeout: 15000 });
      if (!res.ok) { console.log(`    page ${page}: HTTP ${res.status} — stopping`); break; }
      html = await res.text();
    } catch (err) {
      console.log(`    page ${page}: ${err.message} — stopping`);
      break;
    }

    const cards = parseCards(html);
    if (cards.length === 0) { console.log(`    page ${page}: no cards — end of listing`); break; }

    const signature = cards.map(c => c.profile_url).sort().join(",");
    if (page === 1) {
      firstPageSignature = signature;
    } else if (signature === firstPageSignature) {
      console.log(`    page ${page}: repeats page 1 — end of real pagination`);
      break;
    }

    let added = 0;
    for (const card of cards) {
      if (!results.has(card.profile_url)) { results.set(card.profile_url, card); added++; }
    }
    console.log(`    page ${page}: ${cards.length} cards (${added} new)`);
    if (added === 0 && page > 1) break; // fully duplicate page — safety stop
  }

  return [...results.values()];
}

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║  Give Discover — LOCAL listing crawl (no Supabase)    ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");
  console.log(`Cities: ${CITIES.length} — max ${MAX_PAGES} pages each\n`);

  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  const all = new Map();
  for (const city of CITIES) {
    console.log(`\n${city}:`);
    const cards = await crawlCity(city);
    for (const c of cards) {
      if (!all.has(c.profile_url)) all.set(c.profile_url, c);
    }
    console.log(`  → ${cards.length} unique in ${city} (running total: ${all.size})`);

    // Checkpoint after every city so partial progress survives interruption.
    writeFileSync(join(DATA_DIR, "listing-crawl.json"), JSON.stringify({
      generated_at: new Date().toISOString(),
      cities_crawled: CITIES.slice(0, CITIES.indexOf(city) + 1),
      total_unique: all.size,
      ngos: [...all.values()],
    }, null, 2));
  }

  console.log(`\nDone. ${all.size} unique NGOs discovered across ${CITIES.length} cities.`);
  console.log(`Output: ${join(DATA_DIR, "listing-crawl.json")}\n`);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
