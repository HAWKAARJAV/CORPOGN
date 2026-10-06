#!/usr/bin/env node
/**
 * scripts/ngo-discovery/enrich-givedo-funding.mjs
 *
 * Fetches give.do/nonprofits/<slug> for each discovered_ngos row and pulls
 * the platform's own lifetime crowdfunding statistics — this is NGO-linked
 * by construction (the slug IS the NGO), no name-matching needed. Also
 * captures the NGO's uploaded compliance PDFs (registration/FCRA/annual
 * report) hosted on give.do's own S3 bucket.
 *
 * Usage:
 *   node scripts/ngo-discovery/enrich-givedo-funding.mjs --dry-run
 *   node scripts/ngo-discovery/enrich-givedo-funding.mjs --max 50
 */

import { randomUUID } from "crypto";
import { supabase, logStep } from "./lib/supabase.mjs";
import { assertRobotsAllowed, rateLimitedFetch } from "./lib/fetcher.mjs";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const MAX_IDX = args.indexOf("--max");
const MAX_ROWS = MAX_IDX !== -1 ? parseInt(args[MAX_IDX + 1], 10) : (DRY_RUN ? 5 : 250);
const RUN_ID = randomUUID();

async function main() {
  console.log("\nCorpoGN — Give.do funding enrichment");
  console.log(`Run ID : ${RUN_ID}`);
  console.log(`Mode   : ${DRY_RUN ? "DRY RUN (no DB writes)" : "LIVE"}`);
  console.log(`Max    : ${MAX_ROWS}\n`);

  const { data: targets, error } = await supabase
    .from("discovered_ngos")
    .select("id, name, give_discover_slug, givedo_last_synced_at")
    .not("give_discover_slug", "is", null)
    .is("givedo_last_synced_at", null)
    .order("composite_rank", { ascending: false, nullsFirst: false })
    .limit(MAX_ROWS);

  if (error) throw new Error(`Failed to fetch targets: ${error.message}`);
  if (!targets.length) {
    console.log("No discovered NGOs need give.do funding sync.");
    return;
  }

  console.log(`Found ${targets.length} target NGOs.\n`);

  let synced = 0, notFound = 0, failed = 0;

  for (let i = 0; i < targets.length; i++) {
    const ngo = targets[i];
    process.stdout.write(`[${i + 1}/${targets.length}] ${ngo.name} (${ngo.give_discover_slug}) ... `);

    try {
      const result = await fetchGivedoProfile(ngo.give_discover_slug);
      if (!result) {
        notFound++;
        console.log("no give.do nonprofit page");
        continue;
      }

      synced++;
      console.log(`raised ₹${result.givedo_lifetime_raised_inr?.toLocaleString("en-IN") ?? "?"}`);

      if (DRY_RUN) continue;

      const { error: updateError } = await supabase
        .from("discovered_ngos")
        .update({ ...result, givedo_last_synced_at: new Date().toISOString() })
        .eq("id", ngo.id);

      if (updateError) throw new Error(updateError.message);

      await logStep(RUN_ID, "givedo_funding_sync", `Synced ${ngo.name}`, {
        entityType: "ngo", entityRef: ngo.id, metadata: result,
      });
    } catch (err) {
      failed++;
      console.log(`failed: ${err.message}`);
      if (!DRY_RUN) {
        await logStep(RUN_ID, "givedo_funding_sync", `Failed: ${ngo.name}`, {
          severity: "warn", entityType: "ngo", entityRef: ngo.id, metadata: { error: err.message },
        });
      }
    }
  }

  console.log(`\nDone. ${synced} synced, ${notFound} not on give.do, ${failed} failed.`);
}

async function fetchGivedoProfile(slug) {
  const url = `https://give.do/nonprofits/${slug}`;
  await assertRobotsAllowed(url);

  const res = await rateLimitedFetch(url, { timeout: 20000 });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const html = await res.text();
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error("__NEXT_DATA__ not found — page structure may have changed");

  let data;
  try {
    data = JSON.parse(match[1]);
  } catch {
    throw new Error("__NEXT_DATA__ was not valid JSON");
  }

  const p = data?.props?.pageProps;
  const profile = p?.ngoProfileData;
  if (!profile || profile.status === "not_found") return null;

  const stat = profile.statistic ?? {};

  return {
    givedo_nonprofit_id: profile._id ?? null,
    givedo_lifetime_raised_inr: numOrNull(stat.raised_amount),
    givedo_donation_count: intOrNull(stat.donation_count),
    givedo_supporter_count: intOrNull(stat.supporter_count),
    givedo_active_fundraisers_count: intOrNull(p?.allFundraisersCount),
    givedo_registration_doc_url: profile.registration_doc ?? null,
    givedo_fcra_doc_url: profile.fcra_doc ?? null,
    givedo_annual_report_doc_url: profile.annual_report_doc ?? null,
  };
}

function numOrNull(v) {
  const n = typeof v === "number" ? v : parseFloat(v);
  return isNaN(n) ? null : Math.round(n * 100) / 100;
}
function intOrNull(v) {
  const n = typeof v === "number" ? v : parseInt(v, 10);
  return isNaN(n) ? null : n;
}

main().catch(err => {
  console.error(`\nFatal: ${err.message}`);
  process.exit(1);
});
