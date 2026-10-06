/**
 * lib/dedup.mjs
 *
 * Deduplication of NGO candidates across locations and sources.
 *
 * Dedup keys (in priority order — first match wins):
 *   1. give_discover_slug (exact) — same NGO appeared in multiple city/state pages
 *   2. registration_number (exact, normalised)
 *   3. pan (exact, normalised)
 *   4. website_domain (apex domain, exact)
 *   5. name similarity (Jaro-Winkler ≥ 0.92) — same NGO, slightly different name spelling
 *
 * When duplicates are found, the HIGHER-RANKED candidate (by certification tier,
 * then transparency rating) is kept. The lower-ranked one is logged and discarded.
 *
 * "already ingested" check: candidates whose give_discover_slug already exists in
 * discovered_ngos table are also skipped (idempotent re-runs).
 */

import { supabase } from "./supabase.mjs";
import { apexDomain } from "./parsers/give-discover.mjs";
import { normalizeName } from "./parsers/wikipedia.mjs";

// ─── Tier rank (higher = better) ─────────────────────────────────────────────
const TIER_RANK = { Gold: 4, Silver: 3, Bronze: 2, None: 1, null: 0 };

function tierRank(t) {
  return TIER_RANK[t] ?? 0;
}

function candidateScore(c) {
  return tierRank(c.certificationTier) * 10 + (c.transparencyRating ?? 0);
}

// ─── Jaro-Winkler implementation (no external dependency) ────────────────────
// Returns similarity in [0, 1]. Threshold 0.92 used for NGO name matching.

function jaroSimilarity(s1, s2) {
  if (s1 === s2) return 1;
  if (!s1 || !s2) return 0;

  const matchDist = Math.max(Math.floor(Math.max(s1.length, s2.length) / 2) - 1, 0);
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchDist);
    const end = Math.min(i + matchDist + 1, s2.length);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;

  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3;
}

function jaroWinkler(s1, s2, p = 0.1) {
  const jaro = jaroSimilarity(s1, s2);
  let prefixLen = 0;
  for (let i = 0; i < Math.min(4, s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) prefixLen++;
    else break;
  }
  return jaro + prefixLen * p * (1 - jaro);
}

export const JARO_WINKLER_THRESHOLD = 0.92;

// ─── Already-ingested check ───────────────────────────────────────────────────

async function fetchExistingSlugs() {
  const { data, error } = await supabase
    .from("discovered_ngos")
    .select("give_discover_slug")
    .not("give_discover_slug", "is", null);
  if (error) {
    console.warn(`  ⚠  Could not fetch existing slugs from DB: ${error.message}`);
    return new Set();
  }
  return new Set(data.map((r) => r.give_discover_slug));
}

// ─── Main dedup function ──────────────────────────────────────────────────────

/**
 * Deduplicate an array of raw candidates.
 *
 * @param {Array<object>} candidates - from Give Discover listing parse
 * @returns {Promise<{ unique: Array, duplicates: Array<{kept, discarded, reason}> }>}
 */
export async function deduplicate(candidates) {
  // 1. Fetch already-ingested slugs
  const existingSlugs = await fetchExistingSlugs();
  console.log(`  ↳ Already-ingested slugs in DB: ${existingSlugs.size}`);

  const unique = [];
  const duplicates = [];

  for (const candidate of candidates) {
    // ── Skip already-ingested ──
    if (candidate.slug && existingSlugs.has(candidate.slug)) {
      duplicates.push({ kept: null, discarded: candidate, reason: "already_ingested" });
      continue;
    }

    // ── Check against candidates already in `unique` ──
    let isDup = false;

    for (let i = 0; i < unique.length; i++) {
      const existing = unique[i];
      let reason = null;

      // Key 1: slug (exact)
      if (candidate.slug && existing.slug && candidate.slug === existing.slug) {
        reason = "duplicate_slug";
      }
      // Key 2: registration_number (normalised exact)
      else if (
        candidate.registrationNumber &&
        existing.registrationNumber &&
        normalizeRegNum(candidate.registrationNumber) === normalizeRegNum(existing.registrationNumber)
      ) {
        reason = "duplicate_registration_number";
      }
      // Key 3: PAN (exact)
      else if (
        candidate.pan &&
        existing.pan &&
        candidate.pan.trim().toUpperCase() === existing.pan.trim().toUpperCase()
      ) {
        reason = "duplicate_pan";
      }
      // Key 4: website domain
      else if (
        candidate.website &&
        existing.website &&
        apexDomain(candidate.website) === apexDomain(existing.website) &&
        apexDomain(candidate.website) !== null
      ) {
        reason = "duplicate_domain";
      }
      // Key 5: name similarity
      else if (candidate.name && existing.name) {
        const sim = jaroWinkler(normalizeName(candidate.name), normalizeName(existing.name));
        if (sim >= JARO_WINKLER_THRESHOLD) {
          reason = `name_similarity_${sim.toFixed(3)}`;
        }
      }

      if (reason) {
        isDup = true;
        // Keep the higher-ranked one
        const candScore = candidateScore(candidate);
        const existScore = candidateScore(existing);

        if (candScore > existScore) {
          // New candidate is better — replace
          duplicates.push({ kept: candidate, discarded: existing, reason });
          unique[i] = candidate;
        } else {
          duplicates.push({ kept: existing, discarded: candidate, reason });
        }
        break;
      }
    }

    if (!isDup) {
      unique.push(candidate);
    }
  }

  return { unique, duplicates };
}

function normalizeRegNum(s) {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
