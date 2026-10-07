/**
 * Investor demo seed — one coherent narrative:
 *   Sorting Tax Advisory ↔ Social Education and Equality Foundation
 *   Project: Digital Education & Equal Opportunity Initiative
 *
 * Uses existing tables + 14-module project workspace (service role).
 * Idempotent by fixed slugs / opportunity id. Re-run safe.
 *
 *   npm run seed:demo
 *   npm run seed:demo -- --reset-workspace   # clears module rows for flagship project only
 *
 * Requires .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: DEMO_SEED_PASSWORD (default printed once at end — do not commit passwords)
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const resetWorkspace = process.argv.includes("--reset-workspace");

const DEMO = {
  corporateName: "Sorting Tax Advisory",
  corporateSlug: "sorting-tax-advisory",
  corporateEmail: "csr.admin@sortingtax.demo",
  ngoName: "Social Education and Equality Foundation",
  ngoSlug: "social-education-and-equality-foundation",
  ngoEmail: "admin@see-foundation.demo",
  platformAdminEmail: "platform.admin@corpogn.demo",
  projectTitle: "Digital Education & Equal Opportunity Initiative",
  opportunityId: "a9f8e7d6-c5b4-4321-9876-543210fedcba",
  preAssignmentId: "b8e7d6c5-a4b3-4210-8765-432109fedcba",
  pipelineOpportunityId: "c1d2e3f4-a5b6-4789-abcd-ef0123456789",
  pipelinePreAssignmentId: "d2e3f4a5-b6c3-4789-abcd-ef0123456789",
  pipelineProjectTitle: "Senior Care & Dignified Ageing Centres",
  projectBudgetInr: 5_000_000,
  releasedInr: 3_000_000,
  utilizedInr: 2_140_000,
  committedInr: 400_000,
};

const MODULE_TABLES = [
  "campaigns",
  "funds",
  "ngo_collaboration_notes",
  "audits",
  "workspace_reports",
  "workspace_documents",
  "milestones",
  "tasks",
  "project_timeline",
  "meetings",
  "workspace_messages",
  "approvals",
  "budget_tracking",
  "monitoring_evaluation",
];

const NGO_DOC_TYPES = [
  "certificate12a",
  "certificate80g",
  "csr1Certificate",
  "registrationCertificate",
  "panCard",
  "ngoDarpanId",
  "trustDeed",
  "annualReport",
  "auditReport",
  "financialStatements",
  "impactReport",
  "brochure",
];

function readEnv() {
  const path = join(__dirname, "../../.env.local");
  const raw = readFileSync(path, "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const [key, ...rest] = line.split("=");
    if (key && rest.length) env[key.trim()] = rest.join("=").trim();
  }
  return env;
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function findUserByEmail(admin, email) {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return data?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

async function ensureAuthUser(admin, email, password, metadata) {
  const existing = await findUserByEmail(admin, email);
  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, { user_metadata: metadata });
    return existing.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error) throw new Error(`createUser(${email}): ${error.message}`);
  return data.user.id;
}

async function seedPipelineOpportunity(admin, corporateId, ngoId) {
  const oppPayload = {
    id: DEMO.pipelineOpportunityId,
    corporate_id: corporateId,
    title: DEMO.pipelineProjectTitle,
    description:
      "CSR partnership to upgrade two residential care centres with medical outreach, nutrition, and digital health records for 120 elderly residents in Bengaluru.",
    focus_area: "Healthcare",
    csr_focus_area: "Senior care",
    budget: 3_500_000,
    state: "Karnataka",
    district: "Bengaluru Urban",
    lifecycle_status: "published",
    status: "open",
    published_at: daysAgoIso(12),
    target_beneficiaries: ["Elderly residents", "Caregivers"],
    sdg_targets: ["SDG 3", "SDG 10"],
    duration_months: 24,
    min_trust_score: 70,
  };

  const { error: oppErr } = await admin.from("opportunities").upsert(oppPayload, { onConflict: "id" });
  if (oppErr) console.warn(`pipeline opportunity: ${oppErr.message}`);

  const paPayload = {
    id: DEMO.pipelinePreAssignmentId,
    opportunity_id: DEMO.pipelineOpportunityId,
    ngo_id: ngoId,
    match_score: 87,
    status: "shortlisted",
    source: ["ngo_applied"],
    application_data: {
      summary: "SEE Foundation proposes phased centre upgrades with nurse-led outreach and M&E on resident wellbeing indices.",
      proposed_budget: 3_200_000,
    },
    corporate_confirmed_at: null,
    ngo_confirmed_at: null,
    activated_at: null,
  };
  const { error: paErr } = await admin.from("pre_assignments").upsert(paPayload, { onConflict: "id" });
  if (paErr) console.warn(`pipeline pre_assignment: ${paErr.message}`);
}

function daysAgoIso(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

async function seedDemoNotifications(admin, recipients) {
  const userIds = recipients.map((r) => r.userId).filter(Boolean);
  if (!userIds.length) return;

  await admin.from("notifications").delete().in("user_id", userIds);

  const rows = [];
  for (const { userId, email } of recipients) {
    if (!userId) continue;
    if (email === DEMO.corporateEmail) {
      rows.push(
        {
          user_id: userId,
          title: "Fund release pending approval",
          message: "Q4 expansion tranche (₹4L) awaits finance sign-off on Digital Education & Equal Opportunity Initiative.",
          notification_type: "FUND_APPROVAL",
          entity_type: "project",
          entity_id: DEMO.opportunityId,
        },
        {
          user_id: userId,
          title: "Partnership confirmation needed",
          message: `${DEMO.pipelineProjectTitle}: SEE Foundation is shortlisted — confirm to proceed to dual confirmation.`,
          notification_type: "PARTNERSHIP_CONFIRM",
          entity_type: "pre_assignment",
          entity_id: DEMO.pipelinePreAssignmentId,
        },
      );
    }
    if (email === DEMO.ngoEmail) {
      rows.push(
        {
          user_id: userId,
          title: "Milestone update recorded",
          message: "Digital learning rollout is in progress (60% complete). Corporate steering committee in 5 days.",
          notification_type: "MILESTONE_UPDATE",
          entity_type: "project",
          entity_id: DEMO.opportunityId,
        },
        {
          user_id: userId,
          title: "Impact report review",
          message: "Midline M&E submission is pending corporate approval.",
          notification_type: "REPORT_REVIEW",
          entity_type: "project",
          entity_id: DEMO.opportunityId,
        },
      );
    }
    if (email === DEMO.platformAdminEmail) {
      rows.push({
        user_id: userId,
        title: "Demo network ready",
        message: "Sorting Tax ↔ SEE flagship workspace seeded; Senior Care pipeline awaiting corporate confirm.",
        notification_type: "ADMIN_DEMO",
        entity_type: "platform",
        entity_id: null,
      });
    }
  }

  if (rows.length) {
    const { error } = await admin.from("notifications").insert(rows);
    if (error) console.warn(`notifications: ${error.message}`);
  }
}

async function clearWorkspaceModules(admin, projectId) {
  for (const table of MODULE_TABLES) {
    const { error } = await admin.from(table).delete().eq("project_id", projectId);
    if (error && !error.message.includes("schema cache")) {
      console.warn(`  ⚠ clear ${table}: ${error.message}`);
    }
  }
  await admin.from("activity_logs").delete().eq("project_id", projectId);
}

async function seedWorkspaceModules(admin, projectId, corpUserId, ngoUserId) {
  const pid = projectId;
  const now = new Date();
  const iso = (d) => d.toISOString();
  const daysAgo = (n) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return d;
  };
  const daysAhead = (n) => {
    const d = new Date(now);
    d.setDate(d.getDate() + n);
    return d;
  };

  await admin.from("campaigns").insert({
    project_id: pid,
    title: DEMO.projectTitle,
    description:
      "Flagship CSR program: digital learning centres, teacher enablement, and equal-access scholarships across eight districts.",
    status: "active",
    created_by: corpUserId,
  });

  const releasedTranches = [
    { amount_inr: 1_200_000, purpose: "Q1 infrastructure & devices", days: 120 },
    { amount_inr: 1_000_000, purpose: "Q2 content & facilitator training", days: 75 },
    { amount_inr: 800_000, purpose: "Q3 rollout tranche", days: 30 },
  ];
  for (const t of releasedTranches) {
    const at = daysAgo(t.days);
    await admin.from("funds").insert({
      project_id: pid,
      amount_inr: t.amount_inr,
      purpose: t.purpose,
      released_at: iso(at),
      released_by: corpUserId,
    });
  }
  await admin.from("funds").insert({
    project_id: pid,
    amount_inr: DEMO.committedInr,
    purpose: "Q4 expansion (scheduled release pending approval)",
    released_at: null,
    released_by: corpUserId,
  });

  const budgetLines = [
    { line_item: "Learning centres & hardware", budgeted_inr: 2_000_000, spent_inr: 1_450_000 },
    { line_item: "Digital content & LMS", budgeted_inr: 1_200_000, spent_inr: 420_000 },
    { line_item: "Facilitators & training", budgeted_inr: 1_000_000, spent_inr: 180_000 },
    { line_item: "Monitoring & evaluation", budgeted_inr: 500_000, spent_inr: 60_000 },
    { line_item: "Administration & compliance", budgeted_inr: 300_000, spent_inr: 30_000 },
  ];
  for (const row of budgetLines) {
    await admin.from("budget_tracking").insert({ project_id: pid, ...row, created_by: corpUserId });
  }

  const milestones = [
    { title: "Baseline assessment", due_date: daysAgo(90).toISOString().slice(0, 10), status: "completed", progress: 100 },
    { title: "Learning centre setup", due_date: daysAgo(45).toISOString().slice(0, 10), status: "completed", progress: 100 },
    { title: "Digital learning rollout", due_date: daysAgo(6).toISOString().slice(0, 10), status: "in_progress", progress: 60 },
    { title: "Student engagement program", due_date: daysAhead(21).toISOString().slice(0, 10), status: "in_progress", progress: 45 },
    { title: "Outcome assessment", due_date: daysAhead(60).toISOString().slice(0, 10), status: "pending", progress: 0 },
    { title: "Final impact report", due_date: daysAhead(90).toISOString().slice(0, 10), status: "pending", progress: 0 },
  ];
  for (const m of milestones) {
    const { progress, ...rest } = m;
    const row = { project_id: pid, ...rest, created_by: ngoUserId, progress };
    const { error: mErr } = await admin.from("milestones").insert(row);
    if (mErr?.message?.includes("progress")) {
      await admin.from("milestones").insert({ project_id: pid, ...rest, created_by: ngoUserId });
    }
  }

  const meMetrics = [
    { metric_name: "Target beneficiaries", metric_value: 1000, unit: "students", period: "program" },
    { metric_name: "Beneficiaries reached", metric_value: 742, unit: "students", period: "YTD" },
    { metric_name: "Program completion", metric_value: 618, unit: "students", period: "YTD" },
    { metric_name: "Women & girls served", metric_value: 420, unit: "students", period: "YTD" },
    { metric_name: "Active locations", metric_value: 8, unit: "centres", period: "current" },
    { metric_name: "Learning improvement", metric_value: 27, unit: "percent", period: "baseline vs midline" },
  ];
  for (const m of meMetrics) {
    await admin.from("monitoring_evaluation").insert({ project_id: pid, ...m, created_by: ngoUserId });
  }

  await admin.from("approvals").insert([
    {
      project_id: pid,
      item_type: "fund_release",
      item_ref: "Q4 expansion tranche",
      status: "pending",
      created_by: corpUserId,
    },
    {
      project_id: pid,
      item_type: "impact_report",
      item_ref: "Midline M&E submission",
      status: "pending",
      created_by: ngoUserId,
    },
    {
      project_id: pid,
      item_type: "utilization_certificate",
      item_ref: "UC — Q2",
      status: "approved",
      approved_by: corpUserId,
      created_by: ngoUserId,
    },
  ]);

  await admin.from("audits").insert({
    project_id: pid,
    audit_type: "Financial spot check",
    findings: "Sampled invoices aligned with budget lines; one pending receipt for facilitator stipends.",
    status: "open",
    audit_date: daysAgo(14).toISOString().slice(0, 10),
    created_by: corpUserId,
  });

  await admin.from("workspace_reports").insert([
    {
      project_id: pid,
      report_type: "quarterly",
      title: "Q1 Progress Report — SEE Foundation",
      url: null,
      created_by: ngoUserId,
    },
    {
      project_id: pid,
      report_type: "financial",
      title: "Q2 Utilization Summary",
      url: null,
      created_by: ngoUserId,
    },
  ]);

  await admin.from("workspace_documents").insert([
    { project_id: pid, doc_type: "MoU", storage_path: "demo/see-mou-signed.pdf", uploaded_by: corpUserId },
    { project_id: pid, doc_type: "Baseline survey", storage_path: "demo/baseline-survey.pdf", uploaded_by: ngoUserId },
  ]);

  await admin.from("tasks").insert([
    {
      project_id: pid,
      title: "Upload facilitator attendance — Centre 4",
      assigned_to: ngoUserId,
      status: "open",
      due_date: daysAhead(3).toISOString().slice(0, 10),
      created_by: ngoUserId,
    },
    {
      project_id: pid,
      title: "Approve Q4 fund release",
      status: "open",
      due_date: daysAhead(7).toISOString().slice(0, 10),
      created_by: corpUserId,
    },
  ]);

  await admin.from("project_timeline").insert([
    {
      project_id: pid,
      event_title: "Project signed & workspace activated",
      event_date: daysAgo(100).toISOString().slice(0, 10),
      description: "Sorting Tax Advisory and SEE Foundation began shared execution.",
      created_by: corpUserId,
    },
    {
      project_id: pid,
      event_title: "Digital rollout delayed (6 days)",
      event_date: daysAgo(6).toISOString().slice(0, 10),
      description: "Device shipment slip — risk flagged for executive review.",
      created_by: ngoUserId,
    },
  ]);

  await admin.from("meetings").insert({
    project_id: pid,
    title: "Monthly steering committee",
    scheduled_at: iso(daysAhead(5)),
    notes: "Review milestone 3 slip and Q4 release.",
    created_by: corpUserId,
  });

  await admin.from("workspace_messages").insert([
    {
      project_id: pid,
      sender_type: "corporate",
      sender_user_id: corpUserId,
      body: "Please share midline learning assessment data before the steering meeting.",
    },
    {
      project_id: pid,
      sender_type: "ngo",
      sender_user_id: ngoUserId,
      body: "Midline draft uploaded to reports; 742 students reached across 8 centres.",
    },
  ]);

  await admin.from("ngo_collaboration_notes").insert({
    project_id: pid,
    note: "Joint working group agreed to prioritize girls' scholarship slots in two districts.",
    created_by: corpUserId,
  });

  const activity = [
    { module: "milestones", action: "milestone_updated", actor_type: "ngo", detail: { title: "Digital learning rollout", status: "in_progress" } },
    { module: "funds", action: "release_recorded", actor_type: "corporate", detail: { amount_inr: 800000 } },
    { module: "approvals", action: "approval_pending", actor_type: "corporate", detail: { item_type: "fund_release" } },
    { module: "monitoring_evaluation", action: "metric_updated", actor_type: "ngo", detail: { metric: "Beneficiaries reached", value: 742 } },
  ];
  for (const row of activity) {
    await admin.from("activity_logs").insert({
      project_id: pid,
      module: row.module,
      action: row.action,
      actor_type: row.actor_type,
      actor_id: row.actor_type === "corporate" ? corpUserId : ngoUserId,
      detail: row.detail,
    });
  }
}

async function main() {
  const env = readEnv();
  const URL = env.NEXT_PUBLIC_SUPABASE_URL;
  const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL || !KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const password = process.env.DEMO_SEED_PASSWORD || "InvestorDemo@2026";
  const admin = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  console.log(`\n🎯 CorpoGN investor demo seed\n   ${URL}\n`);

  const corpUserId = await ensureAuthUser(admin, DEMO.corporateEmail, password, {
    account_type: "corporate",
    full_name: "Arvind Sorting",
    corporate_slug: DEMO.corporateSlug,
  });

  const platformAdminUserId = await ensureAuthUser(admin, DEMO.platformAdminEmail, password, {
    account_type: "admin",
    full_name: "CorpoGN Platform Admin",
  });
  const { error: adminUserErr } = await admin.from("admin_users").upsert(
    {
      auth_user_id: platformAdminUserId,
      email: DEMO.platformAdminEmail,
      full_name: "CorpoGN Platform Admin",
      is_active: true,
    },
    { onConflict: "email" },
  );
  if (adminUserErr) throw new Error(`admin_users: ${adminUserErr.message}`);

  const ngoUserId = await ensureAuthUser(admin, DEMO.ngoEmail, password, {
    account_type: "ngo",
    full_name: "Dr. Meera Iyer",
    ngo_slug: DEMO.ngoSlug,
  });

  const { data: corpRow, error: corpErr } = await admin
    .from("corporates")
    .upsert(
      {
        auth_user_id: corpUserId,
        slug: DEMO.corporateSlug,
        company_name: DEMO.corporateName,
        company_email: DEMO.corporateEmail,
        access_status: "active",
        unlocked_at: new Date().toISOString(),
        registration_data: {
          industry: "Professional services / Tax advisory",
          headquarters: "Bengaluru, Karnataka",
          csrFocus: ["Education", "Digital inclusion", "Gender equity"],
          annualCsrBudgetInr: 1_25_00_000,
          flagshipProgram: DEMO.projectTitle,
          complianceContact: "compliance@sortingtax.demo",
        },
      },
      { onConflict: "slug" },
    )
    .select("id")
    .single();
  if (corpErr) throw new Error(`corporates: ${corpErr.message}`);
  const corporateId = corpRow.id;

  const { data: ngoRow, error: ngoErr } = await admin
    .from("ngos")
    .upsert(
      {
        auth_user_id: ngoUserId,
        slug: DEMO.ngoSlug,
        ngo_name: DEMO.ngoName,
        ngo_email: DEMO.ngoEmail,
        access_status: "active",
        has_project: true,
        trust_score: 82,
        mission:
          "Expand equitable access to quality education through digital learning, community centres, and scholarships for underserved students.",
        state: "Karnataka",
        contact_number: "+91 80 4000 1200",
        website: "https://see-foundation.demo",
        registration_number: "KA-2012-SEE-00456",
        pan_number: "AAATS1234F",
        year_of_establishment: 2012,
        employee_count: 48,
        volunteer_count: 220,
        focus_areas: ["Education", "Digital literacy", "Women & girls"],
        beneficiary_types: ["School students", "Out-of-school youth"],
        registration_data: {
          orgType: "Section 8 Company",
          operatingRegions: ["Karnataka", "Tamil Nadu", "Andhra Pradesh"],
        },
        cert_12a: "12A/SEE/2013",
        cert_80g: "80G/SEE/2014",
        csr1_number: "CSR-0001234",
        ngo_darpan_id: "KA/2024/1234567",
        fcra_number: null,
        gst_number: "29AAATS1234F1Z5",
        overall_trust_score: 82,
        transparency_score: 85,
        verification_score: 80,
        documentation_score: 78,
      },
      { onConflict: "slug" },
    )
    .select("id")
    .single();
  if (ngoErr) throw new Error(`ngos: ${ngoErr.message}`);
  const ngoId = ngoRow.id;

  for (const docType of NGO_DOC_TYPES) {
    await admin.from("ngo_documents").upsert(
      {
        ngo_id: ngoId,
        doc_type: docType,
        storage_path: `demo/${DEMO.ngoSlug}/${docType}.pdf`,
        status: docType === "fcraCertificate" ? "uploaded" : "verified",
        verified_at: new Date().toISOString(),
      },
      { onConflict: "ngo_id,doc_type" },
    );
  }

  const members = [
    { role: "finance_officer", fullName: "Kavitha Rao", email: "finance@see-foundation.demo" },
    { role: "compliance_officer", fullName: "Suresh Menon", email: "compliance@see-foundation.demo" },
    { role: "operations_manager", fullName: "Divya Krishnan", email: "ops@see-foundation.demo" },
    { role: "field_coordinator", fullName: "Imran Khan", email: "field@see-foundation.demo" },
    { role: "reporting_executive", fullName: "Lakshmi Devi", email: "reports@see-foundation.demo" },
    { role: "volunteer", fullName: "Aisha Patel", email: "volunteer@see-foundation.demo" },
  ];
  for (const m of members) {
    const uid = await ensureAuthUser(admin, m.email, password, {
      account_type: "ngo_member",
      role: m.role,
      ngo_id: ngoId,
      full_name: m.fullName,
    });
    await admin.from("ngo_members").upsert(
      {
        ngo_id: ngoId,
        auth_user_id: uid,
        email: m.email,
        full_name: m.fullName,
        role: m.role,
        is_active: true,
      },
      { onConflict: "email" },
    );
  }

  const employees = [
    {
      fullName: "Neha Sorting",
      email: "csr.manager@sortingtax.demo",
      position: "CSR Manager",
      pages: ["Dashboard", "My Projects", "Discover NGOs", "NGO Management", "Project Workspace", "ESG & Impact", "Reports & Approvals", "Notifications"],
    },
    {
      fullName: "Vikram Desai",
      email: "finance@sortingtax.demo",
      position: "Finance Manager",
      pages: ["Dashboard", "Budget & Fund Tracking", "Reports & Approvals", "Audit & Compliance", "Notifications"],
    },
    {
      fullName: "Anita Rao",
      email: "compliance@sortingtax.demo",
      position: "Compliance Officer",
      pages: ["Dashboard", "Audit & Compliance", "NGO Management", "Reports & Approvals", "Notifications"],
    },
    {
      fullName: "Rahul Kapoor",
      email: "executive@sortingtax.demo",
      position: "Executive Viewer",
      pages: ["Dashboard", "Master Analytics", "ESG & Impact", "Reports & Approvals"],
    },
  ];
  for (const e of employees) {
    const uid = await ensureAuthUser(admin, e.email, password, {
      account_type: "corporate_employee",
      full_name: e.fullName,
      position: e.position,
      corporate_id: corporateId,
      corporate_slug: DEMO.corporateSlug,
      allowed_pages: e.pages,
    });
    await admin.from("corporate_employees").upsert(
      {
        corporate_id: corporateId,
        auth_user_id: uid,
        email: e.email,
        full_name: e.fullName,
        position: e.position,
        allowed_pages: e.pages,
        is_active: true,
      },
      { onConflict: "email" },
    );
  }

  const oppPayload = {
    id: DEMO.opportunityId,
    corporate_id: corporateId,
    title: DEMO.projectTitle,
    description:
      "Three-year CSR partnership to deploy digital learning infrastructure, train facilitators, and measure learning outcomes for 1,000 underserved students across eight districts.",
    focus_area: "Education",
    csr_focus_area: "Digital Education",
    budget: DEMO.projectBudgetInr,
    state: "Karnataka",
    district: "Bengaluru Urban + 7 districts",
    lifecycle_status: "signed",
    status: "assigned",
    published_at: daysAgoIso(110),
    target_beneficiaries: ["School students grades 6–10"],
    sdg_targets: ["SDG 4", "SDG 5", "SDG 10"],
    duration_months: 36,
  };

  const { error: oppErr } = await admin.from("opportunities").upsert(oppPayload, { onConflict: "id" });
  if (oppErr) throw new Error(`opportunities: ${oppErr.message}`);

  const confirmedAt = daysAgoIso(100);
  const paPayload = {
    id: DEMO.preAssignmentId,
    opportunity_id: DEMO.opportunityId,
    ngo_id: ngoId,
    match_score: 91,
    status: "assigned",
    source: ["admin_recommended", "ngo_applied"],
    corporate_confirmed_at: confirmedAt,
    ngo_confirmed_at: confirmedAt,
    activated_at: confirmedAt,
  };
  const { error: paErr } = await admin.from("pre_assignments").upsert(paPayload, { onConflict: "id" });
  if (paErr) {
    console.warn(`pre_assignments: ${paErr.message} (try running phase4+ SQL migrations)`);
  }

  const { error: wsErr } = await admin.from("project_workspaces").upsert(
    {
      opportunity_id: DEMO.opportunityId,
      pre_assignment_id: DEMO.preAssignmentId,
      corporate_id: corporateId,
      ngo_id: ngoId,
    },
    { onConflict: "opportunity_id" },
  );
  if (wsErr) {
    console.warn(`project_workspaces: ${wsErr.message}`);
  }

  await admin.from("project_connections").upsert(
    {
      corporate_id: corporateId,
      ngo_id: ngoId,
      project_name: DEMO.projectTitle,
      focus_area: "Education",
      budget: String(DEMO.projectBudgetInr),
      status: "active",
      progress: 62,
      milestone: "Digital learning rollout (in progress)",
      latest_update: "742 students reached; milestone 3 tracking 6 days behind plan.",
    },
    { onConflict: "corporate_id,ngo_id,project_name" },
  );

  if (resetWorkspace) {
    console.log("Clearing flagship workspace module rows…");
    await clearWorkspaceModules(admin, DEMO.opportunityId);
  }

  const { count } = await admin
    .from("funds")
    .select("id", { count: "exact", head: true })
    .eq("project_id", DEMO.opportunityId);
  if (!count) {
    console.log("Seeding 14-module workspace data…");
    await seedWorkspaceModules(admin, DEMO.opportunityId, corpUserId, ngoUserId);
  } else {
    console.log("Workspace module data already present (use --reset-workspace to replace).");
  }

  console.log("Seeding pipeline opportunity (Senior Care) + notifications…");
  await seedPipelineOpportunity(admin, corporateId, ngoId);
  await seedDemoNotifications(admin, [
    { userId: corpUserId, email: DEMO.corporateEmail },
    { userId: ngoUserId, email: DEMO.ngoEmail },
    { userId: platformAdminUserId, email: DEMO.platformAdminEmail },
  ]);

  console.log(`
✅ Investor demo seeded

Corporate : ${DEMO.corporateName}
  Admin     ${DEMO.corporateEmail}
  Dashboard /corporate/${DEMO.corporateSlug}/dashboard

NGO       : ${DEMO.ngoName}
  Admin     ${DEMO.ngoEmail}
  Dashboard /ngo/${DEMO.ngoSlug}/dashboard

Platform  : CorpoGN operator console
  Admin     ${DEMO.platformAdminEmail}
  Sign-in   /admin  →  /admin/dashboard

Project   : ${DEMO.projectTitle}
  Budget ₹${(DEMO.projectBudgetInr / 100000).toFixed(2)}L | Released ₹${(DEMO.releasedInr / 100000).toFixed(2)}L | Utilized ₹${(DEMO.utilizedInr / 100000).toFixed(2)}L

Pipeline  : ${DEMO.pipelineProjectTitle} (published — SEE shortlisted, awaiting corporate confirm)

Login password (set DEMO_SEED_PASSWORD to override):
  ${password}

Role logins use the same password. Do not commit passwords to git.
`);
}

main().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
