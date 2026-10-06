/**
 * scripts/ngo-discovery/enrich-fcra.mjs
 *
 * Additive FCRA enrichment pass for discovered NGOs missing fcra_number.
 *
 * Usage:
 *   node scripts/ngo-discovery/enrich-fcra.mjs
 *   node scripts/ngo-discovery/enrich-fcra.mjs --dry-run
 *   node scripts/ngo-discovery/enrich-fcra.mjs --max 25
 */

import { randomUUID, createHash } from "crypto";
import { supabase, logStep } from "./lib/supabase.mjs";
import { assertRobotsAllowed } from "./lib/fetcher.mjs";
import { fetchFcraStatus, FCRA_SEARCH_URL } from "./lib/parsers/fcra-online.mjs";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const MAX_IDX = args.indexOf("--max");
const MAX_ROWS = MAX_IDX !== -1 ? parseInt(args[MAX_IDX + 1], 10) : (DRY_RUN ? 5 : 100);
const RUN_ID = randomUUID();

if (isNaN(MAX_ROWS) || MAX_ROWS < 1) {
  console.error("Invalid --max value. Must be a positive integer.");
  process.exit(1);
}

async function main() {
  console.log("\nCorpoGN FCRA Online Enrichment Pass");
  console.log(`Run ID : ${RUN_ID}`);
  console.log(`Mode   : ${DRY_RUN ? "DRY RUN (no DB writes)" : "LIVE"}`);
  console.log(`Max    : ${MAX_ROWS}\n`);

  await auditLog("fcra_enrich", "FCRA enrichment started", {
    metadata: { dry_run: DRY_RUN, max_rows: MAX_ROWS, source_url: FCRA_SEARCH_URL },
  });

  try {
    await assertRobotsAllowed(FCRA_SEARCH_URL);
  } catch (err) {
    await auditLog("fcra_enrich", "FCRA robots.txt disallowed search URL", {
      severity: "error",
      metadata: { error: err.message, source_url: FCRA_SEARCH_URL },
    });
    throw err;
  }

  const ngos = await fetchTargetNgos(MAX_ROWS);
  if (!ngos.length) {
    console.log("No discovered NGOs with missing FCRA numbers found.");
    await auditLog("fcra_enrich", "No target NGOs found");
    return;
  }

  console.log(`Found ${ngos.length} target NGOs.\n`);

  let matched = 0;
  let noMatch = 0;
  let failed = 0;

  for (let i = 0; i < ngos.length; i++) {
    const ngo = ngos[i];
    process.stdout.write(`[${i + 1}/${ngos.length}] ${ngo.name} (${ngo.state ?? "state unknown"}) ... `);

    try {
      const result = await fetchFcraStatus(ngo.name, ngo.state);
      if (!result) {
        noMatch++;
        console.log("no match");
        await auditLog("fcra_enrich", `No FCRA match: ${ngo.name}`, {
          entityType: "ngo",
          entityRef: ngo.id,
          metadata: { name: ngo.name, state: ngo.state },
        });
        continue;
      }

      matched++;
      console.log(`match ${result.fcraNumber} (${result.matchConfidence})`);

      const plannedWrite = {
        discovered_ngos: {
          id: ngo.id,
          fcra_number: result.fcraNumber,
          verified: false,
          last_checked: "now()",
          headquarters_address: ngo.headquarters_address ?? result.address ?? null,
        },
        discovered_ngo_sources: {
          ngo_id: ngo.id,
          run_id: RUN_ID,
          source_type: "fcra_online_portal",
          url: FCRA_SEARCH_URL,
          parse_success: true,
          robots_allowed: true,
          metadata: {
            query_name: ngo.name,
            query_state: ngo.state,
            match_confidence: result.matchConfidence,
            raw_row: result.rawRow,
          },
        },
      };

      if (DRY_RUN) {
        console.log(JSON.stringify(plannedWrite, null, 2));
        continue;
      }

      await persistMatch(ngo, result);
      await auditLog("fcra_enrich", `Matched FCRA: ${ngo.name}`, {
        entityType: "ngo",
        entityRef: ngo.id,
        metadata: {
          fcra_number: result.fcraNumber,
          match_confidence: result.matchConfidence,
          source_url: FCRA_SEARCH_URL,
        },
      });
    } catch (err) {
      failed++;
      console.log(`failed: ${err.message}`);
      await auditLog("fcra_enrich", `FCRA lookup failed: ${ngo.name}`, {
        severity: "warn",
        entityType: "ngo",
        entityRef: ngo.id,
        metadata: { error: err.message, name: ngo.name, state: ngo.state },
      });
    }
  }

  const summary = { targets: ngos.length, matched, no_match: noMatch, failed, dry_run: DRY_RUN };
  console.log("\nFCRA enrichment complete");
  console.log(JSON.stringify(summary, null, 2));

  await auditLog("fcra_enrich", "FCRA enrichment complete", {
    metadata: summary,
    severity: failed > 0 ? "warn" : "info",
  });
}

async function fetchTargetNgos(limit) {
  const { data, error } = await supabase
    .from("discovered_ngos")
    .select("id,name,state,city,headquarters_address")
    .is("fcra_number", null)
    .order("composite_rank", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw new Error(`Failed to fetch target NGOs: ${error.message}`);
  return data ?? [];
}

async function auditLog(step, message, opts = {}) {
  if (DRY_RUN) return;
  await logStep(RUN_ID, step, message, opts);
}

async function persistMatch(ngo, result) {
  const now = new Date().toISOString();
  const update = {
    fcra_number: result.fcraNumber,
    verified: false,
    last_checked: now,
  };

  if (!ngo.headquarters_address && result.address) {
    update.headquarters_address = result.address;
  }

  const { error: updateError } = await supabase
    .from("discovered_ngos")
    .update(update)
    .eq("id", ngo.id);

  if (updateError) {
    throw new Error(`Failed to update discovered_ngos: ${updateError.message}`);
  }

  const rawJson = JSON.stringify(result.rawRow);
  const { error: sourceError } = await supabase.from("discovered_ngo_sources").insert({
    ngo_id: ngo.id,
    run_id: RUN_ID,
    source_type: "fcra_online_portal",
    url: FCRA_SEARCH_URL,
    fetched_at: now,
    http_status: 200,
    content_length: rawJson.length,
    raw_html_sha256: createHash("sha256").update(rawJson).digest("hex"),
    parse_success: true,
    parse_error: null,
    robots_allowed: true,
    metadata: {
      query_name: ngo.name,
      query_state: ngo.state,
      match_confidence: result.matchConfidence,
      raw_row: result.rawRow,
    },
  });

  if (sourceError) {
    throw new Error(`Failed to insert FCRA provenance source: ${sourceError.message}`);
  }
}

main().catch(async (err) => {
  console.error(`\nFatal FCRA enrichment error: ${err.message}`);
  await auditLog("fcra_enrich", `Fatal error: ${err.message}`, {
    severity: "error",
    metadata: { error: err.stack ?? err.message },
  });
  process.exit(1);
});
