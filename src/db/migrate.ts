import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPool } from "./pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "../../migrations");

export async function runMigrations(): Promise<void> {
  const pool = getPool();

  // Ensure migrations table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // Get already-applied migrations
  const { rows: applied } = await pool.query<{ name: string }>(
    "SELECT name FROM migrations ORDER BY name"
  );
  const appliedSet = new Set(applied.map((r) => r.name));

  // Read migration files
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (appliedSet.has(file)) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
    console.log(`Applying migration: ${file}`);

    await pool.query("BEGIN");
    try {
      await pool.query(sql);
      await pool.query("INSERT INTO migrations (name) VALUES ($1)", [file]);
      await pool.query("COMMIT");
      console.log(`  ✓ ${file}`);
    } catch (err) {
      await pool.query("ROLLBACK");
      throw new Error(`Migration ${file} failed: ${err}`);
    }
  }

  console.log("All migrations applied.");
}

// Run directly: npx tsx src/db/migrate.ts
const isDirectRun = process.argv[1]?.endsWith("migrate.ts") ||
                    process.argv[1]?.endsWith("migrate.js");
if (isDirectRun) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
