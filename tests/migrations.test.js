import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertSchema, migrate } from "../server/migrate.js";
import { createTestDatabase } from "./postgresFixture.js";

describe("PostgreSQL migrations", () => {
  let fixture;
  let db;

  beforeEach(async () => {
    fixture = await createTestDatabase();
    db = fixture.db;
  });

  afterEach(async () => {
    await fixture?.dispose();
  });

  it("applies migrations idempotently and records their checksums", async () => {
    const initial = await db.query(
      "SELECT filename, checksum FROM schema_migrations ORDER BY filename",
    );
    await migrate(db);
    const repeated = await db.query(
      "SELECT filename, checksum FROM schema_migrations ORDER BY filename",
    );

    expect(initial.rows.length).toBeGreaterThan(0);
    expect(repeated.rows).toEqual(initial.rows);
  });

  it("rejects edits to an already applied migration", async () => {
    const migrationDir = await mkdtemp(join(tmpdir(), "pn-migrations-"));
    try {
      await mkdir(migrationDir, { recursive: true });
      const filenames = await readdir(
        new URL("../server/pg-migrations/", import.meta.url),
      );
      for (const filename of filenames) {
        await writeFile(
          join(migrationDir, filename),
          await readFile(
            new URL(`../server/pg-migrations/${filename}`, import.meta.url),
            "utf8",
          ),
        );
      }
      await migrate(db, { migrationDirectory: migrationDir });
      const migration = await readFile(
        join(migrationDir, "001-initial.sql"),
        "utf8",
      );
      await writeFile(
        join(migrationDir, "001-initial.sql"),
        `${migration}\n-- edited after apply\n`,
      );

      await expect(
        migrate(db, { migrationDirectory: migrationDir }),
      ).rejects.toThrow(/checksum/i);
    } finally {
      await rm(migrationDir, { recursive: true, force: true });
    }
  });

  it("checks required schema readiness without applying migrations", async () => {
    await expect(assertSchema(db)).resolves.toBeUndefined();
    const missingTableDb = {
      query: (sql, values) => db.query(sql, values),
    };
    await db.query(
      "INSERT INTO schema_migrations(filename, checksum, applied_at) VALUES($1, $2, $3)",
      ["999-missing.sql", "checksum", Date.now()],
    );
    await expect(assertSchema(db)).rejects.toThrow(
      /missing from the migration directory/i,
    );
    await db.query("DELETE FROM schema_migrations WHERE filename=$1", [
      "999-missing.sql",
    ]);
    await db.query("DROP TABLE round_scores");
    await expect(assertSchema(missingTableDb)).rejects.toThrow(/schema/i);
  });
});

it("adds a later migration without losing existing rows", async () => {
  const f = await createTestDatabase();
  const folder = await mkdtemp(join(tmpdir(), "pn-upgrade-"));
  try {
    await f.db.query("INSERT INTO accounts VALUES($1,$2,$3,$4)", [
      "upgrade",
      "upgrade",
      "Upgrade",
      "encoded",
    ]);
    for (const file of ["001-initial.sql", "002-round-creation-order.sql"])
      await writeFile(
        join(folder, file),
        await readFile(
          new URL("../server/pg-migrations/" + file, import.meta.url),
          "utf8",
        ),
      );
    await writeFile(
      join(folder, "003-upgrade-test.sql"),
      "ALTER TABLE accounts ADD COLUMN upgrade_note TEXT;",
    );
    await migrate(f.db, { migrationDirectory: folder });
    expect(
      (
        await f.db.query(
          "SELECT username,upgrade_note FROM accounts WHERE id=$1",
          ["upgrade"],
        )
      ).rows,
    ).toEqual([{ username: "upgrade", upgrade_note: null }]);
  } finally {
    await f.dispose();
    await rm(folder, { recursive: true, force: true });
  }
});
