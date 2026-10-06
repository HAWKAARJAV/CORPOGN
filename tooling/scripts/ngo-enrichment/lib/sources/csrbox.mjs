/**
 * scripts/ngo-enrichment/lib/sources/csrbox.mjs
 *
 * Parser for CSRBox NGO profiles (csrbox.org).
 * Extracts sector, CSR partners, project descriptions, states served.
 *
 * Returns EnrichmentResult | null
 */

import { rateLimitedFetch, assertRobotsAllowed } from "../../lib/fetcher.mjs";

const SOURCE_TYPE = "csrbox";
const CONFIDENCE = 0.72;
const BASE_SEARCH_URL = "https://csrbox.org/India_CSR_ngo_project_page.php";

/**
 * @param {object} ngo — row from public.ngos
 * @returns {Promise<EnrichmentResult|null>}
 */
export async function scrapeCsrBox(ngo) {
  const searchUrl = `${BASE_SEARCH_URL}?ngo_name=${encodeURIComponent(ngo.ngo_name)}`;

  try {
    await assertRobotsAllowed("https://csrbox.org");
  } catch (err) {
    return {
      sourceType: SOURCE_TYPE,
      sourceUrl: searchUrl,
      fetchSuccess: false,
      fetchError: `robots.txt: ${err.message}`,
      fields: {},
      rawData: {},
      confidence: 0,
    };
  }

  let html;
  try {
    const res = await rateLimitedFetch(searchUrl, { timeout: 15000 });
    if (res.status === 404 || res.status === 403) return null;
    if (!res.ok) {
      return { sourceType: SOURCE_TYPE, sourceUrl: searchUrl, fetchSuccess: false, fetchError: `HTTP ${res.status}`, fields: {}, rawData: {}, confidence: 0 };
    }
    html = await res.text();
  } catch (err) {
    return { sourceType: SOURCE_TYPE, sourceUrl: searchUrl, fetchSuccess: false, fetchError: err.message, fields: {}, rawData: {}, confidence: 0 };
  }

  const rawData = {};
  const fields = extractCsrBoxFields(html, rawData);

  if (Object.keys(fields).length === 0) return null;

  return {
    sourceType: SOURCE_TYPE,
    sourceUrl: searchUrl,
    fetchSuccess: true,
    fields,
    rawData,
    confidence: CONFIDENCE,
  };
}

function extractCsrBoxFields(html, rawData) {
  const fields = {};

  const cleanText = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // ── CSR Focus Areas ───────────────────────────────────────────────────
  const csrKeywords = [
    "Education", "Health", "Environment", "Rural Development", "Women Empowerment",
    "Skill Development", "Water Sanitation", "Child Welfare", "Disability",
    "Livelihood", "Agriculture", "Nutrition", "Elderly", "Sports", "Arts",
  ];
  const foundCsr = csrKeywords.filter(k => new RegExp(`\\b${k}\\b`, "i").test(cleanText));
  if (foundCsr.length) {
    fields.csr_focus_areas = foundCsr;
    rawData.csr_focus_areas = foundCsr;
  }

  // ── States served ─────────────────────────────────────────────────────
  const indianStates = [
    "Delhi", "Maharashtra", "Karnataka", "Tamil Nadu", "Uttar Pradesh",
    "Rajasthan", "Gujarat", "Bihar", "West Bengal", "Odisha", "Madhya Pradesh",
    "Punjab", "Haryana", "Jharkhand", "Assam", "Telangana", "Andhra Pradesh",
    "Kerala", "Uttarakhand", "Himachal Pradesh", "Chhattisgarh", "Goa",
    "Manipur", "Meghalaya", "Nagaland", "Tripura", "Sikkim", "Mizoram",
  ];
  const statesFound = indianStates.filter(s => new RegExp(`\\b${s}\\b`, "i").test(cleanText));
  if (statesFound.length) {
    fields.states_served = statesFound;
    rawData.states_served = statesFound;
  }

  // ── Corporate partners ────────────────────────────────────────────────
  const corporateMatches = html.match(/(?:partnered\s+with|corporate\s+partner|CSR\s+partner)[:\s]*((?:[A-Z][a-z]+(?: [A-Z][a-z]+)*,?\s*)+)/gi);
  if (corporateMatches) {
    rawData.corporate_partners_raw = corporateMatches.slice(0, 5);
  }

  // ── Registration Number ───────────────────────────────────────────────
  const regMatch = cleanText.match(/Reg(?:istration)?\s*(?:No|Number)?[.:\s]+([A-Z]{1,4}\/[0-9]{4}\/[0-9]{4,10}|[A-Z0-9]{6,20})/i);
  if (regMatch) {
    fields.registration_number = regMatch[1].trim();
    rawData.registration_number = fields.registration_number;
  }

  // ── Mission ───────────────────────────────────────────────────────────
  const missionMatch = cleanText.match(/mission[:\s]+([A-Z][^.!?]{40,400}[.!?])/i);
  if (missionMatch) {
    fields.mission = missionMatch[1].trim();
    rawData.mission = fields.mission;
  }

  return fields;
}
