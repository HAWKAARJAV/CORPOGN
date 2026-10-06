# UX / UI findings

## First 60 seconds (investor path)

**Strengths**

- Live site positioning (README: corpogn.tech) with clear CSR infrastructure story.
- Sign-in flow uses two-step org selection (Corporate vs NGO) then admin vs employee — clearer than legacy 3-tab model.
- NGO dashboard: role-aware sidebar, compliance vault, trust score, AI proposal reviewer — demonstrates depth quickly.

**Risks**

- Admin login no longer shows inline demo password (intentional security fix) — ensure operators have credentials ready for live demo.
- Locked corporate dashboard depends on “Support / Chat” flow; E2E suggests friction if chat panel does not mount immediately.
- Very large dashboard components (`corporate-dashboard.tsx`, `ngo-dashboard.tsx`) increase risk of layout edge cases on small widths.

## Responsive (Phase 3)

- NGO sidebar: mobile drawer (`-translate-x-full` below `lg`); desktop at 1280px (Playwright default) should show sidebar — role label tests failed until dedicated `data-testid` added.
- Corporate nav: horizontal scroll on small screens (`overflow-x-auto` on nav).
- **Not fully audited** at all breakpoints (320–1920) in automation this pass; manual spot-check recommended before pitch.

## States

- Admin API errors now surface as 401/403 JSON — admin UI shows `overviewError` banner on failure (good).
- AI proposal: loading/result/fallback path improved for aborted requests.
- Many sections use skeletons/spinners; inconsistent across every module.

## Accessibility

- Sign-in uses labeled inputs; some icon-only buttons rely on `title` (e.g. sign out).
- No automated a11y scan run in this audit.

## Polish

- ESLint `react-hooks/set-state-in-effect` on admin dashboard data loaders — performance smell, not user-visible.
- Developer-facing AI fallback text mentions `.env.local` keys — acceptable for NGO proposal tool, not ideal on investor-facing copy (consider softer wording in production).
