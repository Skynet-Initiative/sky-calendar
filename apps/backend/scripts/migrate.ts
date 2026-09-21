import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";

const MIGRATION_FILE = /^\d{14}_[a-z0-9_]+\.sql$/;
const DEFAULT_MIGRATIONS_DIRECTORY = resolve(
  import.meta.dirname,
  "../migrations",
);

interface Migration {
  readonly checksum: string;
  readonly name: string;
  readonly sql: string;
}

interface AppliedMigration {
  readonly checksum: string;
  readonly name: string;
}

export async function loadMigrations(
  directory = DEFAULT_MIGRATIONS_DIRECTORY,
): Promise<readonly Migration[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const sqlFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name);
  const invalidFile = sqlFiles.find((file) => !MIGRATION_FILE.test(file));
  if (invalidFile) {
    throw new Error(`Invalid migration filename: ${invalidFile}`);
  }
  if (sqlFiles.length === 0) {
    throw new Error(`No migrations found in ${directory}`);
  }

  return Promise.all(
    sqlFiles.sort().map(async (file) => {
      const sql = await readFile(resolve(directory, file), "utf8");
      return {
        checksum: createHash("sha256").update(sql).digest("hex"),
        name: file.slice(0, -4),
        sql,
      };
    }),
  );
}

export async function migrate(
  databaseUrl: string,
  migrationsDirectory = DEFAULT_MIGRATIONS_DIRECTORY,
): Promise<readonly string[]> {
  const migrations = await loadMigrations(migrationsDirectory);
  const migrationNames = new Set(migrations.map(({ name }) => name));
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  const newlyApplied: string[] = [];

  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      ["sky-calendar-schema-migrations"],
    );
    await client.query(`
      CREATE TABLE IF NOT EXISTS sky_calendar_schema_migration (
        name text PRIMARY KEY,
        checksum char(64) NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const result = await client.query<AppliedMigration>(
      "SELECT name, checksum FROM sky_calendar_schema_migration ORDER BY name",
    );
    const missingFile = result.rows.find(
      ({ name }) => !migrationNames.has(name),
    );
    if (missingFile) {
      throw new Error(`Applied migration ${missingFile.name} is missing`);
    }
    const applied = new Map(
      result.rows.map(({ name, checksum }) => [name, checksum.trim()]),
    );

    for (const migration of migrations) {
      const existingChecksum = applied.get(migration.name);
      if (existingChecksum && existingChecksum !== migration.checksum) {
        throw new Error(`Applied migration ${migration.name} has changed`);
      }
      if (existingChecksum) continue;

      await client.query(migration.sql);
      await client.query(
        "INSERT INTO sky_calendar_schema_migration (name, checksum) VALUES ($1, $2)",
        [migration.name, migration.checksum],
      );
      newlyApplied.push(migration.name);
    }

    await client.query("COMMIT");
    return newlyApplied;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (import.meta.main) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  await migrate(databaseUrl);
}
