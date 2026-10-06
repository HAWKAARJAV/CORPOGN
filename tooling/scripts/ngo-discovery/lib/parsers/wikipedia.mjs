/**
 * lib/parsers/wikipedia.mjs
 *
 * Fetches Wikipedia's list of NGOs in India for a second discovery source
 * and dedup signal.
 *
 * CONFIRMED URL (British spelling — American spelling 404s):
 *   https://en.wikipedia.org/wiki/List_of_non-governmental_organisations_in_India
 *
 * Returns a Set<string> of normalised NGO names found on the page.
 * These names are used ONLY for:
 *   1. Cross-checking Give Discover candidates (wikipedia_match = true/false)
 *   2. Additional candidate names not on Give Discover (fed into discovery pool)
 *
 * No field values are taken from Wikipedia — it is a discovery/dedup signal only.
 * If the fetch fails, the pipeline continues (non-fatal — just loses the signal).
 */

import { safeFetch } from "../fetcher.mjs";

// CONFIRMED URL — British spelling required (American spelling /non-governmental_organizations_in_India/ → 404)
const WIKIPEDIA_URL =
  "https://en.wikipedia.org/wiki/List_of_non-governmental_organisations_in_India";

/**
 * Fetch Wikipedia NGO list. Returns:
 * {
 *   names: Set<string>,       — normalised NGO names (for name-similarity dedup)
 *   rawEntries: Array<{name, description, location}>,  — for candidate discovery
 *   fetchedUrl: string,
 *   ok: boolean,
 * }
 */
export async function fetchWikipediaList() {
  console.log(`  ↳ Fetching Wikipedia NGO list: ${WIKIPEDIA_URL}`);

  let res;
  try {
    res = await safeFetch(WIKIPEDIA_URL, { timeout: 20000 });
  } catch (err) {
    // robots.txt block = loud (re-throw). Network errors = non-fatal warning.
    if (err.message.startsWith("🚫")) throw err;
    console.warn(`  ⚠  Wikipedia fetch failed: ${err.message}. Continuing without Wikipedia signal.`);
    return { names: new Set(), rawEntries: [], fetchedUrl: WIKIPEDIA_URL, ok: false };
  }

  if (!res.ok) {
    console.warn(`  ⚠  Wikipedia returned HTTP ${res.status}. Continuing without Wikipedia signal.`);
    return { names: new Set(), rawEntries: [], fetchedUrl: WIKIPEDIA_URL, ok: false };
  }

  const entries = parseWikipediaHtml(res.text);
  const names = new Set(entries.map((e) => normalizeName(e.name)));

  console.log(`  ✓  Wikipedia: ${entries.length} NGOs extracted`);
  return { names, rawEntries: entries, fetchedUrl: WIKIPEDIA_URL, ok: true };
}

/**
 * Parse the Wikipedia page HTML for NGO names, descriptions, and locations.
 *
 * The page uses various structures:
 *   - <li> items with <b>Name</b> — description text
 *   - Table rows with NGO name in first column
 *   - Section headings may indicate state/region
 *
 * We extract <b>...</b> tags within list items as the primary source since
 * Wikipedia's NGO list uses bold for organisation names.
 */
function parseWikipediaHtml(html) {
  const entries = [];
  const seen = new Set();

  // Strategy 1: <li> items containing <b>NGO Name</b>
  const liPattern = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let liMatch;
  while ((liMatch = liPattern.exec(html)) !== null) {
    const liContent = liMatch[1];
    // Each list item should have a bolded name
    const boldMatch = /<b>([^<]{3,150})<\/b>/i.exec(liContent);
    if (!boldMatch) continue;

    const name = stripHtml(boldMatch[1]).trim();
    if (name.length < 3 || seen.has(normalizeName(name))) continue;

    // Description = text after the bold tag (strip HTML)
    const afterBold = liContent.slice(liContent.indexOf("</b>") + 4);
    const description = stripHtml(afterBold).replace(/^\s*[–\-:,\s]+/, "").trim().slice(0, 300) || null;

    // Try to extract city/state from link text or description
    const location = extractLocationHint(liContent, description);

    seen.add(normalizeName(name));
    entries.push({ name, description, location });
  }

  // Strategy 2: Table rows — first <td> as name if it contains a link
  const tdPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  while ((trMatch = tdPattern.exec(html)) !== null) {
    const tds = [...trMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
    if (tds.length === 0) continue;
    const nameTd = stripHtml(tds[0][1]).trim();
    if (nameTd.length < 3 || nameTd.length > 150 || seen.has(normalizeName(nameTd))) continue;
    if (/^[0-9]+$/.test(nameTd)) continue;  // Skip row numbers
    seen.add(normalizeName(nameTd));
    entries.push({
      name: nameTd,
      description: tds[1] ? stripHtml(tds[1][1]).trim().slice(0, 300) : null,
      location: tds[2] ? stripHtml(tds[2][1]).trim().slice(0, 100) : null,
    });
  }

  return entries;
}

/**
 * Try to find a city/location hint in list item content or description.
 * Returns city string or null.
 */
function extractLocationHint(html, description) {
  const NCR_CITIES = ["Delhi", "New Delhi", "Noida", "Ghaziabad", "Gurugram", "Faridabad", "Greater Noida"];
  const MAJOR_CITIES = ["Mumbai", "Bangalore", "Chennai", "Kolkata", "Hyderabad", "Pune", "Ahmedabad"];

  const searchText = (stripHtml(html) + " " + (description ?? "")).toLowerCase();

  for (const city of NCR_CITIES) {
    if (searchText.includes(city.toLowerCase())) return city;
  }
  for (const city of MAJOR_CITIES) {
    if (searchText.includes(city.toLowerCase())) return city;
  }
  return null;
}

/** Strip HTML tags from a string. */
function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalise an NGO name for set membership / similarity checks.
 * Lowercases, removes punctuation, common suffixes.
 */
export function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/\b(?:foundation|trust|society|ngo|india|international|organisation|organization|for the|of)\b/gi, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
