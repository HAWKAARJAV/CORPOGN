# CorpoGN — Platform Product Guide

**What this document is:** A page-by-page map of what is built in the CorpoGN codebase today—URLs, audiences, data sources, and AI features.  
**Stack:** Next.js 16 (App Router) under `src/`, Supabase (Postgres + Auth), ~49 API routes, hosted example: [corpogn.tech](https://corpogn.tech).

---

## 1. Product in one paragraph

CorpoGN connects **corporate CSR teams**, **NGOs**, and **platform admins** on one system: corporates post CSR opportunities and run signed projects; NGOs discover opportunities, manage compliance, and report impact; admins operate a directory, matchmaker, pre-assignment workflow, and enrichment pipeline. Auth and persistence go through **Supabase**; business logic lives in **Next.js API routes** and shared server libraries under `src/lib/server/`.

---

## 2. Architecture (how pieces connect)

```
Browser
  → Next.js pages (src/app/*)
  → /api/* route handlers (same app)
  → Supabase Postgres + Storage + Auth
```

| Layer | Location | Role |
|--------|-----------|------|
| UI | `src/app/`, `src/components/` | React dashboards, marketing shells |
| API | `src/app/api/**/route.ts` | REST-style JSON APIs |
| Server logic | `src/lib/server/` | Auth (`access-control`), admin client, LLM, trust score, scoring |
| Client helpers | `src/lib/client/` | Browser Supabase, NGO store, types |
| Edge gate | `src/middleware.ts` | Session + coarse role (corporate / ngo / admin) |
| Batch jobs | `tooling/scripts/` | NGO discovery, enrichment, seeds (not in web bundle) |

**Marketing vs app:** Routes like `/` and `/about` render an **iframe** to static HTML in `public/` (e.g. `corpogn-landing.html`). Dashboards and APIs are real Next.js/React.

---

## 3. Public & marketing pages

| URL | Page | What the user sees | Backend |
|-----|------|-------------------|---------|
| `/` | Home | Corpogn marketing landing | Static HTML via `LandingFrame` → `/corpogn-landing.html` |
| `/about` | About | Company / mission content | `/corpogn-about.html` |
| `/blog` | Blog | Blog layout | `/corpogn-blog.html` |
| `/contact` | Contact | Contact page | Static HTML |
| `/services` | Services | Services overview | Static HTML |
| `/privacy-policy` | Privacy | Legal copy | Static HTML |
| `/corpogn-platform` | Platform | Product positioning | `/corpogn-platform.html` |
| `/csr-strategy` | CSR strategy | Consultancy / strategy content | `/corpogn-csr-strategy.html` |
| `/csr-impact-assessment` | Impact assessment | Assessment offering | `/corpogn-csr-impact-assessment.html` |

**Sign-in entry:** Marketing CTAs typically point to `/signin`.

---

## 4. Authentication & onboarding

### `/signin`

- **Audience:** Corporate admin, corporate employee, NGO admin, NGO member.
- **Flow:** Pick organization type → pick mode → email/password → Supabase Auth.
- **Routing after login:** Corporate → `/corporate/[slug]/dashboard`; NGO → `/ngo/[slug]/dashboard`; platform admin uses separate admin entry (metadata / admin checks).

### `/signup` → `/signup/corporate` | `/signup/ngo`

- **Corporate:** Collects company details → `POST /api/corporates/register` → Supabase user + `corporates` row (often `access_status` pending until admin unlock).
- **NGO:** Collects NGO profile → `POST /api/ngos/register` → NGO row + slug for dashboard URL.

### `/admin`

- **Platform admin login** (not corporate/NGO). Server checks admin allow-list via `getAdminForUser`.
- **No demo credentials** in UI (removed for security).

### `/my-account`

- **Any signed-in user:** Profile summary, org context, assigned projects (employee API), password change, sign out.
- **APIs:** Supabase session + `GET /api/employee/profile` where applicable.

---

## 5. Corporate experience

**Base URL:** `/corporate/[slug]/dashboard`  
**Guard:** Middleware + server page checks slug matches `getCorporateIdForUser`.

### Access phases

1. **Account locked** — Limited shell until `access_status === active` (or employee with granted pages).
2. **Pre-project shell** — Profile, employees, post project, my projects list, discover NGOs.
3. **Full workspace** — After project workspace unlock / connections; full sidebar.

### Corporate sidebar destinations (in-app “pages”)

| Destination | Purpose | Data source (typical) |
|-------------|---------|------------------------|
| **Dashboard** | Portfolio summary widgets | Mix of workspace overview API + local workspace state |
| **My Projects** | Posted opportunities, assignments, path to campaigns | `GET/POST /api/corporates/opportunities`, `project_connections` |
| **Recommended NGOs** | AI-ranked suggestions for an opportunity | `GET /api/corporates/recommendations` |
| **Post CSR Project** | Create opportunity (title, budget, SDGs, geography) | `POST /api/corporates/opportunities` (`lifecycle_status: published`) |
| **Master Analytics** | Cross-project analytics view | Workspace overview + aggregated metrics |
| **Campaign Management** | Per-campaign milestones, evidence, spend | Workspace modules + **client workspace model** for rich demo UX |
| **NGO Management** | Partner NGOs, trust, documents | `GET /api/corporates/workspace-overview`, full profile links |
| **Discover NGOs** | Search/rank NGO directory | `GET /api/corporates/discover-ngos` (trust + AI copy) |
| **Project Workspace** | 14 modules per signed project | `GET/POST /api/project-workspace/[projectId]/[module]` |
| **Budget & Fund Tracking** | Budget lines, releases | Workspace `budget_tracking`, `funds` modules + overview API |
| **ESG & Impact** | Partner-reported M&E metrics | `GET /api/corporates/workspace-overview` (real metrics when logged) |
| **Reports & Approvals** | Approval queue for reports, funds, etc. | Overview API + `PATCH /api/corporates/workspace-approvals/[id]` |
| **AI Insights** | Risk/insight cards (workspace) | Mix of recorded + narrative cards; predictive engine noted as future |
| **Audit & Compliance** | Audits, activity trail, partner doc checklist | Overview API (audits, activity, NGO documents) |
| **Employees & Access** | Invite employees, page-level ACL | `GET/POST /api/corporates/employees` |
| **Notifications** | In-app notification list | Workspace notification state + navigation targets |
| **Support / Chat** | Messaging with platform / support | `GET/POST /api/corporates/messages` |
| **Corporate Profile** | Company settings, CSR focus, compliance tab | `GET/PATCH /api/corporates/profile` |

### Other corporate routes

| URL | Purpose |
|-----|---------|
| `/corporate/[slug]/ngo/[ngoId]` | **NGO full profile** — trust breakdown, compliance PDFs, capacity filter | `GET /api/ngos/[id]/full-profile` |

### Corporate AI (UI)

- **Discover NGOs** — “AI-ranked directory” badge; ranking uses trust/fit heuristics + copy from `lib/ai-insights`.
- **Streaming copilot** — Floating chat on all corporate pages; `POST /api/ai/stream` (`task: copilot`).
- **ESG & Impact** — “Draft portfolio impact report” (streaming LLM from real M&E when present).
- **Audit & Compliance** — “Summarize compliance posture” across partners (streaming LLM).

**Note:** Campaign Management still uses a **rich in-browser `Workspace` object** for approvals, notifications, and some campaign UX—good for demos; many lists also sync from **workspace-overview** when a signed project exists.

---

## 6. NGO experience

**Base URL:** `/ngo/[slug]/dashboard`  
**Guard:** Middleware + `getNgoIdForUser` + role from `ngo_members`.

### NGO roles (sidebar differs per role)

| Role | Default landing | Focus |
|------|-----------------|--------|
| **super_admin** | Command Center | Full NGO: compliance, opportunities, team, projects |
| **finance_officer** | Funds | Budget, UC, grant tracking |
| **compliance_officer** | Compliance Vault | Legal docs, verification, audits |
| **operations_manager** | Projects | Milestones, beneficiaries, tasks |
| **field_coordinator** | Assigned Projects | Field media, attendance |
| **reporting_executive** | Impact Reports | Reporting, media library |
| **volunteer** | Assigned Tasks | Tasks, events, uploads |

### NGO sections (by sidebar id)

#### Overview & profile (super admin)

| Section | What it does |
|---------|----------------|
| **Command Center** | KPIs, quick actions (upload docs, AI proposal, opportunities) |
| **NGO Profile** | Edit mission, registration, contact; links to compliance |

#### Compliance & trust

| Section | What it does | APIs / storage |
|---------|----------------|----------------|
| **Compliance Vault** | Upload ~28 doc types; trust impact | Supabase `ngo-documents` bucket + `ngo_documents` |
| **Trust Score** | Score breakdown vs uploads | Trust engine + live score on `ngos` |
| **AI Proposal Reviewer** | Paste proposal → Schedule VII style review | `POST /api/analyse-proposal` (Groq / OpenRouter / Gemini / local) |
| **Legal Documents / NGO Verification / Audit Requests / Compliance Workflow** | Role views on same compliance + workspace modules | Compliance officer mirrors vault data; audits/approvals via project-workspace |

**AI compliance summary (super admin vault):** Streaming summary + optional PDF excerpt → `POST /api/ai/stream` (`compliance_summary`).

#### Growth & funding

| Section | What it does |
|---------|----------------|
| **Opportunities** | Corporate CSR posts visible to NGO | `GET /api/ngo/opportunities` (published lifecycle + AI fit badges) |
| **Corporate Funders** | Funders / corporates tied to NGO | `GET /api/ngo/funders` |
| **Proposals** | Submit/track proposals | `GET/POST /api/ngo/proposals` |
| **Corporate Partnerships** | Partnership overview (admin) |

#### Project work (requires active `project_connections` / signed workspace)

| Section | What it does |
|---------|----------------|
| **My Projects** | Active corporate links | `GET /api/project-connections` |
| **Project Chat** | Messages with corporate | `GET/POST /api/ngo/messages` |
| **Fund Tracking** | Workspace `funds` module |
| **Milestone Reporting** | Milestones + submit | Workspace `milestones` |
| **Impact Reporting** | Evidence upload + **AI impact draft** | Storage + `POST /api/ai/stream` (`impact_report`) |
| **Utilization Certificate** | UC workflow | `POST /api/project-connections/[id]/uc` |

#### Finance / ops / field / reporting role modules

Many sections use **`RoleModuleSection`** → generic **`/api/project-workspace/:projectId/:module`** with NGO module permissions (`project_module_permissions`).

#### Admin (super admin)

| Section | What it does |
|---------|----------------|
| **Team Management** | Invite members, roles | `GET/POST /api/ngos/members`, module permissions API |
| **Settings** | NGO preferences |
| **Reports / Audit Logs** | Reporting shell + audit narrative (audit log table integration varies) |

### NGO AI

- **Copilot** on all sections (streaming).
- **Opportunity list** — heuristic “AI match” scores (`opportunityFitForNgo`).
- **Proposal reviewer** — full LLM chain.

---

## 7. Platform admin

### `/admin/dashboard`

Tabs:

| Tab | Purpose | APIs |
|-----|---------|------|
| **Overview** | KPIs: registered/discovered NGOs, projects, corporates, pipeline runs, tiers | `GET /api/admin/overview` |
| **NGO Directory** | Search/filter discovered + registered NGOs | `GET /api/admin/ngos`, `GET /api/admin/ngos/[id]` |
| **Matchmaker & Pre-Assign** | Rank NGOs for corporate requirements; create pre-assignments | `GET/POST /api/admin/matchmaking`, `suggest`, `pre-assignments` |
| **Projects** | Cross-tenant project list | `GET /api/admin/projects` |
| **Pending Confirmations** | Corporate/NGO confirm activation | `pre-assignments` + `POST .../activate` |
| **Corporates** | Corporate accounts list | `GET /api/admin/corporates` |
| **Pipeline Logs** | Enrichment/discovery logs | `GET /api/admin/logs` |

**Matchmaker scoring:** `lib/scoring` (trust + match + rank) — algorithmic, not LLM.

**Activate workspace:** `POST /api/admin/pre-assignments/[id]/activate` creates/ unlocks project workspace path.

### `/admin/enrichment`

- **NGO enrichment pipeline** UI: trigger, progress, retry failed rows.
- **APIs:** `POST /api/admin/enrichment/trigger`, `GET progress`, `POST retry`.
- **Offline:** `tooling/scripts/ngo-enrichment/*` (crawl, score, import JSON).

### Admin AI

- Dark-theme **copilot** on dashboard tabs.
- Matchmaker shows **“AI scored”** badges (trust/match model).

### Other admin APIs (used by tooling or future UI)

- `GET /api/admin/command-center` — aggregate ops snapshot.
- `GET /api/admin/opportunities` — all opportunities.
- `GET /api/admin/recommendations` — recommendation batches.

---

## 8. Project workspace modules (shared corporate ↔ NGO)

**Route:** `GET|POST /api/project-workspace/[projectId]/[module]`  
**Gate:** Workspace must exist in `project_workspaces` (post-activation). Employees need explicit `project_module_permissions`.

| Module key | Table / purpose |
|------------|-----------------|
| `campaigns` | Campaign records |
| `funds` | Fund releases |
| `budget_tracking` | Budget lines |
| `milestones` | Milestones |
| `monitoring_evaluation` | Impact metrics (ESG page reads these) |
| `approvals` | Approval workflow |
| `audits` | Audit register |
| `documents` | Workspace documents |
| `reports` | Workspace reports |
| `messages` | Workspace messages |
| `meetings` | Meetings |
| `tasks` | Tasks |
| `timeline` | Timeline events |
| `ngo_collaboration` | Collaboration notes |

**Legacy parallel API:** `project_connections` (proposal → active), UC, impact-report uploads, corporate discovery.

---

## 9. AI & automation (honest matrix)

| Feature | Type | Endpoint / code |
|---------|------|-----------------|
| Proposal reviewer | **LLM** (Groq → OpenRouter → Gemini → rules) | `/api/analyse-proposal` |
| Copilot chat | **LLM streaming** | `/api/ai/stream` `copilot` |
| Compliance summary | **LLM streaming** | `/api/ai/stream` `compliance_summary` |
| Impact report draft | **LLM streaming** | `/api/ai/stream` `impact_report` |
| NGO opportunity fit | **Heuristic** | `lib/ai-insights` + NGO opportunities API |
| Discover NGOs ranking | **Heuristic + copy** | discover-ngos API |
| Admin matchmaker | **Scoring engine** | `lib/scoring/*.mjs` |
| Trust score | **Rule engine** | `trust-score-engine` + batch scripts |
| Enrichment pipeline | **Crawl/score** (not LLM) | `tooling/scripts/ngo-enrichment` |

**Env:** `GROQ_API_KEY`, `GROQ_MODEL`, `OPENROUTER_API_KEY`, `GEMINI_API_KEY` (optional).

---

## 10. API catalog (by domain)

### Auth & access

- `access-requests` — Employee page access requests (corporate).

### Corporates

- `corporates/register`, `profile`, `employees`, `opportunities`, `opportunities/[id]/pre-assignments`
- `discover-ngos`, `recommendations`, `messages`
- `workspace-overview`, `workspace-approvals/[approvalId]`

### NGOs

- `ngos/register`, `members`, `module-permissions`, `[id]/full-profile`
- `ngo/profile`, `opportunities`, `proposals`, `funders`, `messages`, `compliance-view`

### Shared / projects

- `opportunities` (public/list), `project-connections` (+ UC, impact-report)
- `project-workspace/[projectId]/[module]`
- `pre-assignments/[id]/messages`, `meetings`

### Admin

- `admin/overview`, `ngos`, `ngos/[id]`, `corporates`, `projects`, `opportunities`
- `admin/matchmaking`, `matchmaking/suggest`, `pre-assignments`, `pre-assignments/[id]/activate`
- `admin/logs`, `enrichment/*`, `command-center`, `recommendations`

### AI

- `analyse-proposal`, `ai/stream`

### Employee

- `employee/profile`

---

## 11. Security model (summary)

- **Sessions:** Supabase cookies + Bearer token on API calls from dashboards.
- **`lib/access-control.ts`:** `getCaller`, `getOrgContext`, `getNgoIdForUser`, `getCorporateIdForUser`, `requirePlatformAdmin`, `authorizeProjectAccess`.
- **Admin routes:** `requirePlatformAdmin` on sensitive admin APIs (overview, NGOs, logs, projects, etc.).
- **Middleware:** Blocks unauthenticated or wrong `account_type` from `/corporate/*`, `/ngo/*`, `/admin/dashboard`, `/admin/enrichment`.
- **Secrets:** Service role only on server; never in client bundles.

---

## 12. What is “real” vs demo-oriented

| Area | Mostly real DB/API | Mixed / demo UI |
|------|-------------------|-----------------|
| Signup, sign-in, profiles | ✓ | |
| NGO compliance uploads & resolved compliance | ✓ | |
| Opportunities publish → NGO feed | ✓ | |
| Project workspace modules (post-activation) | ✓ | |
| Admin directory, matchmaker, activate | ✓ | |
| Corporate workspace overview (ESG, audits, partners) | ✓ | |
| Corporate campaign notifications/approvals workspace | | ✓ Rich client `Workspace` state |
| Some NGO role “shell” sections without project id | | ✓ UI ready, needs workspace |
| Marketing site | Static HTML | |
| Predictive AI Insights (corporate) | | Placeholder copy (no ML engine yet) |

---

## 13. Local development & deploy

```bash
npm install
cp .env.local.example  # or configure Supabase + optional LLM keys
npm run dev            # http://localhost:3000
npm run build && npm run start
```

**Production:** Render service **CORPOGN** → custom domain **corpogn.tech** (connect repo `CORPOGN-FINAL` `main` recommended). Set Supabase + `GROQ_*` env vars on Render.

**E2E:** `npm run test:e2e` (Playwright, `tooling/e2e/`).

**Investor demo seed:** `npm run seed:demo` — Sorting Tax Advisory + Social Education and Equality Foundation + flagship signed project (see `docs/investor-readiness/demo-script.md`).

---

## 14. Related docs

- `STRUCTURE.md` — Repo folder layout (`src/`, `tooling/`, `docs/`)
- `docs/investor-readiness/final-readiness-report.md` — Investor audit verdict
- `docs/investor-readiness/baseline.md` — Stack baseline (update paths to `src/` where noted)

---

*Last updated: 2026-10-07 — matches `src/` layout and main branch feature set (LLM copilot, compliance/impact streaming, admin corporates API, NGO opportunity lifecycle fixes).*
