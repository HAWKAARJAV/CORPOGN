#!/usr/bin/env node
/**
 * scripts/ngo-discovery/run-trust-score-batch.mjs
 *
 * Periodic batch job — computes Trust Score for every discovered_ngos row.
 * NOT triggered by admin clicks (see lib/scoring/trust-score.mjs header).
 * Intended to run weekly by default; run manually or wire to a scheduler.
 *
 * Versioned, append-only: flips the previous is_current row to false and
 * inserts a new one, rather than overwriting history.
 *
 * Usage:
 *   node scripts/ngo-discovery/run-trust-score-batch.mjs --dry-run
 *   node scripts/ngo-discovery/run-trust-score-batch.mjs --max 50
 */

import { randomUUID } from "crypto";
import { supabase, logStep } from "./lib/supabase.mjs";
import { computeTrustScore } from "../../../src/lib/scoring/trust-score.mjs";

const SCORING_VERSION = "v1";
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const MAX_IDX = args.indexOf("--max");
const MAX_ROWS = MAX_IDX !== -1 ? parseInt(args[MAX_IDX + 1], 10) : (DRY_RUN ? 5 : 1000);
const RUN_ID = randomUUID();

async function main() {
  console.log("\nCorpoGN — Trust Score batch");
  console.log(`Run ID : ${RUN_ID}`);
  console.log(`Version: ${SCORING_VERSION}`);
  console.log(`Mode   : ${DRY_RUN ? "DRY RUN (no DB writes)" : "LIVE"}\n`);

  const { data: ngos, error } = await supabase.from("discovered_ngos").select("*").limit(MAX_ROWS);
  if (error) throw new Error(`Failed to fetch discovered_ngos: ${error.message}`);

  console.log(`Scoring ${ngos.length} NGOs...\n`);

  let scored = 0, failed = 0;
  const totals = [];

  for (let i = 0; i < ngos.length; i++) {
    const ngo = ngos[i];
    process.stdout.write(`[${i + 1}/${ngos.length}] ${ngo.name} ... `);

    try {
      const [linkedNgoRes, projectsRes, financialsRes, reportsRes, disclosuresRes] = await Promise.all([
        ngo.claimed_ngo_id
          ? supabase.from("ngos").select("cert_12a, cert_80g, states_served").eq("id", ngo.claimed_ngo_id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from("discovered_ngo_projects").select("*").eq("ngo_id", ngo.id),
        supabase.from("discovered_ngo_financials").select("*").eq("ngo_id", ngo.id),
        supabase.from("discovered_ngo_reports").select("*").eq("ngo_id", ngo.id),
        // Always empty today (no ngo_id link exists on csr_disclosures yet) —
        // queried anyway so this activates automatically once that changes.
        Promise.resolve({ data: [] }),
      ]);

      const result = computeTrustScore(ngo, {
        linkedNgo: linkedNgoRes.data,
        projects: projectsRes.data ?? [],
        financials: financialsRes.data ?? [],
        reports: reportsRes.data ?? [],
        disclosures: disclosuresRes.data ?? [],
      });

      totals.push(result.total);
      console.log(`${result.total}/100 (completeness ${result.completeness}%)`);

      if (DRY_RUN) continue;

      // Flip the previous current row, then insert the new one — append-only history.
      await supabase.from("ngo_trust_scores").update({ is_current: false }).eq("ngo_id", ngo.id).eq("is_current", true);

      const { error: insertError } = await supabase.from("ngo_trust_scores").insert({
        ngo_id: ngo.id,
        scoring_version: SCORING_VERSION,
        compliance_score: result.scores.compliance,
        verification_score: result.scores.verification,
        transparency_score: result.scores.transparency,
        csr_track_record_score: result.scores.csrTrackRecord,
        track_record_depth_score: result.scores.trackRecordDepth,
        trust_score_total: result.total,
        component_breakdown: result.componentBreakdown,
        data_completeness_pct: result.completeness,
        is_current: true,
      });

      if (insertError) throw new Error(insertError.message);

      await logStep(RUN_ID, "trust_score_batch", `Scored ${ngo.name}: ${result.total}/100`, {
        entityType: "ngo", entityRef: ngo.id, metadata: { total: result.total, completeness: result.completeness },
      });

      scored++;
    } catch (err) {
      failed++;
      console.log(`FAILED: ${err.message}`);
    }
  }

  const avg = totals.length ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 100) / 100 : 0;
  console.log(`\nDone. ${scored} scored, ${failed} failed. Average trust score: ${avg}/100.`);
  if (!DRY_RUN) {
    await logStep(RUN_ID, "trust_score_batch", "Batch complete", { metadata: { scored, failed, avg_score: avg } });
  }
}

main().catch((err) => {
  console.error(`\nFatal: ${err.message}`);
  process.exit(1);
});
