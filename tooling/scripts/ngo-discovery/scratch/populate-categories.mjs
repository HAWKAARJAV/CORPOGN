/**
 * scratch/populate-categories.mjs
 * Computes and populates categories for all discovered NGOs in the database.
 */

import { supabase } from "../lib/supabase.mjs";
import { categorize } from "../lib/categorizer.mjs";

async function main() {
  console.log("Populating categories for existing discovered NGOs...");

  // 1. Fetch all NGOs
  const { data: ngos, error } = await supabase
    .from("discovered_ngos")
    .select(`
      id,
      name,
      org_type,
      headquarters_address,
      certification_tier,
      transparency_rating,
      give_discover_url
    `);

  if (error) {
    console.error("Error fetching NGOs:", error);
    process.exit(1);
  }

  console.log(`Found ${ngos.length} NGOs. Fetching related data...`);

  // Fetch all reports, projects, and metrics to pass to categorizer
  const [reportsRes, projectsRes, metricsRes] = await Promise.all([
    supabase.from("discovered_ngo_reports").select("ngo_id, title"),
    supabase.from("discovered_ngo_projects").select("ngo_id, name, description"),
    supabase.from("discovered_ngo_metrics").select("ngo_id, metric_name"),
  ]);

  const reportsMap = groupById(reportsRes.data ?? []);
  const projectsMap = groupById(projectsRes.data ?? []);
  const metricsMap = groupById(metricsRes.data ?? []);

  const allCatRows = [];
  const now = new Date().toISOString();

  for (const ngo of ngos) {
    // Reconstruct ngo object structure for categorizer
    const fullNgo = {
      ...ngo,
      reports: reportsMap.get(ngo.id) ?? [],
      programs: projectsMap.get(ngo.id) ?? [],
      metrics: metricsMap.get(ngo.id) ?? [],
      categories: [], // starts empty
    };

    const categories = categorize(fullNgo);
    console.log(`  NGO: ${ngo.name} → ${categories.length} categories`);

    for (const c of categories) {
      allCatRows.push({
        ngo_id: ngo.id,
        category: c.category,
        confidence: c.confidence,
        source: c.source,
        created_at: now,
      });
    }
  }

  if (allCatRows.length === 0) {
    console.log("No categories to insert.");
    return;
  }

  console.log(`Inserting ${allCatRows.length} categories into DB...`);
  const { error: insertErr } = await supabase
    .from("discovered_ngo_categories")
    .upsert(allCatRows, { onConflict: "ngo_id,category", ignoreDuplicates: true });

  if (insertErr) {
    console.error("Error inserting categories:", insertErr);
    process.exit(1);
  }

  console.log("✅ Categories populated successfully!");
}

function groupById(list) {
  const map = new Map();
  for (const item of list) {
    const key = item.ngo_id;
    const current = map.get(key) ?? [];
    current.push(item);
    map.set(key, current);
  }
  return map;
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
