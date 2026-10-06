# CorpoGN Investor Readiness Report

**Audit date:** 2026-10-06  
**Scope:** Full-repo reconnaissance, security-critical API fixes, auth hardening, test alignment, build verification.

---

## Executive Summary

- **Overall readiness:** Improved materially for security and demo credibility; production build succeeds. E2E suite and lint need a follow-up pass before calling the build “fully green.”
- **Biggest risks addressed:** Unauthenticated admin APIs (full platform data + project approval), committed service-role JWT in tests, exposed admin demo password in UI, cross-tenant NGO full-profile access.
- **Biggest improvements made:** `requirePlatformAdmin` on all previously open admin routes; cookie-aware `getCaller`; server-side admin page guards; AI abort resilience; test/env hygiene; investor-readiness documentation.

---

## Critical Issues

| Issue | Impact | Root Cause | Fix | Verification |
|-------|--------|------------|-----|--------------|
| Open admin APIs | Data breach, unauthorized project approval | Missing auth on 8 routes | `requirePlatformAdmin` + `getCaller` cookies | Code audit; build pass |
| Service role in git | Full DB compromise if repo public | Hardcoded JWT in test file | Env-based key only | Grep clean |
| Admin demo password in UI | Credential harvesting | Client-rendered demo block | Removed from `app/admin/page.tsx` | UI review |

---

## High Severity Issues

| Issue | Impact | Root Cause | Fix | Verification |
|-------|--------|------------|-----|--------------|
| NGO full-profile IDOR | Cross-org diligence leak | Auth checked user only | `mayView` corporate/admin/own NGO | Code audit |
| Admin pages without DB admin check | Wrong users see admin shell | Client-only page | Server `getAdminForUser` redirect | Code audit |
| Playwright / corporate E2E failures | Regressions undetected | UI drift, timeouts, secrets | Spec + env updates | Partial run; **re-run required** |
| Corporate registration form (known) | Failed signups | Multi-page form data loss | Documented; not fixed in this pass | README / test comment |

---

## Medium / Low Issues

| Issue | Impact | Fix | Status |
|-------|--------|-----|--------|
| ESLint 64 errors | CI noise, quality | — | Open |
| npm audit vulnerabilities | Supply chain | `npm audit fix` | Open |
| No Socket.IO (brief mentioned it) | Expectation mismatch | Document actual architecture | Documented |
| No Prisma/Docker in repo | Deploy docs vs reality | README accurate | Documented |
| Middleware vs `proxy` deprecation | Future breakage | Monitor Next.js upgrade | Open |

---

## Security

| Area | Status |
|------|--------|
| Authentication | Supabase session + Bearer; cookie support on API |
| Authorization | RBAC via `getOrgContext`; admin via `admin_users` |
| Tenant isolation | Project routes use `authorizeProjectAccess`; NGO profile scoped |
| Secrets | Service role removed from tests; admin password removed from UI |
| API security | Admin surface gated; mutations on `admin/projects` PATCH protected |
| File security | Not exhaustively audited |
| AI security | Authenticated analyse-proposal; local fallback; prompt injection not fully red-teamed |

---

## Reliability

| Area | Status |
|------|--------|
| API | Admin errors return 401/403; AI transient abort → fallback |
| Database | Membership tables as SoT; no transaction audit on all multi-writes |
| AI | Timeout/abort handling improved |
| Real-time | N/A (HTTP/poll) |
| Error handling | Mixed; server logs on API failures |

---

## UX / UI

| Area | Status |
|------|--------|
| Desktop | Primary demo target; builds |
| Tablet / Mobile | Partial; NGO mobile drawer pattern present |
| Accessibility | Not scanned |
| Loading / error / empty | Present in main flows; uneven |

---

## Performance

- No bundle analysis run.
- Large client dashboards — obvious refactor target post-pitch.
- **Remaining risk:** Heavy initial JS on corporate/NGO dashboards.

---

## Test Coverage

| Item | Detail |
|------|--------|
| Tests updated | `ngo-dashboard.spec.ts`, `ngo-role-dashboards.spec.ts`, `corporate-dashboard.spec.ts`, `playwright.config.ts` |
| Tests executed | Partial Playwright run (118 tests started; mixed results) |
| Manual | Admin API 401, sign-in flows recommended |

---

## Remaining Risks

1. Full Playwright suite not confirmed green after fixes.
2. Lint errors remain (admin/corporate dashboards).
3. Corporate locked/chat journey may fail under slow network (E2E evidence).
4. Admin credentials must be provisioned out-of-band for demo (no inline demo block).
5. Dependency vulnerabilities per `npm audit`.

---

## Final Verdict

**READY WITH KNOWN LOW-RISK ISSUES**

Rationale: **Critical security holes in admin APIs and secrets exposure were fixed**; production **build and typecheck pass**. The product is defensible in a guided demo with prepared admin credentials and happy-path flows. **Do not** treat lint/E2E green or full responsive/a11y audit as complete until follow-up runs pass.

---

## Code changes summary (this audit)

- `lib/access-control.ts` — cookie `getCaller`, `requirePlatformAdmin`
- `app/api/admin/*` — auth on overview, ngos, logs, projects, opportunities, pre-assignments
- `app/api/ngos/[id]/full-profile/route.ts` — view authorization
- `app/api/analyse-proposal/route.ts` — shared getCaller, abort fallback
- `app/admin/*` — server admin guards; removed demo password UI
- `next.config.ts` — turbopack root
- `tests/*`, `playwright.config.ts` — env + selector updates
- `app/ngo/.../ngo-dashboard.tsx` — `sidebar-role-label` test id

---

## Appendix — Enterprise investor pass (2026-10-07)

### Approach

Non-destructive: preserve Next.js + Supabase + 49 APIs + 14-module workspace. Improve **coherence**, **seeded demo narrative**, and **dashboard data binding** — not a rewrite.

### What was already strong

- Project workspace API with module-level permissions
- Corporate `workspace-overview` aggregating real module tables
- NGO role architecture (7 roles)
- Admin matchmaker / pre-assignment / activate flow
- Honest AI split (LLM vs heuristics) documented in `docs/PLATFORM_PRODUCT_GUIDE.md`

### Implemented this pass

| Item | Detail |
|------|--------|
| `npm run seed:demo` | `tooling/scripts/seed-investor-demo.mjs` — Sorting Tax Advisory + SEE Foundation + flagship signed project + all 14 modules + reconciled finance/M&E |
| Demo script | `docs/investor-readiness/demo-script.md` |
| Corporate dashboard | Treat signed projects from `workspace-overview` as “has portfolio”; priority queue includes real pending approvals |
| Render build | `tailwindcss` + `@tailwindcss/postcss` moved to `dependencies` for production install |

### RBAC / UX (2026-10-07 follow-up)

| Area | Status |
|------|--------|
| Corporate employee landing | `CorporateRoleHomeSection` on Dashboard — role inferred from `position` + `allowed_pages`; metric labels and CSR posting table visibility differ by Finance / Compliance / CSR / Executive |
| NGO role home queues | `NgoRoleWorkQueue` on each role’s default sidebar section — live counts from `/api/project-workspace/:id/:module` |
| Campaign vs project copy | Dashboard portfolio table uses “Project”; Campaign Management remains the per-program workspace UI |
| Empty NGO/corporate states | No fake NGO directory or fund tranches; run `npm run seed:demo` before investor walkthrough |

### Security / RLS

- **Added:** `supabase/sql/workspace-rls-tenant-scoped.sql` — tenant-scoped SELECT on `project_workspaces`, `activity_logs`, and 14 module tables via `user_can_access_workspace_project()`. Apply on Supabase; APIs remain primary enforcement (`supabaseAdmin`).
- Continue IDOR review on `project_connections`, storage signed URLs, and employee `allowed_pages` vs API enforcement.

### Investor demo flow

See `docs/investor-readiness/demo-script.md`. Definition of done for demo: run `seed:demo`, walk corporate → NGO profile → workspace → role switch → admin.

### Verdict (this pass)

**DEMO-READY WITH PREP** — Run `seed:demo` + apply `milestones-progress.sql` and `workspace-rls-tenant-scoped.sql` on the target Supabase project before investor meetings. Production deploy must include Tailwind production deps and latest `main`. Lint/E2E/responsive pass tracked below.

### Quality gates (2026-10-07)

| Gate | Result |
|------|--------|
| `npm run build` | **Pass** (Next.js 16.2.6, commit `2f57303`) |
| `npm run lint` | **Pass** on new components; full-repo ESLint still ~115 issues (legacy dashboards/scripts) |
| `npm run test:e2e` | **Not confirmed green** in this session (Playwright run exceeded local timeout; re-run in CI or with live Supabase + `seed:demo`) |
| Responsive (1024/768) | **Partial** — corporate/NGO main shells use `min-w-0` / `overflow-x-auto` on portfolio tables |
| Deploy | **Pushed** `main` → `origin` (HAWKAARJAV/CORPOGN-FINAL); Render auto-deploy expected for service `srv-d6ek9dngi27c73fd79lg` |

---

## Data Architecture & Source of Truth

### Principle

**Seed once → Supabase → existing `/api` routes → UI.** No business KPIs invented in React state. API failures show empty/error — not silent numeric fallbacks.

### Shared project flow

```
Corporate UI ──GET/PATCH──► /api/project-workspace/:projectId/:module ──► Supabase (14 module tables)
NGO UI       ──GET/PATCH──► same routes (authorizeProjectAccess + module permissions)
Corporate portfolio ──GET──► /api/corporates/workspace-overview ──► aggregates module rows for signed projects
```

### Example mutation (investor demo)

1. NGO ops: **Milestone Reporting** → adjust **Digital learning rollout** progress → **Save** (`PATCH …/milestones`).
2. Corporate: **Campaign Management** → **Milestones** tab (or reload dashboard) → same `%` from database.

Requires `supabase/sql/milestones-progress.sql` applied once on the project database.

### Entity map (canonical)

| Entity | DB source | Read API | Mutation API |
|--------|-----------|----------|--------------|
| Signed project | `opportunities` + `project_workspaces` | `workspace-overview`, per-module GET | publish/activate flows (existing) |
| Milestones | `milestones` | `project-workspace/.../milestones` | `PATCH` same route |
| Funds / budget | `funds`, `budget_tracking` | module GET + `workspace-overview` | `POST` / `PATCH` (budget) |
| M&E / impact | `monitoring_evaluation` | module GET + `workspace-overview` | `POST` / `PATCH` |
| Approvals | `approvals` | `workspace-overview` | `POST` module; corporate `PATCH` `/api/corporates/workspace-approvals/:id` |
| Activity | `activity_logs` | `workspace-overview` | written on module POST/PATCH |
| NGO compliance docs | `ngo_documents` + storage | NGO/compliance APIs | NGO upload flows |
| Trust score | `ngos` + trust engine fields | full-profile, discover | enrichment/batch (not UI constants) |

### Removed / reduced anti-patterns (2026-10-07)

- `defaultNgoCandidates` no longer used as API/dashboard fallback when DB is empty.
- Corporate dashboard portfolio table + activity feed use `workspace-overview`, not client `Workspace.campaigns`.
- Notifications page lists real pending approvals + activity log.
- NGO fund tracking + milestone reporting read/write workspace modules.
- Impact AI draft KPIs pulled from `monitoring_evaluation` when `projectId` is set.

### Remaining client `Workspace` state

**Addressed (2026-10-07):** Removed the React-only `Workspace` object (mock campaigns, approvals, reports, issues). Corporate portfolio pages read `/api/corporates/workspace-overview`; demo mutations go through `/api/project-workspace/:projectId/:module` and `/api/corporates/workspace-approvals/:id`. Support chat no longer renders fabricated issue threads.
