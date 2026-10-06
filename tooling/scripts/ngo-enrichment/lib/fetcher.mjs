/**
 * scripts/ngo-enrichment/lib/fetcher.mjs
 * Re-exports the shared fetcher from the ngo-discovery library.
 * Single source of truth for rate-limiting, robots.txt, and User-Agent.
 */
export * from "../../ngo-discovery/lib/fetcher.mjs";
