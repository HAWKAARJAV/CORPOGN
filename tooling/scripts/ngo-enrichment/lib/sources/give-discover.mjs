/**
 * scripts/ngo-enrichment/lib/sources/give-discover.mjs
 *
 * Deep parser for Give Discover (give.do/discover) NGO profile pages.
 * Extracts organisation identity, registration/compliance IDs, leadership
 * team, sectors, districts/states served, head office address, official
 * website, and mission/vision/impact text — everything a public profile
 * page carries that a corporate would need to evaluate the NGO.
 *
 * Returns EnrichmentResult | null
 */

import { rateLimitedFetch, assertRobotsAllowed } from "../../lib/fetcher.mjs";

const SOURCE_TYPE = "give_discover";
const CONFIDENCE = 0.82;
const BASE_URL = "https://give.do/discover";

/**
 * @param {object} ngo — row from public.ngos (needs ngo_name, registration_data)
 * @returns {Promise<EnrichmentResult|null>}
 */
export async function scrapeGiveDiscover(ngo) {
  const slug = buildSlug(ngo.ngo_name);
  const profileUrl = `${BASE_URL}/${slug}`;
  return scrapeGiveDiscoverUrl(profileUrl);
}

/**
 * Scrape a Give Discover profile at a known, exact URL (e.g. from a prior
 * discovery pass that captured the real `/discover/<code>/<slug>/` path).
 *
 * @param {string} profileUrl
 * @returns {Promise<EnrichmentResult|null>}
 */
export async function scrapeGiveDiscoverUrl(profileUrl) {
  try {
    await assertRobotsAllowed(BASE_URL);
  } catch (err) {
    return {
      sourceType: SOURCE_TYPE,
      sourceUrl: profileUrl,
      fetchSuccess: false,
      fetchError: `robots.txt: ${err.message}`,
      fields: {},
      rawData: {},
      confidence: 0,
    };
  }

  let html;
  try {
    const res = await rateLimitedFetch(profileUrl, { timeout: 20000 });
    if (res.status === 404) return null;
    if (!res.ok) {
      return { sourceType: SOURCE_TYPE, sourceUrl: profileUrl, fetchSuccess: false, fetchError: `HTTP ${res.status}`, fields: {}, rawData: {}, confidence: 0 };
    }
    html = await res.text();
  } catch (err) {
    return { sourceType: SOURCE_TYPE, sourceUrl: profileUrl, fetchSuccess: false, fetchError: err.message, fields: {}, rawData: {}, confidence: 0 };
  }

  const title = (html.match(/<title>([^<]+)<\/title>/i) || [])[1] || "";
  if (title.toLowerCase().includes("page not found") || title.toLowerCase().includes("search results")) {
    return null;
  }

  const rawData = {};
  const fields = extractGiveDiscoverFields(html, rawData);

  return {
    sourceType: SOURCE_TYPE,
    sourceUrl: profileUrl,
    fetchSuccess: true,
    fields,
    rawData,
    confidence: CONFIDENCE,
  };
}

function extractGiveDiscoverFields(html, rawData) {
  const fields = {};

  const cleanText = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // ── Generic label → value/badge-list map ────────────────────────────────
  // Give Discover renders most org facts as: <span>LABEL</span> ... <div
  // class="detailsTabDes"><div class="detailstabfield"><p>VALUE</p></div></div>
  // where VALUE is either plain text or a <ul class="listInline orangeBadge">
  // badge list. This single pattern covers District, State, Headquarters,
  // Since, Type, Sub Type, PAN Card, Registration Number, CSR Form 1, etc.
  const labelMap = extractLabeledFields(html);
  rawData.labelMap = labelMap;

  if (labelMap["Registration Number"]) fields.registration_number = String(labelMap["Registration Number"]);
  if (labelMap["PAN Card"]) fields.pan_number = String(labelMap["PAN Card"]);
  if (labelMap["CSR Form 1"]) fields.csr1_number = String(labelMap["CSR Form 1"]);
  if (labelMap["Since"] && /^\d{4}$/.test(String(labelMap["Since"]))) {
    fields.founded_year = parseInt(labelMap["Since"], 10);
  }
  if (labelMap["Type"] || labelMap["Sub Type"]) {
    fields.legal_status = [labelMap["Type"], labelMap["Sub Type"]].filter(Boolean).join(" / ");
  }
  if (Array.isArray(labelMap["District"]) && labelMap["District"].length) {
    fields.districts_served = labelMap["District"];
  }
  if (Array.isArray(labelMap["State"]) && labelMap["State"].length) {
    fields.states_served = labelMap["State"];
  }
  const primarySectors = extractBadgeListAfterLabel(html, "Primary Sectors");
  if (primarySectors.length) {
    fields.sector_primary = primarySectors[0];
    fields.sectors_secondary = primarySectors;
    rawData.primary_sectors = primarySectors;
  }
  if (Array.isArray(labelMap["Demographies Served"]) && labelMap["Demographies Served"].length) {
    fields.beneficiary_types = labelMap["Demographies Served"];
  }
  if (labelMap["Headquarters"] && !fields.address_head_office) {
    fields.address_head_office = String(labelMap["Headquarters"]);
  }

  // ── Precise head-office street address ──────────────────────────────────
  const addressMatch = html.match(/class="office-address[^"]*">([\s\S]*?)<\/p>/);
  if (addressMatch) {
    const addr = addressMatch[1].replace(/<spna>/gi, "").replace(/<\/spna>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (addr.length > 5) fields.address_head_office = addr;
  }

  // ── Website (from the dedicated "Website" section, most reliable) ──────
  const websiteHeadingIdx = html.indexOf(">Website</h2>");
  if (websiteHeadingIdx !== -1) {
    const windowHtml = html.slice(websiteHeadingIdx, websiteHeadingIdx + 1000);
    const hrefMatch = windowHtml.match(/href="(https?:\/\/[^"]+)"/);
    if (hrefMatch) fields.website = hrefMatch[1];
  }
  if (!fields.website) {
    const websiteMatch = html.match(/href=["'](https?:\/\/(?!give\.do)[^"']+)["'][^>]*>[^<]*(?:website|visit|official)/i);
    if (websiteMatch) fields.website = websiteMatch[1];
  }

  // ── Impact paragraph → description ──────────────────────────────────────
  const impactIdx = html.indexOf(">Impact</h2>");
  if (impactIdx !== -1) {
    const windowHtml = html.slice(impactIdx, impactIdx + 1500);
    const pMatch = windowHtml.match(/<p>([\s\S]*?)<\/p>/);
    if (pMatch) {
      const text = cleanFragment(pMatch[1]);
      if (text.length > 30) fields.description = text.substring(0, 1000);
    }
  }

  // ── Vision & Mission ─────────────────────────────────────────────────────
  const visionMissionMatch = html.match(/class="vision-mission-content"[^>]*>\s*<p>([\s\S]*?)<\/p>/);
  if (visionMissionMatch) {
    const full = cleanFragment(visionMissionMatch[1]);
    rawData.vision_mission_raw = full;
    if (/Mission:?/i.test(full)) {
      const parts = full.split(/Mission:?/i);
      const vision = parts[0].replace(/Vision:?/i, "").trim();
      const mission = parts[1] ? parts[1].trim() : "";
      if (vision.length > 15) fields.vision = vision.substring(0, 1000);
      if (mission.length > 15) fields.mission = mission.substring(0, 1000);
    } else if (full.length > 30) {
      fields.mission = full.substring(0, 1000);
    }
  }

  // ── Leadership team ───────────────────────────────────────────────────
  const leadership = extractLeadershipTeam(html);
  if (leadership.length) {
    fields.leadership_team = leadership;
    rawData.leadership_team = leadership;
    if (!fields.founder_name) {
      const founder = leadership.find(l => /founder/i.test(l.role ?? ""));
      if (founder) fields.founder_name = founder.name;
    }
  }

  // ── Fallback description from generic about/description class ──────────
  if (!fields.description) {
    const aboutMatch = html.match(/class=["'][^"']*(?:about|description|mission-text)[^"']*["'][^>]*>([\s\S]{50,1000}?)<\//i);
    if (aboutMatch) {
      const text = aboutMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (text.length > 30) fields.description = text.substring(0, 800);
    }
  }

  // ── FCRA mention (confirmatory flag, not the number) ────────────────────
  if (/\bFCRA\b/.test(cleanText) && /registered|valid/i.test(cleanText)) {
    rawData.fcra_mentioned = true;
  }
  if (/\b12A\b/.test(cleanText)) { fields.cert_12a = "Registered"; rawData.cert_12a = true; }
  if (/\b80G\b/.test(cleanText)) { fields.cert_80g = "Registered"; rawData.cert_80g = true; }

  // ── Sector keyword fallback (if Primary Sectors block wasn't found) ─────
  if (!fields.sector_primary) {
    const sectorKeywords = extractSectorKeywords(cleanText);
    if (sectorKeywords.length > 0) {
      fields.sectors_secondary = sectorKeywords;
      fields.sector_primary = sectorKeywords[0];
      rawData.sectors = sectorKeywords;
    }
  }

  // ── Beneficiary count ─────────────────────────────────────────────────
  const benefMatch = cleanText.match(/(\d[\d,]+)\s*(?:\+\s*)?(?:beneficiar(?:y|ies)|people\s+(?:served|reached|helped|impacted))/i);
  if (benefMatch) {
    const count = parseInt(benefMatch[1].replace(/,/g, ""), 10);
    if (!isNaN(count) && count > 0) rawData.beneficiary_count = count;
  }

  // ── Full cleaned-text log (nothing lost even if regexes above miss fields) ─
  rawData.full_text_dump = cleanText.slice(0, 20000);

  return fields;
}

/** Split-based extractor for the `<span>LABEL</span>...<p>VALUE</p>` pattern used throughout the profile page. */
function extractLabeledFields(html) {
  const map = {};
  const re = /<span>([^<]{2,60})<\/span>[\s\S]{0,200}?<div class="detailsTabDes">\s*<div class="detailstabfield[^"]*">\s*<p>([\s\S]*?)<\/p>\s*<\/div>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const label = m[1].trim();
    const inner = m[2];
    let value;
    if (/orangeBadge/.test(inner)) {
      value = [...inner.matchAll(/class="badge\s*">\s*([^<]+)</g)].map(x => cleanFragment(x[1]));
    } else {
      value = cleanFragment(inner);
    }
    if (value && (!Array.isArray(value) || value.length)) map[label] = value;
  }
  return map;
}

/** Find a `<ul class="listInline orangeBadge">` badge list that immediately follows a given label text. */
function extractBadgeListAfterLabel(html, label) {
  const labelIdx = html.indexOf(label);
  if (labelIdx === -1) return [];
  const ulStart = html.indexOf("listInline orangeBadge", labelIdx);
  if (ulStart === -1 || ulStart - labelIdx > 500) return [];
  const ulEnd = html.indexOf("</ul>", ulStart);
  if (ulEnd === -1) return [];
  const chunk = html.slice(ulStart, ulEnd);
  return [...chunk.matchAll(/class="badge\s*">\s*([^<]+)</g)].map(m => cleanFragment(m[1]));
}

function extractLeadershipTeam(html) {
  const marker = 'class="tab-inner__info--name">';
  const parts = html.split(marker).slice(1);
  const team = [];
  const seen = new Set();
  for (const chunk of parts) {
    const nameMatch = chunk.match(/^\s*([^\n<]+)/);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim();
    if (!name || name.length < 2 || seen.has(name)) continue;
    seen.add(name);
    const linkMatch = chunk.slice(0, 600).match(/href="(https?:\/\/[^"]+)"/);
    team.push({ name, linkedin_url: linkMatch ? linkMatch[1] : null });
  }
  return team;
}

function cleanFragment(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function extractSectorKeywords(text) {
  const SECTOR_MAP = [
    "Education", "Health", "Healthcare", "Women Empowerment", "Child Welfare",
    "Environment", "Livelihood", "Rural Development", "Disability", "Elderly Care",
    "Water Sanitation", "Agriculture", "Nutrition", "Mental Health", "Skill Development",
    "Animal Welfare", "Arts Culture", "Sports", "Disaster Relief", "Human Rights",
    "Tribal Welfare", "Urban Poor",
  ];
  return SECTOR_MAP.filter(sector => new RegExp(`\\b${sector.replace(/\s+/g, "\\s+")}\\b`, "i").test(text));
}

function buildSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}
