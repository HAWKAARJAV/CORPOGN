/**
 * lib/parsers/give-discover.mjs
 *
 * Parses Give Discover (give.do) listing and profile pages.
 *
 * CONFIRMED URL PATTERNS (verified by direct fetch):
 *   Listings:
 *     https://give.do/discover/city/New Delhi/        → 734 NGOs
 *     https://give.do/discover/state/Delhi/           → 964 NGOs  ← primary for Delhi NCR
 *     https://give.do/discover/state/Uttar Pradesh/   → for Noida/Greater Noida/Ghaziabad
 *     https://give.do/discover/state/Haryana/         → for Gurugram/Faridabad
 *     https://give.do/discover/project-district/South Delhi/
 *
 *   Profiles:
 *     https://give.do/discover/{3-char-id}/{slug}/
 *     e.g. https://give.do/discover/LDS/goonj/
 *          https://give.do/discover/3RJ/helpage-india/
 *
 * CRITICAL: {3-char-id} is OPAQUE — NOT derivable from the NGO name or slug.
 * It MUST be captured verbatim from the <a href> on the listing page.
 * Profile URLs are NEVER reconstructed — always stored as fetched.
 *
 * Confidence rules (enforced, not aspirational):
 *   'high'   = value came from a structured/labelled field on Give Discover profile
 *   'medium' = value came from official website structured field
 *   'low'    = value was pattern-matched from prose text (still stored, clearly flagged)
 *   null     = field not found → stored as NULL, never inferred
 */

import { safeFetch, headCheck } from "../fetcher.mjs";

const BASE = "https://give.do";

// ─── NCR Location Config ─────────────────────────────────────────────────────
// primaryUrl is tried first (HEAD check). If 404 → fallbackUrl used with cityFilter.
// cityFilter: lowercase string matched against address text in NGO card.
// null cityFilter on fallback = include all from that state page.

export const NCR_LOCATIONS = [
  {
    label: "Delhi NCR (state)",
    primaryUrl: `${BASE}/discover/state/Delhi/`,
    fallbackUrl: null,
    cityFilter: null,  // entire Delhi state is NCR — no filter needed
  },
  {
    label: "Noida",
    primaryUrl: `${BASE}/discover/city/Noida/`,
    fallbackUrl: `${BASE}/discover/state/Uttar Pradesh/`,
    cityFilter: "noida",
  },
  {
    label: "Greater Noida",
    primaryUrl: `${BASE}/discover/city/Greater Noida/`,
    fallbackUrl: `${BASE}/discover/state/Uttar Pradesh/`,
    cityFilter: "greater noida",
  },
  {
    label: "Ghaziabad",
    primaryUrl: `${BASE}/discover/city/Ghaziabad/`,
    fallbackUrl: `${BASE}/discover/state/Uttar Pradesh/`,
    cityFilter: "ghaziabad",
  },
  {
    label: "Gurugram",
    primaryUrl: `${BASE}/discover/city/Gurugram/`,
    fallbackUrl: `${BASE}/discover/state/Haryana/`,
    cityFilter: "gurugram",
  },
  {
    label: "Faridabad",
    primaryUrl: `${BASE}/discover/city/Faridabad/`,
    fallbackUrl: `${BASE}/discover/state/Haryana/`,
    cityFilter: "faridabad",
  },
];

// ─── Listing HTML Parser ──────────────────────────────────────────────────────

/**
 * Extract NGO cards from a listing page HTML.
 *
 * Captures (per card):
 *   - profileUrl: full href e.g. "/discover/LDS/goonj/" (never reconstructed)
 *   - giveId: the 3-char opaque ID e.g. "LDS"
 *   - slug: e.g. "goonj"
 *   - name: NGO display name
 *   - certificationTier: 'Gold' | 'Silver' | 'Bronze' | 'None'
 *   - transparencyRating: number 0.0–5.0 or null
 *   - city: extracted from address text (for city-filter on state pages)
 *   - cardHtml: raw card HTML for debugging
 *
 * @param {string} html - full listing page HTML
 * @param {string|null} cityFilter - lowercase city name to filter on (null = include all)
 * @returns {Array<object>}
 */
export function parseListingPage(html, cityFilter = null) {
  const results = [];

  // Give Discover profile links always match /discover/{3-char-alphanum}/{slug}/
  // We find these anchors and extract surrounding card context.
  const profileLinkRe = /href="(\/discover\/([A-Za-z0-9]+)\/([a-z0-9-]+)\/?)"/gi;

  let match;
  while ((match = profileLinkRe.exec(html)) !== null) {
    const profilePath = match[1];   // e.g. /discover/LDS/goonj/
    const giveId = match[2];        // e.g. LDS  (opaque 3-char — stored verbatim)
    const slug = match[3];          // e.g. goonj

    // Extract surrounding card HTML (~3000 chars around the link) for field parsing
    const contextStart = Math.max(0, match.index - 1500);
    const contextEnd = Math.min(html.length, match.index + 1500);
    const cardHtml = html.slice(contextStart, contextEnd);

    // ── Name ──
    // Try: <h2> / <h3> / element with class containing "name" / "title"
    const name = (
      extractFirst(cardHtml, /<h[23][^>]*>([^<]{3,100})<\/h[23]>/i) ||
      extractFirst(cardHtml, /class="[^"]*(?:ngo-name|org-name|card-title|ngo-title)[^"]*"[^>]*>([^<]{3,100})<\//) ||
      extractFirst(cardHtml, /class="[^"]*title[^"]*"[^>]*>\s*<[^>]+>([^<]{3,100})<\//) ||
      extractFirst(cardHtml, /alt="([^"]{3,100})"/)
    )?.trim() ?? null;

    if (!name) continue;  // Skip cards where we can't determine the name

    // ── Certification Tier ──
    const certText = cardHtml.toLowerCase();
    let certificationTier = "None";
    if (certText.includes("gold")) certificationTier = "Gold";
    else if (certText.includes("silver")) certificationTier = "Silver";
    else if (certText.includes("bronze")) certificationTier = "Bronze";

    // More precise: look for badge/certification label context
    const certMatch =
      /(?:certification|tier|badge)[^>]*>([^<]*(?:gold|silver|bronze)[^<]*)</i.exec(cardHtml) ||
      /(?:gold|silver|bronze)\s*(?:ngo|certified|partner)/i.exec(cardHtml);
    if (certMatch) {
      const t = certMatch[0].toLowerCase();
      if (t.includes("gold")) certificationTier = "Gold";
      else if (t.includes("silver")) certificationTier = "Silver";
      else if (t.includes("bronze")) certificationTier = "Bronze";
    }

    // ── Transparency Rating ──
    // Give Discover shows ratings like "4.2", "3.8 / 5", "★ 4.5"
    let transparencyRating = null;
    const ratingPatterns = [
      /(?:transparency|rating|score)[^>]*>\s*([0-9]\.[0-9])\s*(?:\/\s*5)?/i,
      /([0-9]\.[0-9])\s*\/\s*5/,
      /(?:★|☆)\s*([0-9](?:\.[0-9])?)/,
      /data-rating="([0-9](?:\.[0-9])?)"/i,
    ];
    for (const re of ratingPatterns) {
      const rm = re.exec(cardHtml);
      if (rm) {
        const val = parseFloat(rm[1]);
        if (!isNaN(val) && val >= 0 && val <= 5) {
          transparencyRating = val;
          break;
        }
      }
    }

    // ── City / Address (for city-filter on state pages) ──
    const addressText = (
      extractFirst(cardHtml, /(?:class="[^"]*(?:address|location|city)[^"]*"[^>]*)>\s*([^<]{3,150})<\//) ||
      extractFirst(cardHtml, /(?:📍|🏢|<svg[^>]*>[^<]*<\/svg>)\s*([^<]{3,100})<\//)
    )?.trim() ?? "";

    // If cityFilter set, only include cards whose address contains the filter string
    if (cityFilter && !addressText.toLowerCase().includes(cityFilter.toLowerCase())) {
      // Also check name as secondary signal (some NGOs have city in name)
      if (!name.toLowerCase().includes(cityFilter.toLowerCase())) {
        continue;
      }
    }

    // Dedup within this page parse (same slug seen twice = skip)
    if (results.some((r) => r.slug === slug)) continue;

    results.push({
      profileUrl: `${BASE}${profilePath.endsWith("/") ? profilePath : profilePath + "/"}`,
      giveId,
      slug,
      name,
      certificationTier,
      transparencyRating,
      addressText: addressText || null,
      sourceListingCity: cityFilter,
    });
  }

  return results;
}

/**
 * Detect total page count from listing HTML.
 * Give Discover uses patterns like ?page=2 or /page/2/ or numbered pagination links.
 * Returns max page number found (1 if no pagination).
 */
export function detectPageCount(html) {
  // Approach 1: look for highest ?page=N or &page=N in pagination links
  const pageNums = [];
  const re1 = /[?&]page=(\d+)/gi;
  let m;
  while ((m = re1.exec(html)) !== null) pageNums.push(parseInt(m[1], 10));

  // Approach 2: pagination text like "Page 1 of 24" or "1 / 24"
  const ofMatch = /page\s+\d+\s+of\s+(\d+)/i.exec(html);
  if (ofMatch) pageNums.push(parseInt(ofMatch[1], 10));

  // Approach 3: "Showing X-Y of Z results" → compute pages
  const showingMatch = /showing\s+\d+[\s–-]+\d+\s+of\s+([\d,]+)/i.exec(html);
  if (showingMatch) {
    const total = parseInt(showingMatch[1].replace(/,/g, ""), 10);
    // Assume 20 per page (common default)
    if (!isNaN(total)) pageNums.push(Math.ceil(total / 20));
  }

  return pageNums.length > 0 ? Math.max(...pageNums) : 1;
}

/**
 * Build paginated URL variants for a base listing URL.
 * Tries ?page=N first; if the listing uses /page/N/ we adapt after first fetch.
 */
export function paginatedUrl(baseUrl, page) {
  if (page <= 1) return baseUrl;
  // Try query-string pagination first
  const u = new URL(baseUrl);
  u.searchParams.set("page", String(page));
  return u.toString();
}

// ─── Location Discovery (with HEAD check + fallback) ─────────────────────────

/**
 * Discover NGOs from one NCR location config.
 * 1. HEAD check primaryUrl
 * 2. If 404 → use fallbackUrl with cityFilter
 * 3. Paginate and collect all cards
 *
 * @param {object} locationCfg - one entry from NCR_LOCATIONS
 * @param {object} opts
 * @param {boolean} opts.dryRun - if true, only fetch page 1
 * @param {number} opts.maxNgos - stop collecting after this many
 * @returns {Promise<{ candidates: Array, usedUrl: string, usedFallback: boolean }>}
 */
export async function discoverLocation(locationCfg, opts = {}) {
  const { dryRun = false, maxNgos = 500 } = opts;
  const { label, primaryUrl, fallbackUrl, cityFilter } = locationCfg;

  let listingBase = primaryUrl;
  let usedFallback = false;

  // ── Step 1: HEAD check on primaryUrl ──
  if (primaryUrl) {
    console.log(`  ↳ HEAD check: ${primaryUrl}`);
    try {
      const status = await headCheck(primaryUrl);
      if (status === 404 || status === 302 || status >= 400) {
        if (fallbackUrl) {
          console.log(`  ⚠  ${label} city page → ${status}. Falling back to: ${fallbackUrl}`);
          listingBase = fallbackUrl;
          usedFallback = true;
        } else {
          console.log(`  ⚠  ${label} page → ${status}, no fallback configured. Skipping.`);
          return { candidates: [], usedUrl: primaryUrl, usedFallback: false };
        }
      } else {
        console.log(`  ✓  ${label} city page exists (${status})`);
      }
    } catch (err) {
      // robots.txt block = loud throw from fetcher, propagate up
      if (err.message.startsWith("🚫")) throw err;
      // Network error on HEAD → try GET anyway
      console.warn(`  ⚠  HEAD failed for ${label}: ${err.message}. Attempting GET.`);
    }
  }

  // ── Step 2: Fetch page 1 to detect pagination ──
  const page1Url = paginatedUrl(listingBase, 1);
  console.log(`  ↳ Fetching page 1: ${page1Url}`);
  const page1 = await safeFetch(page1Url);
  if (!page1.ok) {
    console.warn(`  ⚠  ${label}: page 1 returned HTTP ${page1.status}. Skipping.`);
    return { candidates: [], usedUrl: listingBase, usedFallback };
  }

  const activeFilter = usedFallback ? cityFilter : null;
  let candidates = parseListingPage(page1.text, activeFilter);
  console.log(`  ↳ ${label}: ${candidates.length} candidates on page 1`);

  // ── Step 3: Paginate ──
  if (!dryRun) {
    let p = 2;
    while (candidates.length < maxNgos) {
      const pageUrl = paginatedUrl(listingBase, p);
      console.log(`  ↳ Fetching page ${p}: ${pageUrl}`);
      const pageRes = await safeFetch(pageUrl);
      if (!pageRes.ok) {
        console.warn(`  ⚠  Page ${p} returned ${pageRes.status} — stopping pagination.`);
        break;
      }
      const pageCandidates = parseListingPage(pageRes.text, activeFilter);
      if (pageCandidates.length === 0) {
        console.log(`  ↳ Page ${p} returned 0 candidates — end of results.`);
        break;
      }
      // Check if this page repeats a previous page
      if (candidates.some(c => c.profileUrl === pageCandidates[0].profileUrl)) {
        console.log(`  ↳ Page ${p} repeats previous results — end of real pagination.`);
        break;
      }
      candidates = candidates.concat(pageCandidates);
      p++;
    }
  }

  return { candidates, usedUrl: listingBase, usedFallback };
}

// ─── Profile Page Parser ──────────────────────────────────────────────────────

/**
 * Fetch and parse a Give Discover NGO profile page.
 * profileUrl MUST be the verbatim href from the listing page.
 * e.g. "https://give.do/discover/LDS/goonj/"
 *
 * All fields: NULL if not found on the fetched page. Never inferred.
 * Confidence: 'high' = structured/labelled field, 'low' = pattern-matched prose.
 *
 * @param {string} profileUrl
 * @returns {Promise<object>} enriched profile data
 */
export async function parseNgoProfile(profileUrl) {
  const res = await safeFetch(profileUrl);
  if (!res.ok) {
    return {
      ok: false,
      httpStatus: res.status,
      profileUrl,
      error: `HTTP ${res.status}`,
    };
  }

  const html = res.text;
  const sourceUrl = profileUrl;

  // ── Legal name ──
  const legalName =
    extractFirst(html, /(?:registered\s+as|legal\s+name|full\s+name)[^>]*>([^<]{3,200})</i) ||
    null;

  // ── Organisation type ──
  const orgType =
    extractFirst(html, /(?:organisation\s+type|org\s+type|registered\s+as)[^>]*>\s*([^<]{3,80})</i) ||
    extractFirst(html, /(?:Trust|Society|Section 8 Company|Section8|NGO|Foundation)\b/) ||
    null;

  // ── Registration number ──
  const registrationNumber =
    extractFirst(html, /(?:registration\s+(?:no|number|#))[^:>]*[:\s]+([A-Z0-9\/\-]{5,40})/i) ||
    extractFirst(html, /reg\.?\s*no\.?\s*[:\s]+([A-Z0-9\/\-]{5,40})/i) ||
    null;

  // ── PAN ──
  const pan =
    extractFirst(html, /\bPAN\b[^:>]*[:\s]+([A-Z]{5}[0-9]{4}[A-Z]{1})/i) ||
    extractFirst(html, /([A-Z]{5}[0-9]{4}[A-Z]{1})/) ||
    null;

  // ── FCRA ──
  const fcraNumber =
    extractFirst(html, /(?:FCRA)[^:>]*[:\s]+([0-9\/\-]{6,20})/i) ||
    null;
  const fcraRegistered = html.toLowerCase().includes("fcra") || !!fcraNumber;

  // ── Founded year ──
  const foundedYear = (() => {
    const m =
      /(?:founded|established|since|incorporated)[^\d]*(\b(?:19|20)\d{2}\b)/i.exec(html) ||
      /(?:19|20)\d{2}/.exec(html);
    if (!m) return null;
    const yr = parseInt(m[1] ?? m[0], 10);
    const now = new Date().getFullYear();
    return yr >= 1947 && yr <= now ? yr : null;
  })();

  // ── CSR eligibility ──
  const csrEligible =
    /(?:80G|12A|CSR\s*eligible|CSR\s*compliant)/i.test(html) || null;

  // ── Website ──
  // Give Discover wraps the official site in an <a> with text "Visit Website" or similar,
  // or in a meta/data field. Try multiple patterns.
  const website =
    extractFirst(html, /href="(https?:\/\/(?!give\.do|facebook|twitter|instagram|linkedin|youtube)[^"]{4,200})"[^>]*>\s*(?:visit|website|official|www)/i) ||
    extractFirst(html, /(?:website|web\s*site|official\s*site)[^<>]{0,50}href="(https?:\/\/(?!give\.do)[^"]{4,200})"/i) ||
    extractFirst(html, /data-(?:website|url)="(https?:\/\/[^"]{4,200})"/i) ||
    extractFirst(html, /href="(https?:\/\/(?!give\.do|facebook\.com|twitter\.com|x\.com|instagram\.com|linkedin\.com|youtube\.com|mailto:|tel:)[^"]{8,200})"/i) ||
    null;

  // ── Address / City / State ──
  // Give Discover shows address in spans/divs with class containing "address", "location",
  // or in a <p> after an address icon (svg or emoji). Try multiple patterns.
  const address =
    extractFirst(html, /class="[^"]*(?:address|location|headquarters)[^"]*"[^>]*>([^<]{10,300})<\//i) ||
    extractFirst(html, /(?:📍|🏢)\s*([^<]{5,200})<\//i) ||
    extractFirst(html, /<(?:p|span|div)[^>]*>([^<]{10,200}(?:Delhi|Noida|Gurugram|Ghaziabad|Faridabad|NCR)[^<]{0,100})<\//i) ||
    extractFirst(html, /(?:registered\s+address|office\s+address)[^>]*>([^<]{10,300})<\//i) ||
    null;

  const city = (() => {
    const searchIn = (address ?? "") + " " + html.slice(0, 20000);
    const NCR_CITIES = ["New Delhi", "Delhi", "Noida", "Greater Noida", "Ghaziabad", "Faridabad", "Gurugram", "Gurgaon"];
    for (const c of NCR_CITIES) {
      if (searchIn.includes(c)) return c === "Gurgaon" ? "Gurugram" : c;
    }
    return extractFirst(html, /(?:city)[^>]*>([^<]{2,50})<\//i) || null;
  })();

  const state =
    extractFirst(html, /(?:state)[^>]*>([^<]{2,50})<\//i) ||
    (city === "Delhi" || city === "New Delhi" ? "Delhi" :
     city === "Noida" || city === "Greater Noida" || city === "Ghaziabad" ? "Uttar Pradesh" :
     city === "Gurugram" || city === "Faridabad" ? "Haryana" : null);

  // ── Contact ──
  const email =
    extractFirst(html, /href="mailto:([^"]{5,100})"/) ||
    extractFirst(html, /\b([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b/) ||
    null;

  const phone =
    extractFirst(html, /(?:phone|mobile|tel|contact)[^>]*>[\s+]*(\+?[0-9][\d\s\-]{7,15})/i) ||
    extractFirst(html, /href="tel:([^"]+)"/) ||
    null;

  // ── Social links ──
  const socials = extractSocialLinks(html, sourceUrl);

  // ── Categories ──
  const categories = extractCategories(html);

  // ── Financials (year-wise) ──
  const financials = extractFinancials(html, sourceUrl);

  // ── Beneficiary/impact metrics ──
  const metrics = extractMetrics(html, sourceUrl);

  // ── Programs ──
  const programs = extractPrograms(html, sourceUrl);

  // ── Annual reports ──
  const reports = extractReports(html, sourceUrl);

  // ── Certification (from profile page — more reliable than listing) ──
  const certText = html;
  let certificationTier = "None";
  if (/gold\s*(ngo|certified|partner|badge)/i.test(certText)) certificationTier = "Gold";
  else if (/silver\s*(ngo|certified|partner|badge)/i.test(certText)) certificationTier = "Silver";
  else if (/bronze\s*(ngo|certified|partner|badge)/i.test(certText)) certificationTier = "Bronze";

  // ── Transparency rating (from profile page) ──
  let transparencyRating = null;
  const tMatch =
    /(?:transparency|rating)[^>]*>\s*([0-9]\.[0-9])\s*(?:\/\s*5)?/i.exec(html) ||
    /([0-9]\.[0-9])\s*\/\s*5/.exec(html) ||
    /data-(?:transparency|rating)="([0-9](?:\.[0-9])?)"/i.exec(html);
  if (tMatch) {
    const val = parseFloat(tMatch[1]);
    if (!isNaN(val) && val >= 0 && val <= 5) transparencyRating = val;
  }

  return {
    ok: true,
    httpStatus: res.status,
    profileUrl,
    sourceUrl,
    // Legal
    legalName,
    orgType: normalizeOrgType(orgType),
    registrationNumber: registrationNumber?.trim() ?? null,
    pan: pan?.trim() ?? null,
    fcraNumber: fcraNumber?.trim() ?? null,
    fcraRegistered: fcraRegistered || false,
    foundedYear,
    csrEligible,
    // Contact
    website: normalizeUrl(website),
    address: address?.trim() ?? null,
    city,
    state,
    email: email?.trim() ?? null,
    phone: phone?.replace(/\s+/g, "").trim() ?? null,
    // Give Discover quality
    certificationTier,
    transparencyRating,
    // Related collections
    categories,
    socials,
    financials,
    metrics,
    programs,
    reports,
  };
}

// ─── Sub-extractors ───────────────────────────────────────────────────────────

function extractSocialLinks(html, sourceUrl) {
  const platforms = [
    { key: "facebook", re: /href="(https?:\/\/(?:www\.)?facebook\.com\/[^"]{3,100})"/gi },
    { key: "twitter", re: /href="(https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^"]{3,100})"/gi },
    { key: "instagram", re: /href="(https?:\/\/(?:www\.)?instagram\.com\/[^"]{3,100})"/gi },
    { key: "linkedin", re: /href="(https?:\/\/(?:www\.)?linkedin\.com\/(?:company\/|in\/)[^"]{3,100})"/gi },
    { key: "youtube", re: /href="(https?:\/\/(?:www\.)?youtube\.com\/[^"]{3,100})"/gi },
  ];
  const results = [];
  for (const { key, re } of platforms) {
    const m = re.exec(html);
    if (m) {
      results.push({
        platform: key,
        url: m[1],
        source_url: sourceUrl,
        verified: false,
        confidence: "high",
      });
    }
  }
  return results;
}

function extractCategories(html) {
  const CATEGORY_MAP = {
    "Education": /education|school|literacy|scholarship/i,
    "Healthcare": /health|medical|hospital|disease|nutrition|sanitation/i,
    "Women Empowerment": /women|gender|girl|female|self.help group/i,
    "Environment": /environment|climate|tree|green|waste|pollution|ecology/i,
    "Child Welfare": /child|children|kid|orphan|juvenile|adolescent/i,
    "Disability": /disab|handicap|special need|blind|deaf|wheelchair/i,
    "Livelihood": /livelihood|skill|vocational|employment|income|microfinance/i,
    "Rural Development": /rural|village|panchayat|agriculture|farm/i,
    "Water & Sanitation": /water|sanitation|toilet|hygiene|WASH/i,
    "Disaster Relief": /disaster|relief|flood|earthquake|emergency/i,
    "Animal Welfare": /animal|veterinary|stray|wildlife/i,
    "Arts & Culture": /art|culture|music|heritage|dance|theatre/i,
  };

  const results = [];
  // First, look for explicit category/focus-area fields (high confidence)
  const explicitBlock =
    extractFirst(html, /(?:focus\s+area|cause|category|sector)[^>]*>([^<]{3,300})</i) || "";

  for (const [category, re] of Object.entries(CATEGORY_MAP)) {
    if (re.test(explicitBlock)) {
      results.push({ category, confidence: "high", source: "give_discover_explicit" });
    } else if (re.test(html)) {
      results.push({ category, confidence: "medium", source: "program_text_inferred" });
    }
  }
  return results;
}

function extractFinancials(html, sourceUrl) {
  const results = [];
  // Give Discover shows financials as yearly rows, often in a table or structured list
  // Look for year + income/expenditure pairs
  const yearRe = /\b(20\d{2})[\s\-–]*(20\d{2})?\b/g;
  const amountRe = /₹\s*([\d,]+(?:\.\d+)?)\s*(?:Cr|L|Lakh|Crore)?/gi;

  // Look for structured financial blocks near year mentions
  const finBlocks = html.matchAll(
    /(?:financial\s+year|fy|year)[^>]*>\s*(20\d{2})[^<]*/gi
  );

  for (const block of finBlocks) {
    const year = parseInt(block[1], 10);
    const blockCtx = html.slice(block.index, block.index + 500);
    const incomeMatch = /(?:income|receipt)[^₹]*₹\s*([\d,]+(?:\.\d+)?)\s*(Cr|L|Lakh|Crore)?/i.exec(blockCtx);
    const expMatch = /(?:expenditure|expense)[^₹]*₹\s*([\d,]+(?:\.\d+)?)\s*(Cr|L|Lakh|Crore)?/i.exec(blockCtx);

    if (year >= 2010 && year <= new Date().getFullYear()) {
      results.push({
        year,
        total_income: incomeMatch ? parseAmount(incomeMatch[1], incomeMatch[2]) : null,
        total_expenditure: expMatch ? parseAmount(expMatch[1], expMatch[2]) : null,
        source_url: sourceUrl,
        verified: false,
        confidence: "high",
      });
    }
  }
  return results;
}

function extractMetrics(html, sourceUrl) {
  const results = [];
  // Look for impact numbers: "5000 beneficiaries", "100 villages", etc.
  const METRIC_PATTERNS = [
    { re: /([\d,]+)\s*(?:\+)?\s*beneficiar/i, name: "beneficiaries_reached", unit: "people" },
    { re: /([\d,]+)\s*(?:\+)?\s*(?:lives|people|persons)\s+(?:impacted|reached|served)/i, name: "lives_impacted", unit: "people" },
    { re: /([\d,]+)\s*(?:\+)?\s*(?:school|college)s?/i, name: "schools_reached", unit: "schools" },
    { re: /([\d,]+)\s*(?:\+)?\s*village/i, name: "villages_covered", unit: "villages" },
    { re: /([\d,]+)\s*(?:\+)?\s*(?:district|state)s?/i, name: "districts_covered", unit: "districts" },
    { re: /([\d,]+)\s*(?:\+)?\s*(?:volunteer|member)s?/i, name: "volunteers", unit: "volunteers" },
    { re: /([\d,]+)\s*(?:\+)?\s*(?:project|program)s?/i, name: "projects_completed", unit: "projects" },
    { re: /(?:₹|Rs\.?)\s*([\d,]+(?:\.\d+)?)\s*(Cr|L|Lakh|Crore)?\s*(?:raised|disbursed|granted)/i, name: "funds_raised", unit: "INR" },
  ];

  for (const { re, name, unit } of METRIC_PATTERNS) {
    const m = re.exec(html);
    if (m) {
      const rawVal = m[1].replace(/,/g, "");
      const val = parseFloat(rawVal);
      if (!isNaN(val) && val > 0) {
        results.push({
          metric_name: name,
          metric_value: val,
          unit,
          year: null,
          source_url: sourceUrl,
          verified: false,
          confidence: "low",  // pattern-matched from prose — low confidence, clearly flagged
        });
      }
    }
  }
  return results;
}

function extractPrograms(html, sourceUrl) {
  const results = [];
  // Look for program/project sections
  // Common patterns: list items, divs with "programme" or "project" headings
  const programBlocks = html.matchAll(
    /(?:programme|program|project|initiative|scheme)[^>]*>([^<]{10,500})</gi
  );
  const seen = new Set();
  for (const block of programBlocks) {
    const name = decodeHtmlEntities(block[1].trim().slice(0, 200));
    if (name.length < 10 || seen.has(name)) continue;
    seen.add(name);
    results.push({
      name,
      description: null,
      beneficiaries: null,
      location: null,
      status: "ongoing",
      source_url: sourceUrl,
      confidence: "medium",
    });
    if (results.length >= 10) break;  // cap programs per NGO
  }
  return results;
}

function extractReports(html, sourceUrl) {
  const results = [];
  // Look for PDF links or report section links
  const reportRe = /href="([^"]+\.pdf[^"]*)"/gi;
  let m;
  while ((m = reportRe.exec(html)) !== null) {
    const url = m[1].startsWith("http") ? m[1] : `https://give.do${m[1]}`;
    const yearM = /\b(20\d{2})\b/.exec(url) || /\b(20\d{2})\b/.exec(html.slice(Math.max(0, m.index - 200), m.index + 200));
    const year = yearM ? parseInt(yearM[1], 10) : null;
    const isAudit = /audit|financial|balance/i.test(url) || /audit|financial/i.test(html.slice(Math.max(0, m.index - 100), m.index + 100));
    results.push({
      report_type: isAudit ? "audited_financials" : "annual_report",
      title: null,
      year,
      url,
      source_url: sourceUrl,
      confidence: "high",
    });
    if (results.length >= 5) break;
  }
  return results;
}

// ─── Utility helpers ──────────────────────────────────────────────────────────

function decodeHtmlEntities(str) {
  if (!str) return str;
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&lsquo;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Run a regex and return the first capture group (trimmed), or null. */
function extractFirst(text, re) {
  const m = re.exec(text);
  if (!m) return null;
  const val = (m[1] ?? m[0]).trim();
  return decodeHtmlEntities(val);
}

/** Parse Indian currency amounts (Cr/Lakh) → raw number */
function parseAmount(numStr, unit) {
  const base = parseFloat(numStr.replace(/,/g, ""));
  if (isNaN(base)) return null;
  const u = (unit ?? "").toLowerCase();
  if (u.includes("cr")) return base * 10_000_000;
  if (u.includes("l") || u.includes("lakh")) return base * 100_000;
  return base;
}

function normalizeOrgType(raw) {
  if (!raw) return null;
  const r = raw.toLowerCase();
  if (r.includes("trust")) return "Trust";
  if (r.includes("society")) return "Society";
  if (r.includes("section 8") || r.includes("section8")) return "Section 8";
  if (r.includes("foundation")) return "Foundation";
  return raw.trim().slice(0, 50);
}

function normalizeUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.href;
  } catch {
    return null;
  }
}

/** Extract apex domain from a URL (e.g. "goonj.org" from "https://www.goonj.org/about") */
export function apexDomain(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return hostname.toLowerCase();
  } catch {
    return null;
  }
}
