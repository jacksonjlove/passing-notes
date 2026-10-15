import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const DEFAULT_MIGRATION_DIRECTORY = fileURLToPath(
  new URL("./pg-migrations/", import.meta.url),
);

async function listMigrations(migrationDirectory) {
  const filenames = (await readdir(migrationDirectory))
    .filter((name) => /^\d{3}-[a-z0-9-]+\.sql$/.test(name))
    .sort();
  const migrations = [];
  for (const filename of filenames) {
    const sql = await readFile(join(migrationDirectory, filename), "utf8");
    migrations.push({
      filename,
      sql,
      checksum: createHash("sha256").update(sql).digest("hex"),
    });
  }
  return migrations;
}

export async function migrate(
  db,
  { migrationDirectory = DEFAULT_MIGRATION_DIRECTORY } = {},
) {
  return db.withAdvisoryLock(async (lockedDb) => {
    await lockedDb.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at BIGINT NOT NULL
      )
    `);
    const migrations = await listMigrations(migrationDirectory);
    const appliedResult = await lockedDb.query(
      "SELECT filename, checksum FROM schema_migrations",
    );
    const applied = new Map(
      appliedResult.rows.map((row) => [row.filename, row.checksum]),
    );
    const unexpected = [...applied.keys()].filter(
      (filename) => !migrations.some((item) => item.filename === filename),
    );
    if (unexpected.length) {
      throw new Error(
        `Applied migrations missing from migration directory: ${unexpected.join(", ")}`,
      );
    }

    for (const migration of migrations) {
      if (applied.has(migration.filename)) {
        if (applied.get(migration.filename) !== migration.checksum) {
          throw new Error(
            `Applied migration checksum mismatch: ${migration.filename}`,
          );
        }
        continue;
      }

      await lockedDb.transaction(async (tx) => {
        await tx.query(migration.sql);
        await tx.query(
          "INSERT INTO schema_migrations(filename, checksum, applied_at) VALUES($1, $2, $3)",
          [migration.filename, migration.checksum, Date.now()],
        );
      });
    }
  });
}

export async function assertSchema(db) {
  try {
    const ledger = await db.query(
      "SELECT filename, checksum FROM schema_migrations",
    );
    const migrations = await listMigrations(DEFAULT_MIGRATION_DIRECTORY);
    const applied = new Map(
      ledger.rows.map((row) => [row.filename, row.checksum]),
    );
    for (const migration of migrations) {
      if (applied.get(migration.filename) !== migration.checksum) {
        throw new Error(
          `Schema migration is missing or changed: ${migration.filename}`,
        );
      }
    }
    const unexpected = [...applied.keys()].filter(
      (filename) =>
        !migrations.some((migration) => migration.filename === filename),
    );
    if (unexpected.length) {
      throw new Error(
        `Schema has migrations missing from the migration directory: ${unexpected.join(", ")}`,
      );
    }
    const required = [
      "accounts",
      "google_identities",
      "oauth_attempts",
      "sessions",
      "groups",
      "memberships",
      "invitations",
      "custom_prompts",
      "prompt_usage",
      "round_participants",
      "round_boards",
      "guesses",
      "rounds",
      "answers",
      "round_scores",
    ];
    const tables = await db.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ANY($1)`,
      [required],
    );
    const found = new Set(tables.rows.map((row) => row.table_name));
    const missing = required.filter((table) => !found.has(table));
    if (missing.length)
      throw new Error(
        `Schema is missing required tables: ${missing.join(", ")}`,
      );
  } catch (error) {
    throw new Error(`PostgreSQL schema is not ready: ${error.message}`, {
      cause: error,
    });
  }
}
