# CorpoGN — Phase 0 Baseline

**Date:** 2026-10-06  
**Repository:** CORPOGN-FINAL (Next.js 16.2.6, React 19, TypeScript 5)

## Stack (actual vs. brief)

| Area | Documented in brief | In repo |
|------|---------------------|---------|
| Framework | Next.js App Router | Yes (`app/`) |
| DB | PostgreSQL | Supabase Postgres (SQL schemas in `supabase-schema.sql`, `scripts/ngo-discovery/*.sql`) |
| ORM | Prisma | **Not used** — `@supabase/supabase-js` + `supabaseAdmin` service role |
| Auth | Supabase | Yes (`@supabase/ssr`, middleware, Bearer + cookie session |
| Real-time | Socket.IO | **Not present** — polling/refresh on dashboards |
| AI | Gemini / OpenRouter | `/api/analyse-proposal` + NGO enrichment scripts |
| Docker | Docker | **No Dockerfile** in repo |
| E2E | Playwright | `tests/*.spec.ts`, `playwright.config.ts` |

## Repository layout

- **`app/`** — Pages (landing, signin/signup, corporate/ngo dashboards, admin) and **47** API route handlers under `app/api/`
- **`lib/`** — `access-control.ts`, `supabase-admin.ts`, `supabase-browser.ts`, project/NGO/corporate helpers
- **`middleware.ts`** — Session + coarse `user_metadata.account_type` gate for `/corporate`, `/ngo`, `/admin/dashboard`, `/admin/enrichment`
- **`scripts/`** — Migrations, seeds, NGO discovery/enrichment pipelines
- **`tests/`** — Playwright E2E (NGO, NGO roles, corporate)

## Major user journeys

1. Public marketing (`/`, `/corpogn-platform`, CSR pages)
2. Corporate / NGO signup → Supabase Auth + org rows
3. Sign-in (org type + admin vs employee mode)
4. Corporate dashboard (locked → chat unlock → full CSR workspace)
5. NGO dashboard (role-based sidebar, compliance, AI proposal, team management)
6. Shared `project_connections` workspace (funds, UC, impact, messages)
7. Admin control center (NGO directory, projects, matchmaking, enrichment)
8. AI proposal analysis (authenticated)

## Baseline verification (this workspace)

| Check | Result |
|-------|--------|
| `npm install` | Pass |
| `npx tsc --noEmit` | Pass |
| `npm run build` | Pass (after turbopack `root` fix in `next.config.ts`) |
| `npm run lint` | **Fail** — 124 problems (64 errors, 60 warnings); mostly `no-explicit-any`, `react-hooks/set-state-in-effect`, unused vars in large dashboard files |
| Playwright E2E | **Partial** — global setup passes; full suite had failures (stale selectors, corporate sign-in timeouts, removed hardcoded service role); browsers installed mid-audit |
| `npm audit` | 15 vulnerabilities reported at install time |

## Environment (required for runtime)

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server only)
- Optional: `GEMINI_API_KEY`, `OPENROUTER_API_KEY`

## Notes

- Next.js warns `middleware` → `proxy` convention deprecation (platform migration).
- Parent-directory `package-lock.json` caused turbopack root inference warning (mitigated via `turbopack.root`).
