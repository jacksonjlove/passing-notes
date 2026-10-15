import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openPostgres } from "../server/postgres.js";
import { createTestDatabase } from "./postgresFixture.js";

describe("PostgreSQL storage", () => {
  let fixture;
  let db;

  beforeEach(async () => {
    fixture = await createTestDatabase();
    db = fixture.db;
  });

  afterEach(async () => {
    await fixture?.dispose();
  });

  it("rolls back all statements in a failed transaction", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.query("INSERT INTO accounts VALUES($1,$2,$3,$4)", [
          "rollback-id",
          "rollback-user",
          "Rollback",
          "encoded",
        ]);
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");

    expect(
      (await db.query("SELECT id FROM accounts WHERE id=$1", ["rollback-id"]))
        .rows,
    ).toEqual([]);
  });

  it("enforces foreign keys", async () => {
    await expect(
      db.query(
        "INSERT INTO sessions(token_hash, account_id, expires_at) VALUES($1,$2,$3)",
        ["orphan-session", "missing-account", 100],
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("normalizes safe int8 values and rejects values JavaScript cannot represent exactly", async () => {
    expect((await db.query("SELECT 123::BIGINT AS value")).rows[0].value).toBe(
      123,
    );
    await expect(
      db.query("SELECT '9007199254740992'::BIGINT AS value"),
    ).rejects.toThrow(/safe integer range/);
  });

  it("accepts only the public schema or a generated fixture schema", () => {
    expect(() =>
      openPostgres({
        connectionString: "postgres://localhost/test",
        schema: "public; DROP SCHEMA public",
      }),
    ).toThrow(/schema/i);
  });

  it("preserves schema data after reconnecting the pool", async () => {
    await db.query("INSERT INTO accounts VALUES($1,$2,$3,$4)", [
      "persist-id",
      "persist-user",
      "Persist",
      "encoded",
    ]);
    db = await fixture.reconnect();

    expect(
      (await db.query("SELECT id FROM accounts WHERE id=$1", ["persist-id"]))
        .rows,
    ).toEqual([{ id: "persist-id" }]);
  });

  it("rejects fixture URLs that do not name the designated test database", async () => {
    const oldUrl = process.env.TEST_DATABASE_URL;
    process.env.TEST_DATABASE_URL = "postgres://localhost/production";
    try {
      await expect(createTestDatabase()).rejects.toThrow(
        "TEST_DATABASE_URL must point to passing_notes_test",
      );
    } finally {
      if (oldUrl === undefined) delete process.env.TEST_DATABASE_URL;
      else process.env.TEST_DATABASE_URL = oldUrl;
    }
  });

  it("cleans up the generated schema and pool when fixture migration setup fails", async () => {
    const schema = `pn_test_${randomUUID().replaceAll("-", "")}`;
    const migrationDirectory = await mkdtemp(
      join(tmpdir(), "pn-broken-migration-"),
    );
    try {
      await writeFile(
        join(migrationDirectory, "001-broken.sql"),
        "CREATE TABLE partial_setup (id TEXT); SELECT 1 / 0;",
      );

      await expect(
        createTestDatabase({ schema, migrationDirectory }),
      ).rejects.toThrow();
      expect(
        (
          await db.query("SELECT nspname FROM pg_namespace WHERE nspname=$1", [
            schema,
          ])
        ).rows,
      ).toEqual([]);
    } finally {
      await rm(migrationDirectory, { recursive: true, force: true });
    }
  });
});

it("refuses session-based migrations through a Neon transaction pooler", async () => {
  const db = openPostgres({
    connectionString:
      "postgresql://example@ep-test-pooler.us-east-2.aws.neon.tech/neondb",
  });
  try {
    await expect(db.withAdvisoryLock(async () => {})).rejects.toThrow(
      "DATABASE_URL_UNPOOLED",
    );
  } finally {
    await db.close();
  }
});
