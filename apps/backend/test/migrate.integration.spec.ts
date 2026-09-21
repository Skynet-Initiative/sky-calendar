import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { migrate } from "../scripts/migrate.js";

const databaseUrl = process.env.DATABASE_URL;
const integration = describe.runIf(Boolean(databaseUrl));
const migrationsDirectory = resolve(import.meta.dirname, "fixtures/migrations");

function withSearchPath(url: string, schema: string): string {
  const scopedUrl = new URL(url);
  scopedUrl.searchParams.set("options", `-c search_path=${schema}`);
  return scopedUrl.toString();
}

function requireDatabaseUrl(): string {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  return databaseUrl;
}

integration("migration runner", () => {
  it("applies every migration once in order", async () => {
    const schema = `migration_${randomUUID().replaceAll("-", "")}`;
    const connectionString = requireDatabaseUrl();
    const admin = new Pool({ connectionString });
    await admin.query(`CREATE SCHEMA ${schema}`);
    const scopedUrl = withSearchPath(connectionString, schema);

    try {
      await expect(migrate(scopedUrl, migrationsDirectory)).resolves.toEqual([
        "20260921000000_create_probe",
        "20260921000001_insert_probe",
      ]);
      await expect(migrate(scopedUrl, migrationsDirectory)).resolves.toEqual(
        [],
      );

      const result = await admin.query<{ step: number }>(
        `SELECT step FROM ${schema}.migration_probe ORDER BY step`,
      );
      expect(result.rows).toEqual([{ step: 1 }, { step: 2 }]);
      const journal = await admin.query<{ name: string }>(
        `SELECT name FROM ${schema}.sky_calendar_schema_migration ORDER BY name`,
      );
      expect(journal.rows.map(({ name }) => name)).toEqual([
        "20260921000000_create_probe",
        "20260921000001_insert_probe",
      ]);
    } finally {
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    }
  });

  it("serializes concurrent runners", async () => {
    const schema = `migration_${randomUUID().replaceAll("-", "")}`;
    const connectionString = requireDatabaseUrl();
    const admin = new Pool({ connectionString });
    await admin.query(`CREATE SCHEMA ${schema}`);
    const scopedUrl = withSearchPath(connectionString, schema);

    try {
      const results = await Promise.all([
        migrate(scopedUrl, migrationsDirectory),
        migrate(scopedUrl, migrationsDirectory),
      ]);
      expect(results.map((names) => names.length).sort()).toEqual([0, 2]);
    } finally {
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    }
  });
});
