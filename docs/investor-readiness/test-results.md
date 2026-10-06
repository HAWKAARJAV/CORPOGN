# Test results (actual runs on 2026-10-06)

## Commands

| Command | Outcome |
|---------|---------|
| `npx tsc --noEmit` | **PASS** |
| `npm run build` | **PASS** (after `turbopack.root` fix) |
| `npm run lint` | **FAIL** — 124 problems (64 errors, 60 warnings) |
| `npx playwright test` | **INCOMPLETE / MIXED** — see below |

## Playwright

**Setup:** `playwright/global-setup.ts` — 7 NGO accounts signed in successfully; auth state saved.

**Environment issues during run:**

1. Chromium not installed initially → fixed with `npx playwright install chromium`.
2. Full suite run exceeded time budget; many tests executed with mixed pass/fail.

**Observed (from partial run):**

- **Passing:** Many NGO role sidebar tests, compliance upload flow, trust score, AI proposal (on retry), corporate sign-in page button visibility.
- **Failing (before test fixes):** NGO sign-in 3-tab expectations; corporate sign-in timeout; support/chat panel selectors; role assignment `nav-role-assignment`; profile “changes saved” copy; role label visibility timeouts.

**Fixes applied after run (re-run recommended):**

- Sign-in spec aligned to new UI.
- `nav-team-management`, profile success text, `sidebar-role-label` test id.
- Removed committed service role key; env loading in Playwright config.

**Re-run command:**

```bash
npx playwright install chromium   # if needed
npx playwright test
```

## Regression tests added

No new test files added in this audit pass; existing specs updated for UI renames and security-related env loading.

## Manual flows

Recommended before investor demo (not all automated here):

- Admin login → overview tab loads (401 without admin session).
- Corporate locked → chat → unlock.
- NGO super admin → team management → AI proposal.
- Direct URL to `/api/admin/overview` without session → 401.
