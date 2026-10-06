/**
 * scripts/ngo-enrichment/lib/sources/website.mjs
 *
 * Scrapes an NGO's official website to extract organisation identity,
 * contact info, social links, and mission/vision text.
 *
 * Returns: { fields: {}, confidence: 0.65, source: url } | null
 */

import { rateLimitedFetch, assertRobotsAllowed, USER_AGENT } from "../../lib/fetcher.mjs";

const SOURCE_TYPE = "official_website";
const CONFIDENCE = 0.65;

/**
 * @param {object} ngo  — row from public.ngos
 * @returns {Promise<EnrichmentResult|null>}
 */
export async function scrapeWebsite(ngo) {
  const url = ngo.website;
  if (!url || !url.startsWith("http")) return null;

  const cleanUrl = url.replace(/\/$/, "");

  try {
    await assertRobotsAllowed(cleanUrl);
  } catch (err) {
    return {
      sourceType: SOURCE_TYPE,
      sourceUrl: cleanUrl,
      fetchSuccess: false,
      fetchError: `robots.txt: ${err.message}`,
      fields: {},
      confidence: 0,
    };
  }

  let html;
  try {
    const res = await rateLimitedFetch(cleanUrl, { timeout: 15000 });
    if (!res.ok) {
      return { sourceType: SOURCE_TYPE, sourceUrl: cleanUrl, fetchSuccess: false, fetchError: `HTTP ${res.status}`, fields: {}, confidence: 0 };
    }
    html = await res.text();
  } catch (err) {
    return { sourceType: SOURCE_TYPE, sourceUrl: cleanUrl, fetchSuccess: false, fetchError: err.message, fields: {}, confidence: 0 };
  }

  const fields = extractFromHtml(html, cleanUrl);

  return {
    sourceType: SOURCE_TYPE,
    sourceUrl: cleanUrl,
    fetchSuccess: true,
    fields,
    confidence: CONFIDENCE,
  };
}

function extractFromHtml(html, baseUrl) {
  const fields = {};

  // ── Strip scripts/styles for text mining ──────────────────────────────
  const cleanText = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // ── Meta description → description ───────────────────────────────────
  const metaDesc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{20,500})["']/i)
    || html.match(/<meta[^>]+content=["']([^"']{20,500})["'][^>]+name=["']description["']/i);
  if (metaDesc) fields.description = htmlDecode(metaDesc[1].trim());

  // ── OG description fallback ───────────────────────────────────────────
  if (!fields.description) {
    const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{20,500})["']/i);
    if (ogDesc) fields.description = htmlDecode(ogDesc[1].trim());
  }

  // ── Mission / Vision ─────────────────────────────────────────────────
  const missionMatch = cleanText.match(/(?:our\s+)?mission[:\s]+([A-Z][^.!?]{30,300}[.!?])/i);
  if (missionMatch) fields.mission = missionMatch[1].trim();

  const visionMatch = cleanText.match(/(?:our\s+)?vision[:\s]+([A-Z][^.!?]{30,300}[.!?])/i);
  if (visionMatch) fields.vision = visionMatch[1].trim();

  // ── Founded year ─────────────────────────────────────────────────────
  const yearMatch = cleanText.match(/(?:established|founded|incorporated|registered|since)[^0-9]*(\b(19|20)\d{2}\b)/i);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    if (year >= 1900 && year <= new Date().getFullYear()) fields.founded_year = year;
  }

  // ── Email ─────────────────────────────────────────────────────────────
  const emailMatch = cleanText.match(/\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/);
  if (emailMatch && !emailMatch[0].includes("@example") && !emailMatch[0].includes("@domain")) {
    fields.email_public = emailMatch[0].toLowerCase();
  }

  // ── Phone ─────────────────────────────────────────────────────────────
  const phoneMatch = cleanText.match(/(?:\+91[\s\-]?)?[6-9]\d{9}|0\d{2,4}[\s\-]?\d{6,8}/);
  if (phoneMatch) fields.phone = phoneMatch[0].replace(/\s/g, "");

  // ── Social Links ─────────────────────────────────────────────────────
  const socials = extractSocialLinks(html);
  Object.assign(fields, socials);

  // ── Logo URL ─────────────────────────────────────────────────────────
  const logoMeta = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (logoMeta) {
    const logoUrl = resolveUrl(logoMeta[1], baseUrl);
    if (logoUrl) fields.logo_url = logoUrl;
  }

  return fields;
}

function extractSocialLinks(html) {
  const socials = {};
  const patterns = {
    linkedin_url:   /href=["'](https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/[^"'?#]+)/i,
    facebook_url:   /href=["'](https?:\/\/(?:www\.)?(?:facebook|fb)\.com\/[^"'?#]+)/i,
    instagram_url:  /href=["'](https?:\/\/(?:www\.)?instagram\.com\/[^"'?#]+)/i,
    twitter_url:    /href=["'](https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^"'?#]+)/i,
    youtube_url:    /href=["'](https?:\/\/(?:www\.)?youtube\.com\/(?:channel|c|user|@)[^"'?#]+)/i,
  };

  for (const [key, pattern] of Object.entries(patterns)) {
    const match = html.match(pattern);
    if (match) socials[key] = match[1];
  }
  return socials;
}

function resolveUrl(href, base) {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function htmlDecode(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}
