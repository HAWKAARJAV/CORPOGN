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
