#!/usr/bin/env node
/**
 * scripts/ngo-enrichment/import-discovered.mjs
 *
 * Imports/syncs discovered NGOs from public.discovered_ngos into the live public.ngos table.
 * Generates placeholder auth_user_ids and unique slugs for each.
 *
 * Usage:
 *   node scripts/ngo-enrichment/import-discovered.mjs
 */

import { randomUUID } from "crypto";
import { supabase } from "./lib/supabase.mjs";

function toSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function main() {
  console.log("🚀 Starting import of discovered NGOs...");

  // ── 1. Fetch discovered NGOs ──────────────────────────────────────────
  const { data: discovered, error: discErr } = await supabase
    .from("discovered_ngos")
    .select("*");

  if (discErr) {
    console.error("❌ Failed to fetch discovered NGOs:", discErr.message);
    process.exit(1);
  }

  console.log(`📋 Found ${discovered.length} discovered NGOs in staging.`);

  // ── 2. Fetch existing NGOs to prevent duplicates ─────────────────────
  const { data: existing, error: existErr } = await supabase
    .from("ngos")
    .select("slug, ngo_name, pan_number");

  if (existErr) {
    console.error("❌ Failed to fetch existing NGOs:", existErr.message);
    process.exit(1);
  }

  const existingSlugs = new Set(existing.map(n => n.slug));
  const existingNames = new Set(existing.map(n => n.ngo_name.toLowerCase().trim()));
  const existingPans = new Set(existing.map(n => n.pan_number).filter(Boolean));

  let imported = 0;
  let skipped = 0;

  for (const d of discovered) {
    const nameLower = d.name.toLowerCase().trim();
    let slug = toSlug(d.name);

    // Skip if name or PAN already exists
    if (existingNames.has(nameLower) || (d.pan && existingPans.has(d.pan))) {
      skipped++;
      continue;
    }

    // Ensure slug uniqueness
    let counter = 1;
    let baseSlug = slug;
    while (existingSlugs.has(slug)) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }
    existingSlugs.add(slug);

    // Determine fallback email
    let domain = "placeholder.org";
    if (d.website && d.website.startsWith("http")) {
      try {
        const parsed = new URL(d.website);
        domain = parsed.hostname.replace(/^www\./, "");
      } catch {
        // noop
      }
    }
    const cleanEmail = `info@${domain}`;

    const placeholderAuthUserId = randomUUID();

    const insertPayload = {
      auth_user_id: placeholderAuthUserId,
      slug,
      ngo_name: d.name,
      ngo_email: cleanEmail,
      access_status: "pending",
      has_project: false,
      trust_score: 15,
      registration_data: {
        orgName: d.name,
        orgType: d.org_type || "Trust",
        regNumber: d.registration_number || "",
        focusArea: d.sector_primary || "",
        state: d.state || "",
        city: d.city || "",
        contactEmail: cleanEmail,
        website: d.website || "",
      },
      // Seed columns populated from give discover
      description: d.description || null,
      founded_year: d.founded_year || null,
      registration_number: d.registration_number || null,
      pan_number: d.pan || null,
      fcra_number: d.fcra_number || null,
      ngo_darpan_id: d.ngo_darpan_id || null,
      address_head_office: d.headquarters_address || null,
      state: d.state || null,
      district: d.city || null,
      website: d.website || null,
      enrichment_status: "pending",
    };

    const { error: insertErr } = await supabase
      .from("ngos")
      .insert(insertPayload);

    if (insertErr) {
      console.error(`❌ Failed to import "${d.name}":`, insertErr.message);
    } else {
      imported++;
      existingNames.add(nameLower);
      if (d.pan) existingPans.add(d.pan);
    }
  }

  console.log(`\n🎉 Import completed: ${imported} imported, ${skipped} skipped.`);
}

main().catch(err => {
  console.error("💥 Fatal error during import:", err);
  process.exit(1);
});
