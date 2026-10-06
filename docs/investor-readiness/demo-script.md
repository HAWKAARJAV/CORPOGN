# CorpoGN — Investor demo script

**Narrative:** One corporate, one NGO, one signed CSR program — operated end-to-end on the real CorpoGN stack (Supabase + Next.js APIs + 14-module project workspace).

**Prepare:** Run `npm run seed:demo` against your demo Supabase project. Use the password printed in the terminal (or set `DEMO_SEED_PASSWORD`). Do not commit passwords to git.

---

## 1. Opening (30s)

CorpoGN is the **operating layer** between corporate CSR capital and NGO execution: discovery, diligence, contracting, shared workspace, financial control, compliance, and measurable impact — not another static CSR slide deck.

---

## 2. Corporate — Sorting Tax Advisory (2 min)

1. Sign in as **csr.admin@sortingtax.demo** (corporate admin).
2. Open **Dashboard** — executive snapshot should show budget, released, utilized, and pending approvals from **live workspace data** (`/api/corporates/workspace-overview`).
3. Call out **role-based employees** (CSR, Finance, Compliance, Executive) under **Employees & Access** — same product, different page ACL.

---

## 3. NGO discovery & diligence (2 min)

1. Go to **Discover NGOs** — heuristic ranking + trust signals (honest labeling: not a black-box ML model).
2. Open **Social Education and Equality Foundation** full profile (`/corporate/sorting-tax-advisory/ngo/[id]`).
3. Walk **trust**, **compliance fields**, **documents on file**, and **focus areas**.

---

## 4. Flagship project (3 min)

1. **My Projects** / **Project Workspace** — **Digital Education & Equal Opportunity Initiative**.
2. Show **corporate ↔ NGO** context, signed lifecycle, and module navigation.
3. Modules to touch (same `project_id` everywhere):
   - **Budget & funds** — ₹50L budget, ₹30L released, ₹21.4L utilized (reconciled in `budget_tracking` + `funds`).
   - **Milestones** — story arc including one delayed milestone (risk).
   - **M&E** — 742 / 1,000 beneficiaries reached (from `monitoring_evaluation`, not hardcoded UI).
   - **Approvals** — pending fund release + report review.
   - **Messages / timeline / activity** — shared operational history.

---

## 5. Financial control (1 min)

Finance user: **finance@sortingtax.demo** — **Budget & Fund Tracking** and **Reports & Approvals** only (page ACL).

Explain: released − utilized − committed pending tranche = available within the released pool.

---

## 6. Governance & compliance (1 min)

Compliance user: **compliance@sortingtax.demo** — **Audit & Compliance**, partner document checklist from NGO record + **Audit & Compliance** AI summary (streaming LLM, optional).

---

## 7. NGO side (2 min)

1. Sign in **admin@see-foundation.demo** — **Command Center** (projects, compliance, opportunities).
2. **Compliance Officer** login — vault / verification emphasis.
3. **Operations** / **Reporting** — milestones, evidence, impact reporting (AI draft uses real M&E when present).

---

## 8. Admin control plane (1 min)

Platform admin — **Overview**, **NGO Directory**, **Matchmaker**, **Pending Confirmations**, **Projects**. Message: CorpoGN **operates the network**, not only hosts two dashboards.

---

## 9. AI (30s)

- **Copilot** — streaming assistant on dashboards.
- **Proposal reviewer** — Schedule VII–style LLM review.
- **Compliance / impact drafts** — grounded in uploaded/summarized context.
- **Discovery fit & matchmaker** — scoring/heuristics; label honestly in UI.

---

## 10. Closing (30s)

CorpoGN connects **capital**, **execution**, **governance**, and **proof** in one system. The investor should leave understanding why replacing this with spreadsheets + email would lose control, auditability, and speed.

---

## Live data propagation proof (required)

1. Apply `supabase/sql/milestones-progress.sql` in Supabase SQL Editor (once). `npm run seed:demo` sets milestone `progress` and falls back if that column is missing.
2. NGO: **ops@see-foundation.demo** → **Milestone Reporting** → **Digital learning rollout** → set progress **80%** → **Save**.
3. Corporate: **csr.admin@sortingtax.demo** → **Campaign Management** → flagship campaign → **Milestones** tab → confirm **80%** (refresh if needed).

No hardcoded progress in the corporate UI — value comes from `PATCH /api/project-workspace/:id/milestones`.

## Demo reset

```bash
npm run seed:demo -- --reset-workspace
```

Re-seeds module rows for the flagship project only; org accounts and opportunity remain.

---

## Accounts reference

| Role | Email |
|------|--------|
| Corporate admin | csr.admin@sortingtax.demo |
| CSR manager | csr.manager@sortingtax.demo |
| Finance | finance@sortingtax.demo |
| Compliance | compliance@sortingtax.demo |
| Executive viewer | executive@sortingtax.demo |
| NGO super admin | admin@see-foundation.demo |
| NGO finance | finance@see-foundation.demo |
| NGO compliance | compliance@see-foundation.demo |
| NGO operations | ops@see-foundation.demo |
| NGO field | field@see-foundation.demo |
| NGO reporting | reports@see-foundation.demo |
| NGO volunteer | volunteer@see-foundation.demo |

Password: set via `DEMO_SEED_PASSWORD` or printed when running `npm run seed:demo`.
