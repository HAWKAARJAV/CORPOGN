# CorpoGN — Investor demo script

**Narrative:** One corporate, one NGO, one **signed** CSR program with live workspace numbers — plus a **second published project** in the matchmaking pipeline so investors see the full lifecycle (post → apply → shortlist → confirm → activate).

**Prepare (required before corpogn.tech or any pitch):**

1. Point `.env.local` / Render env at the **same** Supabase project the site uses.
2. In Supabase SQL Editor (once per database): apply `supabase/sql/milestones-progress.sql` and `supabase/sql/workspace-rls-tenant-scoped.sql`.
3. Run:

```bash
npm run seed:demo
```

Use the password printed in the terminal (or set `DEMO_SEED_PASSWORD`). Do not commit passwords to git.

4. Hard refresh the browser after seeding (corporate + NGO dashboards read `/api/corporates/workspace-overview` and `/api/ngo/workspace-summary`).

---

## 10-minute demo order (recommended)

| Step | Who | Where | What to show |
|------|-----|--------|----------------|
| 1 | Corporate admin | Dashboard | Budget / released / spent / pending approvals from **workspace-overview** (not empty cards) |
| 2 | Corporate admin | My Projects | Flagship **Digital Education…** signed; pipeline **Senior Care…** published with applicant |
| 3 | Corporate admin | Recommended NGOs / confirmations | SEE shortlisted on Senior Care — **awaiting corporate confirm** |
| 4 | NGO admin | Opportunities | Open listings + **server match scores** on `/api/ngo/opportunities` |
| 5 | NGO admin | Command Center | Team count, **742 / 1,000 beneficiaries**, activity log from DB |
| 6 | Corporate admin | Campaign Management → flagship | 14 modules: funds ₹30L released, M&E, milestones (one delayed), approvals queue |
| 7 | Finance / Compliance | Role logins | Page ACL — budget vs audit-only surfaces |
| 8 | Platform admin | Overview + Pending Confirmations | Network stats + pipeline row |
| 9 | Optional live proof | NGO ops → milestone 80% → Save | Corporate milestones tab shows same % via `PATCH …/milestones` |

---

## 1. Opening (30s)

CorpoGN is the **operating layer** between corporate CSR capital and NGO execution: discovery, diligence, contracting, shared workspace, financial control, compliance, and measurable impact — not another static CSR slide deck.

---

## 2. Corporate — Sorting Tax Advisory (2 min)

1. Sign in as **csr.admin@sortingtax.demo** (corporate admin).
2. Open **Dashboard** — executive snapshot shows budget, released, utilized, and pending approvals from **live workspace data** (`/api/corporates/workspace-overview`).
3. Call out **role-based employees** (CSR, Finance, Compliance, Executive) under **Employees & Access** — same product, different page ACL.
4. **Notifications** — pending fund release + impact report + partnership confirm (from seeded `approvals` + pipeline pre-assignment).

---

## 3. NGO discovery & diligence (2 min)

1. Go to **Discover NGOs** — heuristic ranking + trust signals (honest labeling: not a black-box ML model).
2. Open **Social Education and Equality Foundation** full profile (`/corporate/sorting-tax-advisory/ngo/[id]`).
3. Walk **trust**, **compliance fields**, **documents on file**, and **focus areas**.

---

## 4. Flagship project — signed workspace (3 min)

1. **My Projects** / **Project Workspace** — **Digital Education & Equal Opportunity Initiative**.
2. Show **corporate ↔ NGO** context, signed lifecycle, and module navigation.
3. Modules to touch (same `project_id` = opportunity UUID everywhere):
   - **Budget & funds** — ₹50L budget, ₹30L released, ₹21.4L utilized (reconciled in `budget_tracking` + `funds`).
   - **Milestones** — story arc including one delayed milestone (risk).
   - **M&E** — 742 / 1,000 beneficiaries reached (from `monitoring_evaluation`, not hardcoded UI).
   - **Approvals** — pending fund release + report review.
   - **Messages / timeline / activity** — shared operational history.

---

## 5. Pipeline project — lifecycle still in flight (2 min)

Shows what happens **before** the workspace unlocks:

1. **My Projects** — **Senior Care & Dignified Ageing Centres** (published, open).
2. SEE Foundation already **applied** and is **shortlisted** (`pre_assignments`, source `ngo_applied`).
3. Corporate **Recommended NGOs** / confirmation UI — confirm partnership (then NGO confirm → admin activate → `lifecycle_status = signed` + `project_workspaces` — existing product flow).
4. Platform admin **Pending Confirmations** tab — same row visible on the control plane.

Narrate: flagship = “operating”; Senior Care = “how the next deal closes on-platform.”

---

## 6. Financial control (1 min)

Finance user: **finance@sortingtax.demo** — **Budget & Fund Tracking** and **Reports & Approvals** only (page ACL).

Explain: released − utilized − committed pending tranche = available within the released pool.

---

## 7. Governance & compliance (1 min)

Compliance user: **compliance@sortingtax.demo** — **Audit & Compliance**, partner document checklist from NGO record + **Audit & Compliance** AI summary (streaming LLM, optional).

---

## 8. NGO side (2 min)

1. Sign in **admin@see-foundation.demo** — **Command Center** (team count, beneficiaries, activity from `/api/ngo/workspace-summary`).
2. **Opportunities** — match scores from shared fit engine (`ngo-opportunity-fit.mjs`).
3. **Compliance Officer** login — vault / verification emphasis.
4. **Operations** / **Reporting** — milestones, evidence, impact reporting (AI draft uses real M&E when present).

---

## 9. Admin control plane (1 min)

Platform admin — **Overview**, **NGO Directory**, **Matchmaker**, **Pending Confirmations**, **Projects**. Message: CorpoGN **operates the network**, not only hosts two dashboards.

Sign in: **platform.admin@corpogn.demo** (seeded `admin_users` row).

---

## 10. AI (30s)

- **Copilot** — streaming assistant on dashboards.
- **Proposal reviewer** — Schedule VII–style LLM review.
- **Compliance / impact drafts** — grounded in uploaded/summarized context.
- **Discovery fit & matchmaker** — scoring/heuristics; label honestly in UI.

---

## 11. Closing (30s)

CorpoGN connects **capital**, **execution**, **governance**, and **proof** in one system. The investor should leave understanding why replacing this with spreadsheets + email would lose control, auditability, and speed.

---

## Live data propagation proof (required)

1. Apply `supabase/sql/milestones-progress.sql` in Supabase SQL Editor (once). `npm run seed:demo` sets milestone `progress` and falls back if that column is missing.
2. NGO: **ops@see-foundation.demo** → **Milestone Reporting** → **Digital learning rollout** → set progress **80%** → **Save**.
3. Corporate: **csr.admin@sortingtax.demo** → **Campaign Management** → flagship campaign → **Milestones** tab → confirm **80%** (refresh if needed).

No hardcoded progress in the corporate UI — value comes from `PATCH /api/project-workspace/:id/milestones`.

---

## Production / corpogn.tech checklist

| Step | Action |
|------|--------|
| Env | Render web service uses same `NEXT_PUBLIC_SUPABASE_URL` + keys as your seed machine |
| SQL | `milestones-progress.sql` + `workspace-rls-tenant-scoped.sql` applied on that Supabase project |
| Data | SSH/local: `npm run seed:demo` against production Supabase (service role in env only — never commit) |
| Deploy | Latest `main` on Render (includes Tailwind in `dependencies`) |
| Verify | Corporate dashboard totals ≠ 0; NGO Command Center shows 6 team members + 742 beneficiaries |

---

## Demo reset

```bash
npm run seed:demo -- --reset-workspace
```

Re-seeds module rows for the flagship project only; org accounts, pipeline opportunity, and notifications refresh on every full `seed:demo`.

---

## Accounts reference

| Role | Email |
|------|--------|
| Corporate admin | csr.admin@sortingtax.demo |
| CSR manager | csr.manager@sortingtax.demo |
| Finance | finance@sortingtax.demo |
| Compliance | compliance@sortingtax.demo |
| Executive viewer | executive@sortingtax.demo |
| Platform admin | platform.admin@corpogn.demo |
| NGO super admin | admin@see-foundation.demo |
| NGO finance | finance@see-foundation.demo |
| NGO compliance | compliance@see-foundation.demo |
| NGO operations | ops@see-foundation.demo |
| NGO field | field@see-foundation.demo |
| NGO reporting | reports@see-foundation.demo |
| NGO volunteer | volunteer@see-foundation.demo |

Password: set via `DEMO_SEED_PASSWORD` or printed when running `npm run seed:demo`.
