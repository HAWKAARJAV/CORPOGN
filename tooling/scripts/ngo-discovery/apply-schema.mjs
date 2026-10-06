/**
 * apply-schema.mjs
 * Applies ngo-discovery-schema.sql to Supabase via pg (already a devDependency).
 * Uses Supabase's direct DB connection URL — if that fails due to password,
 * falls back to the REST /rest/v1/rpc exec approach via service role.
 * Run: node scripts/ngo-discovery/apply-schema.mjs
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read .env.local
function readEnv() {
  try {
    const raw = readFileSync(join(__dirname, "../../../.env.local"), "utf8");
    const env = {};
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
    return env;
  } catch {
    return {};
  }
}

const env = readEnv();

// Try the session-mode URL (port 5432 requires DB password reset on Supabase dashboard)
// The transaction-mode pooler URL (port 6543) sometimes accepts the service role key
const rawUrl = env["DATABASE_URL"] || process.env.DATABASE_URL || "";
// Supabase DB direct URL — replace password with service role key for pooler auth
const SUPABASE_URL = env["NEXT_PUBLIC_SUPABASE_URL"] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env["SUPABASE_SERVICE_ROLE_KEY"] || process.env.SUPABASE_SERVICE_ROLE_KEY;

const sqlPath = join(__dirname, "ngo-discovery-schema.sql");
const sqlFull = readFileSync(sqlPath, "utf8");

// Split SQL into individual statements (split on ; followed by newline or EOF)
// We handle $$ blocks (PLpgSQL) carefully — don't split inside $$ ... $$ bodies.
function splitStatements(sql) {
  const stmts = [];
  let current = "";
  let inDollarQuote = false;
  let dollarTag = "";
  const lines = sql.split("\n");

  for (const line of lines) {
    // Detect $$ or $tag$ openings/closings
    const dollarMatches = [...line.matchAll(/\$(\w*)\$/g)];
    for (const m of dollarMatches) {
      const tag = m[0];
      if (!inDollarQuote) {
        inDollarQuote = true;
        dollarTag = tag;
      } else if (tag === dollarTag) {
        inDollarQuote = false;
        dollarTag = "";
      }
    }

    current += line + "\n";

    if (!inDollarQuote && line.trimEnd().endsWith(";")) {
      const stmt = current.trim();
      if (stmt && stmt !== ";") stmts.push(stmt);
      current = "";
    }
  }

  if (current.trim()) stmts.push(current.trim());
  return stmts.filter((s) => s.length > 0);
}

// Apply via pg direct connection
async function applyViaPg(connectionString) {
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    console.log("  ↳ Executing full SQL via pg...");
    await client.query(sqlFull);
    console.log("✅  Schema applied via pg.");
    return true;
  } finally {
    await client.end();
  }
}

// Apply via Supabase REST (exec_sql stored procedure or raw HTTP)
// Requires exec_sql function to exist — we use pg_net or direct HTTP
async function applyViaRest() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error("SUPABASE_URL or SERVICE_KEY missing");
  }

  const stmts = splitStatements(sqlFull);
  console.log(`  ↳ Applying ${stmts.length} SQL statements via Supabase REST...`);

  let applied = 0;
  for (const stmt of stmts) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify({ query: stmt }),
    });

    if (!res.ok) {
      const body = await res.text();
      // Ignore "already exists" errors — schema is idempotent
      if (body.includes("already exists")) {
        applied++;
        continue;
      }
      // Ignore policy already exists
      if (body.includes("duplicate_object")) {
        applied++;
        continue;
      }
      console.warn(`  ⚠  Statement failed (${res.status}): ${body.slice(0, 200)}`);
      console.warn(`     SQL: ${stmt.slice(0, 100)}...`);
    } else {
      applied++;
    }
  }

  console.log(`✅  ${applied}/${stmts.length} statements applied via REST.`);
}

async function main() {
  console.log("\n🗄   Applying ngo-discovery-schema.sql to Supabase...");

  // Try pg direct connection first (session mode URL)
  const pgUrl = rawUrl || `postgresql://postgres.${SUPABASE_URL?.split(".")[1]}.supabase.co:5432/postgres`;

  try {
    await applyViaPg(pgUrl);
  } catch (pgErr) {
    console.warn(`  ⚠  pg direct connection failed: ${pgErr.message}`);
    console.log("  → Falling back to Supabase REST API...");
    try {
      await applyViaRest();
    } catch (restErr) {
      console.error("❌  Both pg and REST approaches failed.");
      console.error(`   pg error: ${pgErr.message}`);
      console.error(`   REST error: ${restErr.message}`);
      console.error("");
      console.error("💡  MANUAL OPTION: Copy and run scripts/ngo-discovery/ngo-discovery-schema.sql");
      console.error("    in your Supabase Dashboard → SQL Editor.");
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error("❌  Unexpected error:", err.message);
  process.exit(1);
});
