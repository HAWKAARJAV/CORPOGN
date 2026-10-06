import fs from "node:fs";
import pg from "pg";

// Load environment variables from .env or .env.local
const env = {};
const envFiles = [".env.local", ".env"];
for (const file of envFiles) {
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        env[match[1].trim()] = match[2].trim();
      }
    }
  }
}

const connectionString = env.DATABASE_URL;
if (!connectionString) {
  console.error("Error: DATABASE_URL not found in .env / .env.local");
  process.exit(1);
}

console.log("Connecting to database...");
const client = new pg.Client({ connectionString });

try {
  await client.connect();
  console.log("Connected successfully. Reading migration file...");
  const migrationSql = fs.readFileSync("supabase-production-migration.sql", "utf8");
  
  console.log("Executing migration SQL...");
  await client.query(migrationSql);
  
  console.log("Migration executed successfully!");
  
  console.log("Refreshing schema cache by executing reload_schema if exists...");
  try {
    await client.query("NOTIFY pgrst, 'reload schema';");
    console.log("Schema cache reload notification sent to PostgREST.");
  } catch (notifyErr) {
    console.log("PostgREST notify failed or not needed:", notifyErr.message);
  }
} catch (err) {
  console.error("Migration execution failed:", err);
  process.exit(1);
} finally {
  await client.end();
}
