/**
 * lib/enricher.mjs
 *
 * Enrichment step: for each ranked/deduped candidate —
 *   1. Fetch Give Discover profile page (using profileUrl captured verbatim from listing)
 *   2. If an official website was found, fetch it for supplemental data
 *
 * Confidence rules (enforced throughout):
 *   'high'   = structured/labelled field on Give Discover profile page
 *   'medium' = structured field on official website
 *   'low'    = pattern-matched from prose text (stored, clearly flagged as inferred)
 *   NULL     = field not found on any fetched page → stored as NULL, NEVER guessed
 *
 * "low" confidence does NOT mean we refuse to store it — it means we store it
 * with confidence='low' so downstream users know it was text-matched, not labelled.
 * The anti-pattern being avoided: using "low" as a catch-all for guesses.
 */

import { safeFetch, assertRobotsAllowed } from "./fetcher.mjs";
import { parseNgoProfile, apexDomain } from "./parsers/give-discover.mjs";

/**
 * Enrich a single candidate.
 *
 * @param {object} candidate - from ranking step, must have .profileUrl
 * @param {object} opts
 * @param {string} opts.runId
 * @param {object} opts.supabase - service role client (for logging sources)
 * @returns {Promise<object>} candidate merged with enriched fields
 */
export async function enrichCandidate(candidate, opts = {}) {
  const { runId, supabase } = opts;
  const sources = [];

  // ── Step 1: Give Discover profile page ───────────────────────────────────
  let profileData = null;
  try {
    profileData = await parseNgoProfile(candidate.profileUrl);

    sources.push({
      ngo_id: null,  // filled after DB insert
      run_id: runId,
      source_type: "give_discover_profile",
      url: candidate.profileUrl,
      http_status: profileData.httpStatus,
      parse_success: profileData.ok,
      parse_error: profileData.error ?? null,
      robots_allowed: true,
    });

    if (!profileData.ok) {
      console.warn(`    ⚠  Profile fetch failed for ${candidate.slug}: ${profileData.error}`);
    }
  } catch (err) {
    if (err.message.startsWith("🚫")) throw err;  // robots.txt block → propagate
    console.warn(`    ⚠  Profile fetch error for ${candidate.slug}: ${err.message}`);
    profileData = { ok: false, error: err.message };
    sources.push({
      ngo_id: null,
      run_id: runId,
      source_type: "give_discover_profile",
      url: candidate.profileUrl,
      http_status: null,
      parse_success: false,
      parse_error: err.message,
      robots_allowed: null,
    });
  }

  // ── Step 2: Official website (if found) ──────────────────────────────────
  let siteData = null;
  const officialWebsite = profileData?.website ?? null;

  if (officialWebsite && isScrapableWebsite(officialWebsite)) {
    try {
      await assertRobotsAllowed(officialWebsite);
      const siteRes = await safeFetch(officialWebsite, { timeout: 12000 });

      sources.push({
        ngo_id: null,
        run_id: runId,
        source_type: "official_website",
        url: officialWebsite,
        http_status: siteRes.status,
        parse_success: siteRes.ok,
        parse_error: null,
        robots_allowed: true,
      });

      if (siteRes.ok) {
        siteData = parseOfficialSite(siteRes.text, officialWebsite);
      }
    } catch (err) {
      if (err.message.startsWith("🚫")) {
        // robots.txt disallows — log, don't throw (this is just enrichment)
        console.warn(`    ⚠  robots.txt blocks official site for ${candidate.slug}: ${officialWebsite}`);
        sources.push({
          ngo_id: null,
          run_id: runId,
          source_type: "official_website",
          url: officialWebsite,
          http_status: null,
          parse_success: false,
          parse_error: "robots_disallowed",
          robots_allowed: false,
        });
      } else {
        console.warn(`    ⚠  Official site fetch error (${candidate.slug}): ${err.message}`);
        sources.push({
          ngo_id: null,
          run_id: runId,
          source_type: "official_website",
          url: officialWebsite,
          http_status: null,
          parse_success: false,
          parse_error: err.message,
          robots_allowed: null,
        });
      }
    }
  }

  // ── Merge: Give Discover is authoritative; official site fills gaps ───────
  const merged = mergeSources(candidate, profileData, siteData);

  return { ...merged, _sources: sources };
}

/**
 * Parse an official NGO website for supplemental data.
 * All fields confidence='medium' (official site, structured) or 'low' (prose).
 * Returns NULL for anything not found — never guesses.
 *
 * @param {string} html
 * @param {string} sourceUrl
 */
function parseOfficialSite(html, sourceUrl) {
  const now = new Date().toISOString();

  // ── Email ──
  const email =
    extractFirst(html, /href="mailto:([^"]{5,100})"/) ||
    extractFirst(html, /\b([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b/) ||
    null;

  // ── Phone ──
  const phone =
    extractFirst(html, /href="tel:([^"]+)"/) ||
    extractFirst(html, /(?:\+91|0)[-\s]?[6-9]\d{9}/) ||
    null;

  // ── Social links (medium confidence — from official site) ──
  const socials = [];
  const SOCIAL_RE = [
    { platform: "facebook", re: /href="(https?:\/\/(?:www\.)?facebook\.com\/[^"]{3,100})"/i },
    { platform: "twitter", re: /href="(https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^"]{3,100})"/i },
    { platform: "instagram", re: /href="(https?:\/\/(?:www\.)?instagram\.com\/[^"]{3,100})"/i },
    { platform: "linkedin", re: /href="(https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/[^"]{3,100})"/i },
    { platform: "youtube", re: /href="(https?:\/\/(?:www\.)?youtube\.com\/[^"]{3,100})"/i },
  ];
  for (const { platform, re } of SOCIAL_RE) {
    const m = re.exec(html);
    if (m) {
      socials.push({
        platform,
        url: m[1],
        source_url: sourceUrl,
        verified: false,
        last_checked: now,
        confidence: "medium",
      });
    }
  }

  // ── Annual reports from official site ──
  const reports = [];
  const pdfRe = /href="([^"]+\.pdf[^"]*)"/gi;
  let m;
  while ((m = pdfRe.exec(html)) !== null && reports.length < 5) {
    const url = m[1].startsWith("http") ? m[1] : resolveRelativeUrl(sourceUrl, m[1]);
    if (!url) continue;
    const yearM = /\b(20\d{2})\b/.exec(url);
    const isAudit = /audit|financial|account/i.test(url);
    reports.push({
      report_type: isAudit ? "audited_financials" : "annual_report",
      title: null,
      year: yearM ? parseInt(yearM[1], 10) : null,
      url,
      source_url: sourceUrl,
      confidence: "medium",
    });
  }

  // ── Leadership / leadership names (low confidence — prose matched) ──
  // Not stored as a structured field yet — captured as a metric
  const leadershipMatch = /(?:founder|ceo|director|president|chairperson)[^>]*>\s*([A-Z][a-zA-Z\s]{5,60})/i.exec(html);
  const leadershipNote = leadershipMatch ? leadershipMatch[1].trim() : null;

  return { email, phone, socials, reports, leadershipNote, sourceUrl };
}

/**
 * Merge Give Discover data (authoritative) with official site data (gap-fill).
 * Give Discover fields win on conflict. Site data only fills NULLs.
 */
function mergeSources(candidate, profileData, siteData) {
  const now = new Date().toISOString();
  const pd = profileData?.ok ? profileData : {};

  const result = {
    // From listing (always present)
    name: candidate.name,
    give_discover_slug: candidate.slug,
    give_discover_url: candidate.profileUrl,
    give_id: candidate.giveId,
    // Give Discover quality signals (prefer profile page over listing if both present)
    certification_tier: pd.certificationTier ?? candidate.certificationTier ?? "None",
    transparency_rating: pd.transparencyRating ?? candidate.transparencyRating ?? null,
    // Profile fields (Give Discover = high confidence)
    legal_name: pd.legalName ?? null,
    org_type: pd.orgType ?? null,
    registration_number: pd.registrationNumber ?? null,
    pan: pd.pan ?? null,
    fcra_number: pd.fcraNumber ?? null,
    fcra_registered: pd.fcraRegistered ?? false,
    ngo_darpan_id: null,  // ALWAYS NULL from pipeline (admin fills later)
    founded_year: pd.foundedYear ?? null,
    csr_eligible: pd.csrEligible ?? null,
    // Location
    website: pd.website ?? null,
    website_domain: pd.website ? apexDomain(pd.website) : null,
    city: pd.city ?? candidate.addressText?.split(",")[0]?.trim() ?? null,
    state: pd.state ?? null,
    headquarters_address: pd.address ?? null,
    // Contact (Give Discover first, official site fills gap)
    email: pd.email ?? siteData?.email ?? null,
    phone: pd.phone ?? siteData?.phone ?? null,
    // Collections
    categories: pd.categories ?? [],
    socials: mergeCollections(pd.socials ?? [], siteData?.socials ?? [], "platform"),
    financials: pd.financials ?? [],
    metrics: pd.metrics ?? [],
    programs: pd.programs ?? [],
    reports: mergeCollections(pd.reports ?? [], siteData?.reports ?? [], null),
    // Enrichment status
    enrich_status: profileData?.ok ? "enriched" : "failed",
    enrich_error: profileData?.ok ? null : (profileData?.error ?? "unknown"),
  };

  return result;
}

function mergeCollections(primary, secondary, dedupeKey) {
  if (!dedupeKey) return [...primary, ...secondary].slice(0, 10);
  const seen = new Set(primary.map((x) => x[dedupeKey]));
  const extras = secondary.filter((x) => !seen.has(x[dedupeKey]));
  return [...primary, ...extras];
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function extractFirst(text, re) {
  const m = re.exec(text);
  return m ? (m[1] ?? m[0]).trim() : null;
}

function resolveRelativeUrl(base, relative) {
  try {
    return new URL(relative, base).href;
  } catch {
    return null;
  }
}

/** Heuristics to decide if we should attempt to scrape an official website */
function isScrapableWebsite(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    // Skip social media profiles — we extract those separately
    const SKIP_DOMAINS = ["facebook.com", "twitter.com", "instagram.com", "linkedin.com", "youtube.com", "x.com"];
    return !SKIP_DOMAINS.some((d) => u.hostname.includes(d));
  } catch {
    return false;
  }
}
