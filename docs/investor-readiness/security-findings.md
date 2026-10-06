# Security findings

## Fixed during audit (CRITICAL / HIGH)

| ID | Severity | Issue | Fix |
|----|----------|-------|-----|
| SEC-01 | **CRITICAL** | Eight admin API routes used `supabaseAdmin` with **no authentication** (`overview`, `ngos`, `ngos/[id]`, `logs`, `projects` GET+PATCH, `opportunities`, `pre-assignments`). Unauthenticated callers could read platform-wide data; PATCH could approve/reject projects. | `requirePlatformAdmin()` on all routes; shared helper in `lib/access-control.ts` |
| SEC-02 | **CRITICAL** | Supabase **service role JWT** hardcoded in `tests/corporate-dashboard.spec.ts` | Removed; tests load `SUPABASE_SERVICE_ROLE_KEY` from `.env.local` via `playwright.config.ts` |
| SEC-03 | **HIGH** | Admin login page rendered **plaintext demo email/password** in client bundle (`app/admin/page.tsx`) | Removed; invite-only messaging |
| SEC-04 | **HIGH** | `/api/ngos/[id]/full-profile` allowed any authenticated user to read any NGO’s diligence profile | Restricted to corporate, corporate employee, admin, or owning NGO |
| SEC-05 | **HIGH** | Admin dashboard/enrichment pages had no server-side `admin_users` check (middleware only required *a* session) | Server redirect in `app/admin/dashboard/page.tsx` and `app/admin/enrichment/page.tsx` |

## Auth model (current)

- **API:** `getCaller()` accepts `Authorization: Bearer` **or** Supabase session cookies (for same-origin `fetch`).
- **Pages:** Middleware + route-level DB checks (`getOrgContext`, `getNgoIdForUser`, `getCorporateIdForUser`).
- **Admin API:** `requirePlatformAdmin()` → `admin_users` row, `is_active`.

## Remaining risks (documented, not all fixed)

| ID | Severity | Issue | Recommendation |
|----|----------|-------|----------------|
| SEC-R1 | MEDIUM | Middleware admin routes check session only, not `admin_users` | Mitigated by server page guards + API `requirePlatformAdmin` |
| SEC-R2 | MEDIUM | `ngo/funders` returns active corporates to any authenticated NGO | Acceptable for marketplace; consider field minimization |
| SEC-R3 | LOW | Gemini API key in query string (Google URL) — server-side only | Prefer header-based APIs where available |
| SEC-R4 | MEDIUM | Demo credentials may still exist in README / seed docs | Rotate if ever committed; use env-only for demos |
| SEC-R5 | LOW | `npm audit` high/critical deps | Run `npm audit` and upgrade before production hardening |

## Not applicable

- **Socket.IO / room isolation** — no real-time layer in codebase.
- **Prisma IDOR** — N/A; review Supabase query filters per route instead.
