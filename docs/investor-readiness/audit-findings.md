# Audit findings (functional & reliability)

## Fixed

| Area | Issue | Root cause | Fix | Verification |
|------|-------|------------|-----|--------------|
| Admin APIs | Public data leak + unauthenticated project PATCH | Routes never called auth helpers | `requirePlatformAdmin` | Code review; build pass |
| API auth | Admin UI `fetch()` without Bearer header | `getCaller` only read Authorization | Cookie fallback in `getCaller` | Admin overview works with session cookie |
| AI | Proposal analysis 500 on client abort (`ECONNRESET`) | Uncaught transient error | Fallback to `localAnalyse()` | Playwright retry passed on AI test |
| Tests | Stale sign-in selectors (3-tab UI) | Sign-in UX redesigned | Updated `ngo-dashboard.spec.ts` | Targeted re-run recommended |
| Tests | `nav-role-assignment` → `nav-team-management` | Sidebar rename | Test + nav map updated | — |
| Tests | Profile save assertion text | Copy is “Profile updated successfully” | Test updated | — |
| Build | Turbopack wrong workspace root | Extra lockfile in parent dir | `turbopack.root` in `next.config.ts` | `npm run build` pass |

## Open / partial

| Area | Issue | Severity | Notes |
|------|-------|----------|-------|
| Corporate E2E | Sign-in / locked-dashboard / chat suites flaky or failing | HIGH | Often timeout on dashboard URL; may be env/data or UI timing |
| NGO role labels | Some role-label tests timed out before `data-testid` fix | MEDIUM | Added `sidebar-role-label` test id |
| Compliance vault | Test expects exactly 6 doc cards | MEDIUM | Verify card count matches product |
| Lint | 64 ESLint errors in large dashboards | LOW for demo | Does not block build |
| Corporate registration | README notes 5-page form may lose fields on submit | MEDIUM | Suite 7 in corporate tests documents bug |

## Real-time (Phase 8)

No Socket.IO usage found. Notifications/messages use HTTP APIs and client refresh.

## Database (Phase 5)

- Schema spread across `supabase-schema.sql` and discovery phase SQL files; no Prisma migrations.
- `access-control.ts` correctly uses membership tables as source of truth over `user_metadata`.
- Full index/constraint audit not automated in this pass — recommend DBA review before scale.
