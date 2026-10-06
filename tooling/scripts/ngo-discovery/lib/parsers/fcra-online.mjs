/**
 * lib/parsers/fcra-online.mjs
 *
 * FCRA Online public search parser for active/registered associations.
 * Source: https://fcraonline.nic.in/fc8_statewise.aspx
 */

import { assertRobotsAllowed, rateLimitedFetch, USER_AGENT } from "../fetcher.mjs";

export const FCRA_SEARCH_URL = "https://fcraonline.nic.in/fc8_statewise.aspx";

const MIN_NAME_CONFIDENCE = 0.9;
const DEFAULT_STATE_CODE = "23"; // Delhi, verified against the FCRA portal.
const STATE_ALIASES = {
  delhi: "Delhi",
  "nct of delhi": "Delhi",
  haryana: "Haryana",
  "uttar pradesh": "Uttar Pradesh",
  up: "Uttar Pradesh",
};

/**
 * Fetch FCRA status for an NGO from the official FCRA Online portal.
 *
 * @param {string} ngoName
 * @param {string|null} state
 * @returns {Promise<{fcraNumber: string, address: string|null, matchConfidence: number, rawRow: object}|null>}
 */
export async function fetchFcraStatus(ngoName, state = null) {
  if (!ngoName || ngoName.trim().length < 3) return null;

  // Some NIC endpoints still present certificate-chain quirks. This mirrors the
  // verified operational requirement for the standalone enrichment script.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  await assertRobotsAllowed(FCRA_SEARCH_URL);

  const cookies = new Map();
  const getRes = await sessionFetch(FCRA_SEARCH_URL, { method: "GET" }, cookies);
  const getHtml = await getRes.text();
  if (!getRes.ok) {
    throw new Error(`FCRA GET failed: HTTP ${getRes.status}`);
  }

  const hidden = parseHiddenFields(getHtml);
  const stateCode = findStateCode(getHtml, state) ?? DEFAULT_STATE_CODE;
  const body = new URLSearchParams({
    ...hidden,
    rd_report_type: "1",
    ddlstate: stateCode,
    ddldist: "0",
    txtsearch: ngoName.trim(),
    rdlist: "2",
    btsubmitt: "Submit",
  });

  const postRes = await sessionFetch(
    FCRA_SEARCH_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://fcraonline.nic.in",
        Referer: FCRA_SEARCH_URL,
      },
      body,
    },
    cookies
  );
  const postHtml = await postRes.text();
  if (!postRes.ok) {
    throw new Error(`FCRA POST failed: HTTP ${postRes.status}`);
  }

  const rows = parseFcraRows(postHtml);
  if (!rows.length) return null;

  const target = normalizeName(ngoName);
  const ranked = rows
    .map((row) => ({
      row,
      score: jaroWinkler(target, normalizeName(row.associationName)),
    }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best || best.score < MIN_NAME_CONFIDENCE) return null;

  return {
    fcraNumber: best.row.fcraNumber,
    address: best.row.address ?? null,
    matchConfidence: round4(best.score),
    rawRow: best.row,
  };
}

async function sessionFetch(url, opts, cookies) {
  const headers = {
    "User-Agent": USER_AGENT,
    Accept: "text/html,application/xhtml+xml,*/*",
    "Accept-Language": "en-IN,en;q=0.9",
    ...(opts.headers ?? {}),
  };

  const cookieHeader = cookieHeaderFromMap(cookies);
  if (cookieHeader) headers.Cookie = cookieHeader;

  const res = await rateLimitedFetch(url, {
    ...opts,
    headers,
  });

  for (const rawCookie of getSetCookieHeaders(res.headers)) {
    const pair = rawCookie.split(";")[0];
    const eqIdx = pair.indexOf("=");
    if (eqIdx > 0) cookies.set(pair.slice(0, eqIdx), pair.slice(eqIdx + 1));
  }

  return res;
}

function getSetCookieHeaders(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

function cookieHeaderFromMap(cookies) {
  return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function parseHiddenFields(html) {
  const fields = {};
  const inputRe = /<input\b[^>]*type=["']hidden["'][^>]*>/gi;
  let match;
  while ((match = inputRe.exec(html)) !== null) {
    const tag = match[0];
    const name = attr(tag, "name");
    if (!name) continue;
    fields[name] = attr(tag, "value") ?? "";
  }
  return fields;
}

function findStateCode(html, state) {
  const canonical = canonicalState(state);
  if (!canonical) return null;

  const selectHtml = extractFirst(html, /<select\b[^>]*name=["']ddlstate["'][^>]*>([\s\S]*?)<\/select>/i);
  if (!selectHtml) return null;

  const optionRe = /<option\b[^>]*value=["']([^"']+)["'][^>]*>([\s\S]*?)<\/option>/gi;
  let match;
  while ((match = optionRe.exec(selectHtml)) !== null) {
    const label = stripTags(decodeHtml(match[2])).trim().toLowerCase();
    if (label === canonical.toLowerCase()) return match[1];
  }

  return null;
}

function canonicalState(state) {
  if (!state) return "Delhi";
  return STATE_ALIASES[String(state).trim().toLowerCase()] ?? state.trim();
}

export function parseFcraRows(html) {
  const table = extractFirst(html, /<table\b[^>]*id=["']tblDetails["'][^>]*>([\s\S]*?)<\/table>/i);
  if (!table) return [];

  const rows = [];
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  while ((trMatch = trRe.exec(table)) !== null) {
    const cells = [];
    const cellRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cellMatch;
    while ((cellMatch = cellRe.exec(trMatch[1])) !== null) {
      cells.push(cleanCell(cellMatch[1]));
    }

    if (cells.length < 4 || cells.some((cell) => /associationname/i.test(cell))) continue;

    const offset = cells.length >= 5 && /^\d+$/.test(cells[0]) ? 1 : 0;
    const fcraNumber = cells[offset]?.trim();
    const associationName = cells[offset + 1]?.trim();
    if (!fcraNumber || !associationName) continue;

    rows.push({
      fcraNumber,
      associationName,
      address: cells[offset + 2]?.trim() || null,
      nature: cells[offset + 3]?.trim() || null,
    });
  }

  return rows;
}

function attr(tag, name) {
  const re = new RegExp(`\\b${name}=["']([^"']*)["']`, "i");
  const match = re.exec(tag);
  return match ? decodeHtml(match[1]) : null;
}

function cleanCell(html) {
  return decodeHtml(stripTags(html).replace(/\s+/g, " ")).trim();
}

function stripTags(html) {
  return html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, " ");
}

function decodeHtml(text) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function extractFirst(text, re) {
  const match = re.exec(text);
  return match ? match[1] : null;
}

function normalizeName(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(?:society|trust|foundation|samiti|sanstha|ngo|india|indian|regd|registered)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function jaroWinkler(s1, s2) {
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;

  const len1 = s1.length;
  const len2 = s2.length;
  const distance = Math.max(Math.floor(Math.max(len1, len2) / 2) - 1, 0);
  const matches1 = new Array(len1).fill(false);
  const matches2 = new Array(len2).fill(false);

  let matches = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - distance);
    const end = Math.min(len2, i + distance + 1);
    for (let j = start; j < end; j++) {
      if (matches2[j] || s1[i] !== s2[j]) continue;
      matches1[i] = true;
      matches2[j] = true;
      matches++;
      break;
    }
  }

  if (!matches) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!matches1[i]) continue;
    while (!matches2[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const jaro = (
    matches / len1 +
    matches / len2 +
    (matches - transpositions / 2) / matches
  ) / 3;

  let prefix = 0;
  for (let i = 0; i < Math.min(4, len1, len2); i++) {
    if (s1[i] !== s2[i]) break;
    prefix++;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}
