/**
 * scripts/ngo-discovery/scrape-darpan.mjs
 *
 * CorpoGN — NGO Darpan Semi-Autonomous Scraper
 *
 * Usage:
 *   node scripts/ngo-discovery/scrape-darpan.mjs
 *
 * Workflow:
 *   1. Fetch all discovered NGOs in the database where ngo_darpan_id is null.
 *   2. Launch Chromium in headful mode (visible browser window).
 *   3. Navigate to NGO Darpan search page.
 *   4. For each NGO:
 *      a. Type the NGO Name into the "Search by NPO Name" input.
 *      b. Wait for the user to solve the Captcha and press Search in the browser.
 *      c. Allow the user to press ENTER in the terminal once the search results are ready.
 *      d. Read the search results table. If multiple rows appear, let the user choose which row to scrape (or skip/manually input).
 *      e. Click the link to open the details modal.
 *      f. Scrape the modal text, parse key fields (Darpan ID, Address, Registration No, Sectors), close the modal.
 *      g. Update the database record with the new info.
 */

import { chromium } from "@playwright/test";
import { supabase } from "./lib/supabase.mjs";
import readline from "readline";

// Helper to wait for terminal user input
function waitForKeypress(promptMessage = "Press ENTER to continue...") {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(promptMessage, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Map NGO Darpan state strings to our expected state names
const STATE_MAP = {
  "DELHI": "Delhi",
  "HARYANA": "Haryana",
  "UTTAR PRADESH": "Uttar Pradesh",
};

async function main() {
  console.log("\n==================================================");
  console.log("🚀  CorpoGN NGO Darpan Semi-Autonomous Scraper  🚀");
  console.log("==================================================\n");

  // 1. Fetch NGOs with NULL Darpan IDs
  console.log("Fetching NGOs with missing Darpan IDs from database...");
  const { data: ngos, error } = await supabase
    .from("discovered_ngos")
    .select("id, name, registration_number, state, city")
    .is("ngo_darpan_id", null)
    .order("name", { ascending: true });

  if (error) {
    console.error("❌  Failed to fetch NGOs from database:", error.message);
    process.exit(1);
  }

  if (!ngos || ngos.length === 0) {
    console.log("✅  No discovered NGOs with missing Darpan IDs found! All caught up.");
    process.exit(0);
  }

  console.log(`Found ${ngos.length} NGOs needing Darpan ID enrichment.\n`);

  // 2. Launch visible browser
  console.log("Launching visible Chromium browser...");
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("Navigating to NGO Darpan search page...");
  await page.goto("https://ngodarpan.gov.in/#/search-ngo");
  
  // Wait for page load
  console.log("Waiting for page elements to mount...");
  await page.waitForSelector("#username", { timeout: 15000 });
  console.log("Ready!");

  let successCount = 0;
  let skipCount = 0;

  // 3. Loop through NGOs
  for (let idx = 0; idx < ngos.length; idx++) {
    const ngo = ngos[idx];
    console.log("\n" + "═".repeat(60));
    console.log(`[NGO ${idx + 1}/${ngos.length}] Processing: "${ngo.name}"`);
    console.log(`City: ${ngo.city ?? "—"} | State: ${ngo.state ?? "—"} | Reg No: ${ngo.registration_number ?? "—"}`);
    console.log("═".repeat(60));

    // Clear and fill the search inputs
    try {
      // Clear NPO Name input
      await page.fill("#username", "");
      await page.fill("#username", ngo.name);

      // Clear uniqueId input just in case
      await page.fill("#uniqueId", "");

      // Focus the captcha field to ready it for the user
      const captchaInput = page.locator("#captchaInput");
      if (await captchaInput.isVisible()) {
        await captchaInput.focus();
      }

      console.log(`\n👉 Action Required in Browser:`);
      console.log(`1. Review the filled name: "${ngo.name}" (change it if necessary).`);
      console.log(`2. Solve the Captcha in the browser.`);
      console.log(`3. Click 'Search' (or press Enter) in the browser.`);
      console.log(`4. Wait for the results table or the 'No Record Found' message to load.`);
      console.log(`5. Press ENTER here in the terminal once the page has updated.`);
      
      const userResponse = await waitForKeypress("\nPress ENTER when search results load, type 's' to skip, or enter a manual Darpan ID: ");

      if (userResponse.toLowerCase() === 's') {
        console.log(`⏭️  Skipping "${ngo.name}"...`);
        skipCount++;
        continue;
      }

      // Check if user entered a manual Darpan ID
      if (userResponse && userResponse.length > 5 && userResponse.includes("/")) {
        console.log(`✍️  Manually entering Darpan ID: "${userResponse}"`);
        const { error: updateErr } = await supabase
          .from("discovered_ngos")
          .update({ ngo_darpan_id: userResponse })
          .eq("id", ngo.id);

        if (updateErr) {
          console.error(`❌  Failed to save manual ID: ${updateErr.message}`);
        } else {
          console.log(`✅  Saved manual Darpan ID for "${ngo.name}".`);
          successCount++;
        }
        continue;
      }

      // Let's analyze the search results table
      // Search results usually populate in a table with rows inside .p-datatable-tbody
      const rows = page.locator(".p-datatable-tbody tr, table tbody tr");
      const rowCount = await rows.count();

      if (rowCount === 0) {
        console.log("❓ No search results visible in the table. Retry or skip?");
        const nextAction = await waitForKeypress("Type 's' to skip, 'm <id>' to manually set ID, or press ENTER to retry scraping the current screen: ");
        if (nextAction.toLowerCase() === 's') {
          console.log(`⏭️  Skipping "${ngo.name}"...`);
          skipCount++;
          continue;
        } else if (nextAction.toLowerCase().startsWith("m ")) {
          const manualId = nextAction.substring(2).trim();
          console.log(`✍️  Manually entering Darpan ID: "${manualId}"`);
          await supabase.from("discovered_ngos").update({ ngo_darpan_id: manualId }).eq("id", ngo.id);
          successCount++;
          continue;
        }
        idx--; // decrement index to retry the current NGO
        continue;
      }

      // Display results found on screen
      console.log(`\nFound ${rowCount} rows on Darpan search page:`);
      const rowMatches = [];
      for (let r = 0; r < rowCount; r++) {
        const currentRow = rows.nth(r);
        const cells = currentRow.locator("td");
        const cellCount = await cells.count();
        if (cellCount < 2) continue;

        // Extract raw cell values
        const cellTexts = [];
        for (let c = 0; c < cellCount; c++) {
          const txt = await cells.nth(c).innerText().catch(() => "");
          cellTexts.push(txt.trim());
        }
        
        // Log raw cells for debugging
        console.log(` [Row ${r + 1} Columns]:`, JSON.stringify(cellTexts));

        const serialNum = cellTexts[0] || "";
        const nameText = cellTexts[1] || "";
        
        // Extract Darpan ID using pattern DL/YYYY/NNNNNNN
        const rawIdField = cellTexts[2] || "";
        const idRegex = /[A-Z]{2}\/\d{4}\/\d{5,8}/i;
        const idMatch = rawIdField.match(idRegex);
        const uniqueId = idMatch ? idMatch[0] : rawIdField.split("\n")[0].trim();

        // Safe index accesses
        let stateText = "";
        let districtText = "";
        let addressText = "";

        if (cellCount >= 6) {
          stateText = cellTexts[3] || "";
          districtText = cellTexts[4] || "";
          addressText = cellTexts[5] || "";
        } else {
          // Fallbacks for responsive tables where data is stacked
          const lines = rawIdField.split("\n").map(l => l.trim()).filter(Boolean);
          if (lines.length > 1) {
            districtText = lines[1];
          }
          addressText = cellTexts[3] || "";
          stateText = cellTexts[3] || "";
        }

        rowMatches.push({ index: r, name: nameText, uniqueId, state: stateText, district: districtText, address: addressText });
        console.log(`  -> Match parsed: Name: "${nameText}" | ID: ${uniqueId} | State: ${stateText} | Addr: ${addressText.substring(0, 40)}...`);
      }

      if (rowMatches.length === 0) {
        console.log("❌ Could not parse any rows from the search results table.");
        const nextAction = await waitForKeypress("Type 's' to skip, or ENTER to retry: ");
        if (nextAction.toLowerCase() === 's') {
          skipCount++;
          continue;
        }
        idx--;
        continue;
      }

      // Ask user to select the correct row
      let selectedRowIndex = 0;
      if (rowMatches.length > 1) {
        const choice = await waitForKeypress(`Select correct NGO row [1-${rowMatches.length}] (default is 1), 's' to skip, or 'm <id>' to manually enter ID: `);
        if (choice.toLowerCase() === 's') {
          console.log(`⏭️  Skipping "${ngo.name}"...`);
          skipCount++;
          continue;
        } else if (choice.toLowerCase().startsWith("m ")) {
          const manualId = choice.substring(2).trim();
          await supabase.from("discovered_ngos").update({ ngo_darpan_id: manualId }).eq("id", ngo.id);
          successCount++;
          continue;
        }
        const parsedChoice = parseInt(choice, 10);
        if (!isNaN(parsedChoice) && parsedChoice >= 1 && parsedChoice <= rowMatches.length) {
          selectedRowIndex = parsedChoice - 1;
        }
      }

      const match = rowMatches[selectedRowIndex];
      console.log(`\nScraping details for selected NGO: "${match.name}" (ID: ${match.uniqueId})`);

      // Click the row directly to open the details modal/popup
      const currentRow = rows.nth(match.index);
      const rowLink = currentRow.locator("a, button, [role='button']").first();

      let detailsPage = null;
      const popupPromise = context.waitForEvent("page", { timeout: 3000 }).catch(() => null);

      console.log("Clicking row to open details...");
      await currentRow.click({ force: true, timeout: 4000 }).catch(async (e) => {
        console.log(`  Row click failed (${e.message}), trying inner link click...`);
        if (await rowLink.count() > 0) {
          await rowLink.click({ force: true, timeout: 4000 }).catch(async (err) => {
            console.log(`  Inner link click failed (${err.message}), trying cell click...`);
            await currentRow.locator("td").nth(1).click({ force: true, timeout: 4000 }).catch(() => null);
          });
        } else {
          await currentRow.locator("td").nth(1).click({ force: true, timeout: 4000 }).catch(() => null);
        }
      });

      // Wait to see if a new window popup page opened
      detailsPage = await popupPromise;

      let dialogText = "";
      let isPopup = false;
      const dialog = page.locator(".p-dialog, .modal, [role='dialog']").first();

      if (detailsPage) {
        console.log("🔗 Opened a new popup window for details. Scraping...");
        isPopup = true;
        await detailsPage.waitForLoadState("domcontentloaded").catch(() => null);
        await detailsPage.waitForTimeout(1500); // Safety buffer for content load
        dialogText = await detailsPage.innerText("body").catch(() => "");
      } else {
        // Fallback: Check if modal appeared on the main page
        console.log("Waiting for details modal/dialog to appear on current page...");
        await dialog.waitFor({ state: "visible", timeout: 5000 }).catch(() => null);
        if (await dialog.isVisible()) {
          dialogText = await dialog.innerText().catch(() => "");
        }
      }

      let scrapedData = {};

      if (dialogText && dialogText.length > 20) {
        console.log("--- DETAILS TEXT SCRAPED ---");
        console.log(dialogText.substring(0, 600) + "...\n");

        // Parse key details using regex patterns
        const regNoMatch = dialogText.match(/Registration No(?:\s+|\s*:\s*)([^\n:]+)/i);
        const addressMatch = dialogText.match(/Registered Address(?:\s+|\s*:\s*)([^\n:]+)/i);
        const typeMatch = dialogText.match(/NGO Type(?:\s+|\s*:\s*)([^\n:]+)/i);
        const foundedMatch = dialogText.match(/Date of Registration(?:\s+|\s*:\s*)([^\n:]+)/i);
        const sectorMatch = dialogText.match(/Sectors\/Key Issues(?:\s+|\s*:\s*)([^\n:]+)/i);

        scrapedData = {
          ngo_darpan_id: match.uniqueId,
          legal_name: match.name,
          headquarters_address: addressMatch ? addressMatch[1].trim().replace(/^:\s*/, "") : match.address,
          registration_number: regNoMatch ? regNoMatch[1].trim().replace(/^:\s*/, "") : (ngo.registration_number ?? null),
          org_type: typeMatch ? typeMatch[1].trim().replace(/^:\s*/, "") : null,
          state: STATE_MAP[match.state.toUpperCase()] ?? ngo.state ?? match.state,
          city: match.district ?? ngo.city,
        };

        // Parse sectors if available to enrich categories
        if (sectorMatch) {
          const sectorStr = sectorMatch[1].trim().replace(/^:\s*/, "");
          const rawSectors = sectorStr.split(",").map(s => s.trim()).filter(Boolean);
          if (rawSectors.length > 0) {
            console.log("Detected sectors:", rawSectors.join(", "));
            scrapedData._categories = rawSectors;
          }
        }

        // Close details source
        if (isPopup && detailsPage) {
          console.log("Closing details popup window...");
          await detailsPage.close().catch(() => null);
        } else if (await dialog.isVisible()) {
          console.log("Closing details modal...");
          const closeBtn = dialog.locator(".p-dialog-header-close, button:has-text('Close'), [aria-label='Close'], .close").first();
          if (await closeBtn.isVisible()) {
            await closeBtn.click().catch(() => null);
          } else {
            await page.keyboard.press("Escape");
          }
          await dialog.waitFor({ state: "detached", timeout: 3000 }).catch(() => null);
        }
      } else {
        console.log("⚠️  Could not scrape details from modal or popup. Saving info from the summary row...");
        scrapedData = {
          ngo_darpan_id: match.uniqueId,
          legal_name: match.name,
          headquarters_address: match.address,
          state: STATE_MAP[match.state.toUpperCase()] ?? ngo.state ?? match.state,
          city: match.district ?? ngo.city,
        };
      }

      // 4. Update the Supabase record
      console.log(`Saving enriched data for "${ngo.name}" to database...`);
      const { error: updateErr } = await supabase
        .from("discovered_ngos")
        .update({
          ngo_darpan_id: scrapedData.ngo_darpan_id,
          legal_name: scrapedData.legal_name || ngo.name,
          registration_number: scrapedData.registration_number || ngo.registration_number,
          org_type: scrapedData.org_type || null,
          headquarters_address: scrapedData.headquarters_address || null,
          state: scrapedData.state || ngo.state,
          city: scrapedData.city || ngo.city,
        })
        .eq("id", ngo.id);

      if (updateErr) {
        throw new Error(`Failed to update discovered_ngos row: ${updateErr.message}`);
      }

      // Add categories if scraped
      if (scrapedData._categories && scrapedData._categories.length > 0) {
        const catRows = scrapedData._categories.map((cat) => ({
          ngo_id: ngo.id,
          category: cat,
          confidence: "high",
          source: "darpan",
        }));
        await supabase.from("discovered_ngo_categories").upsert(catRows, {
          onConflict: "ngo_id,category",
          ignoreDuplicates: true,
        });
      }

      console.log(`✅  Successfully enriched "${ngo.name}"!`);
      successCount++;

    } catch (err) {
      console.error(`❌  Error processing "${ngo.name}":`, err.message);
      const action = await waitForKeypress("Press ENTER to retry this NGO, or type 's' to skip and continue: ");
      if (action.toLowerCase() !== 's') {
        idx--; // decrement index to retry
      } else {
        skipCount++;
      }
    }
  }

  // Cleanup
  console.log("\nClosing browser...");
  await browser.close();

  console.log("\n==================================================");
  console.log("🏁  Scraping Session Finished!  🏁");
  console.log(`    Successfully Enriched : ${successCount}`);
  console.log(`    Skipped / Deferred    : ${skipCount}`);
  console.log("==================================================\n");
}

main().catch((err) => {
  console.error("❌ Fatal scraper crash:", err.message);
  process.exit(1);
});
