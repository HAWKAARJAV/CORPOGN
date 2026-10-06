/**
 * lib/fetcher.mjs
 *
 * Rate-limited fetch with:
 *  - robots.txt enforcement (LOUD failure — not silent skip)
 *  - 1500ms inter-request gap per domain
 *  - Global MAX_FETCHES ceiling (default 1500) to protect against runaway parsers
 *  - Consistent User-Agent for identification
 *
 * HARD CONSTRAINT: If robots.txt disallows a path, this throws — it does NOT
 * silently return empty results. The caller must handle or the pipeline exits.
 */

import { SUPABASE_URL } from "./env.mjs";

// ─── Config ───────────────────────────────────────────────────────────────────
export const USER_AGENT = "CorpoGN-NGO-Discovery/1.0 (+https://corpogn.com/about)";
const RATE_LIMIT_MS = 1500;            // gap between requests to the SAME domain
const MAX_FETCHES = parseInt(process.env.MAX_FETCHES ?? "1500", 10);

// ─── State ────────────────────────────────────────────────────────────────────
/** @type {Map<string, number>} domain → timestamp of last fetch */
const lastFetchTime = new Map();

/** @type {Map<string, { allowed: string[], disallowed: string[] }>} */
const robotsCache = new Map();

let fetchCount = 0;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function getPath(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return "/";
  }
}

/** Parse a robots.txt body into { allowed, disallowed } for User-agent: * */
function parseRobotsTxt(body) {
  const allowed = [];
  const disallowed = [];
  let inWildcard = false;
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const lower = line.toLowerCase();
    if (lower.startsWith("user-agent:")) {
      const agent = line.slice("user-agent:".length).trim();
      inWildcard = agent === "*";
    } else if (inWildcard) {
      if (lower.startsWith("disallow:")) {
        const p = line.slice("disallow:".length).trim();
        if (p) disallowed.push(p);
      } else if (lower.startsWith("allow:")) {
        const p = line.slice("allow:".length).trim();
        if (p) allowed.push(p);
      }
    }
  }
  return { allowed, disallowed };
}

/** Returns true if `path` matches a robots.txt path prefix. */
function matchesPrefix(path, prefixes) {
  return prefixes.some((p) => path.startsWith(p));
}

// ─── robots.txt check (LOUD) ──────────────────────────────────────────────────
/**
 * Throws an Error if robots.txt disallows `url`.
 * Caches robots.txt per domain to avoid repeated fetches.
 *
 * DESIGN: loud failure, not silent skip. If the pipeline can't fetch
 * /discover/ we want an early exit with a clear message, not zero candidates.
 */
export async function assertRobotsAllowed(url) {
  const domain = getDomain(url);
  const path = getPath(url);

  if (!robotsCache.has(domain)) {
    const robotsUrl = `https://${domain}/robots.txt`;
    let robots = { allowed: [], disallowed: [] };
    try {
      const res = await rawFetch(robotsUrl, { timeout: 8000 });
      if (res.ok) {
        const body = await res.text();
        robots = parseRobotsTxt(body);
      }
      // 404 on robots.txt → assume all allowed
    } catch {
      // Network error fetching robots.txt → assume allowed, but log
      console.warn(`  ⚠  Could not fetch robots.txt for ${domain} — assuming allowed`);
    }
    robotsCache.set(domain, robots);
  }

  const { allowed, disallowed } = robotsCache.get(domain);
  // A more specific Allow overrides Disallow
  if (matchesPrefix(path, disallowed) && !matchesPrefix(path, allowed)) {
    throw new Error(
      `🚫  robots.txt on ${domain} disallows "${path}".\n` +
        `    The pipeline cannot fetch Give Discover listings. Exiting.\n` +
        `    Check https://${domain}/robots.txt manually.`
    );
  }
}

// ─── Rate-limited fetch ───────────────────────────────────────────────────────
/** Raw fetch without rate-limiting (used internally for robots.txt). */
async function rawFetch(url, opts = {}) {
  const { timeout = 15000, ...rest } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      ...rest,
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,*/*",
        "Accept-Language": "en-IN,en;q=0.9",
        ...(rest.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Rate-limited fetch.
 *  - Enforces 1500ms gap per domain
 *  - Enforces global MAX_FETCHES ceiling (throws if exceeded)
 *  - Does NOT check robots.txt — callers must call assertRobotsAllowed() first
 *
 * @param {string} url
 * @param {RequestInit & { timeout?: number }} [opts]
 * @returns {Promise<Response>}
 */
export async function rateLimitedFetch(url, opts = {}) {
  // Global ceiling
  fetchCount++;
  if (fetchCount > MAX_FETCHES) {
    throw new Error(
      `🚫  MAX_FETCHES ceiling of ${MAX_FETCHES} reached (current: ${fetchCount}).\n` +
        `    Increase MAX_FETCHES env var or reduce pipeline scope.`
    );
  }

  // Per-domain rate limiting
  const domain = getDomain(url);
  const last = lastFetchTime.get(domain) ?? 0;
  const elapsed = Date.now() - last;
  if (elapsed < RATE_LIMIT_MS) {
    const wait = RATE_LIMIT_MS - elapsed;
    await new Promise((r) => setTimeout(r, wait));
  }
  lastFetchTime.set(domain, Date.now());

  const res = await rawFetch(url, opts);
  return res;
}

/**
 * Convenience: fetch a URL, check robots.txt first, return { ok, status, text, url }.
 * Use this for all discovery/enrichment fetches.
 *
 * @param {string} url
 * @param {{ timeout?: number, method?: string }} [opts]
 * @returns {Promise<{ ok: boolean, status: number, text: string, url: string, error?: string }>}
 */
export async function safeFetch(url, opts = {}) {
  await assertRobotsAllowed(url);
  const res = await rateLimitedFetch(url, opts);
  const text = res.ok ? await res.text() : "";
  return { ok: res.ok, status: res.status, text, url };
}

/**
 * HEAD check: returns status code without downloading body.
 * Used to check if a city-level listing URL exists before paginating.
 */
export async function headCheck(url) {
  await assertRobotsAllowed(url);
  const res = await rateLimitedFetch(url, { method: "HEAD" });
  return res.status;
}

export function getFetchCount() {
  return fetchCount;
}
