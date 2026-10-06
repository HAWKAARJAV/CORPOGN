/**
 * Seed script: creates NGO test accounts in the current Supabase project.
 *
 * Run ONCE after creating the NGO tables in the Supabase dashboard:
 *   node scripts/seed-ngo-test-data.mjs
 *
 * Creates:
 *   - NGO super admin: admin@greenearthngo.in / GreenEarth@2026
 *   - NGO record: "Green Earth Foundation" (slug: green-earth-foundation)
 *   - 6 role members
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Read env vars ────────────────────────────────────────────────────────────
function readEnv() {
  try {
    const raw = readFileSync(join(__dirname, "../../.env.local"), "utf8");
    const env = {};
    for (const line of raw.split("\n")) {
      const [key, ...rest] = line.split("=");
      if (key && rest.length) env[key.trim()] = rest.join("=").trim();
    }
    return env;
  } catch {
    return {};
  }
}

const env  = readEnv();
const URL  = env["NEXT_PUBLIC_SUPABASE_URL"]  || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY  = env["SUPABASE_SERVICE_ROLE_KEY"] || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(URL, KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Helper: create auth user ─────────────────────────────────────────────────
async function createAuthUser(email, password, metadata) {
  // Check if user already exists
  const { data: existing } = await admin.auth.admin.listUsers();
  const found = existing?.users?.find((u) => u.email === email);
  if (found) {
    console.log(`  ↩ ${email} already exists (${found.id})`);
    return found.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error) throw new Error(`createUser(${email}): ${error.message}`);
  console.log(`  ✓ Created auth user: ${email} (${data.user.id})`);
  return data.user.id;
}

// ─── Helper: slugify ──────────────────────────────────────────────────────────
function toSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🌿  NGO Test Data Seed — ${URL}\n`);

  const NGO_NAME  = "Green Earth Foundation";
  const NGO_EMAIL = "admin@greenearthngo.in";
  const NGO_PASS  = "GreenEarth@2026";
  const NGO_SLUG  = toSlug(NGO_NAME);

  // ── 1. Create NGO super admin auth user ───────────────────────────────────
  console.log("1. Creating NGO super admin...");
  const adminUserId = await createAuthUser(NGO_EMAIL, NGO_PASS, {
    account_type: "ngo",
    ngo_slug:     NGO_SLUG,
    full_name:    "Green Earth Admin",
  });

  // ── 2. Create/upsert NGO record ───────────────────────────────────────────
  console.log("2. Creating NGO record in 'ngos' table...");
  const { data: existingNgo } = await admin
    .from("ngos")
    .select("id")
    .eq("auth_user_id", adminUserId)
    .single();

  let ngoId;
  if (existingNgo) {
    ngoId = existingNgo.id;
    console.log(`  ↩ NGO record already exists (${ngoId})`);
  } else {
    const { data: ngoRow, error: ngoErr } = await admin
      .from("ngos")
      .insert({
        auth_user_id:      adminUserId,
        slug:              NGO_SLUG,
        ngo_name:          NGO_NAME,
        ngo_email:         NGO_EMAIL,
        access_status:     "pending",
        has_project:       false,
        trust_score:       15,
        registration_data: {
          orgName:          NGO_NAME,
          orgType:          "Trust",
          regNumber:        "MAH-2024-00123",
          focusArea:        "Education",
          state:            "Maharashtra",
          city:             "Mumbai",
          pin:              "400001",
          contactEmail:     NGO_EMAIL,
          contactPhone:     "9876543210",
          website:          "https://greenearthfoundation.in",
        },
      })
      .select("id")
      .single();
    if (ngoErr) throw new Error(`Insert ngos: ${ngoErr.message}`);
    ngoId = ngoRow.id;
    console.log(`  ✓ NGO record created (${ngoId})`);
  }

  // ── 3. Create 6 role members ──────────────────────────────────────────────
  console.log("3. Creating 6 NGO role members...");
  const MEMBERS = [
    { role: "finance_officer",    fullName: "Rahul Mehta",      email: "finance@greenearthngo.in",    password: "Finance@2026"    },
    { role: "compliance_officer", fullName: "Ananya Sharma",    email: "compliance@greenearthngo.in", password: "Comply@2026"     },
    { role: "operations_manager", fullName: "Vikram Patel",     email: "ops@greenearthngo.in",        password: "Ops@2026"        },
    { role: "field_coordinator",  fullName: "Pooja Nair",       email: "field@greenearthngo.in",      password: "Field@2026"      },
    { role: "reporting_executive",fullName: "Sneha Kulkarni",   email: "reporter@greenearthngo.in",   password: "Report@2026"     },
    { role: "volunteer",          fullName: "Arjun Singh",      email: "volunteer@greenearthngo.in",  password: "Volunteer@2026"  },
  ];

  for (const m of MEMBERS) {
    const memberId = await createAuthUser(m.email, m.password, {
      account_type: "ngo_member",
      role:         m.role,
      ngo_id:       ngoId,
      full_name:    m.fullName,
    });

    // Insert ngo_members record (skip if exists)
    const { data: existingMember } = await admin
      .from("ngo_members")
      .select("id")
      .eq("auth_user_id", memberId)
      .single();

    if (!existingMember) {
      const { error: memberErr } = await admin.from("ngo_members").insert({
        ngo_id:      ngoId,
        auth_user_id: memberId,
        email:       m.email,
        full_name:   m.fullName,
        role:        m.role,
        is_active:   true,
      });
      if (memberErr) throw new Error(`Insert ngo_members (${m.email}): ${memberErr.message}`);
      console.log(`  ✓ Member created: ${m.fullName} (${m.role})`);
    } else {
      console.log(`  ↩ Member already exists: ${m.email}`);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`
✅  All done!

NGO super admin:
  Email:    admin@greenearthngo.in
  Password: GreenEarth@2026
  NGO slug: ${NGO_SLUG}
  NGO ID:   ${ngoId}

Dashboard: http://localhost:3000/ngo/${NGO_SLUG}/dashboard

Role members:
  finance@greenearthngo.in    / Finance@2026     (Finance Officer)
  compliance@greenearthngo.in / Comply@2026      (Compliance Officer)
  ops@greenearthngo.in        / Ops@2026         (Operations Manager)
  field@greenearthngo.in      / Field@2026       (Field Coordinator)
  reporter@greenearthngo.in   / Report@2026      (Reporting Executive)
  volunteer@greenearthngo.in  / Volunteer@2026   (Volunteer)
`);
}

main().catch((err) => {
  console.error("❌ Seed failed:", err.message);
  process.exit(1);
});
