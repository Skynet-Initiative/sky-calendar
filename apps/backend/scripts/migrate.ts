import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { Pool } from "pg";

/**
 * Applies every `migrations/*.sql` file in name order, once. A file that was
 * already applied must not have changed: the migration table remembers each
 * file's checksum, and a drift stops the start-up instead of silently running
 * a different schema than the one recorded.
 */
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const migrationsDir = resolve(import.meta.dirname, "../migrations");
const migrationFiles = (await readdir(migrationsDir))
  .filter((name) => name.endsWith(".sql"))
  .sort();

const pool = new Pool({ connectionString: databaseUrl });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query(`
    CREATE TABLE IF NOT EXISTS sky_calendar_schema_migration (
      name text PRIMARY KEY,
      checksum char(64) NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  for (const file of migrationFiles) {
    const migrationName = file.slice(0, -".sql".length);
    const migration = await readFile(resolve(migrationsDir, file), "utf8");
    const checksum = createHash("sha256").update(migration).digest("hex");
    const applied = await client.query<{ checksum: string }>(
      "SELECT checksum FROM sky_calendar_schema_migration WHERE name = $1",
      [migrationName],
    );
    const existingChecksum = applied.rows[0]?.checksum;
    if (existingChecksum && existingChecksum !== checksum) {
      throw new Error(`Applied migration ${migrationName} has changed`);
    }
    if (existingChecksum) continue;
    await client.query(migration);
    await client.query(
      "INSERT INTO sky_calendar_schema_migration (name, checksum) VALUES ($1, $2)",
      [migrationName, checksum],
    );
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
