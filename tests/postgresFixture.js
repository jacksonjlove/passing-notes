import { randomUUID } from "node:crypto";
import { openPostgres } from "../server/postgres.js";
import { migrate } from "../server/migrate.js";

function testConnectionString() {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    throw new Error("TEST_DATABASE_URL must point to passing_notes_test");
  }

  let databaseName;
  try {
    databaseName = decodeURIComponent(
      new URL(connectionString).pathname.slice(1),
    );
  } catch {
    throw new Error(
      "TEST_DATABASE_URL must be a valid PostgreSQL connection string",
    );
  }

  if (databaseName !== "passing_notes_test") {
    throw new Error("TEST_DATABASE_URL must point to passing_notes_test");
  }
  return connectionString;
}

export async function createTestDatabase({
  migrationDirectory,
  schema = `pn_test_${randomUUID().replaceAll("-", "")}`,
} = {}) {
  const connectionString = testConnectionString();
  let db = openPostgres({ connectionString, schema });
  let schemaCreated = false;
  let disposed = false;

  try {
    await db.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    await migrate(db, migrationDirectory ? { migrationDirectory } : undefined);
  } catch (error) {
    try {
      await db.close();
    } catch (cleanupError) {
      error.cleanupErrors = [...(error.cleanupErrors ?? []), cleanupError];
    }
    if (schemaCreated) {
      const admin = openPostgres({ connectionString });
      try {
        await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } catch (cleanupError) {
        error.cleanupErrors = [...(error.cleanupErrors ?? []), cleanupError];
      } finally {
        try {
          await admin.close();
        } catch (cleanupError) {
          error.cleanupErrors = [...(error.cleanupErrors ?? []), cleanupError];
        }
      }
    }
    throw error;
  }

  return {
    get db() {
      return db;
    },
    async reconnect() {
      if (disposed) throw new Error("Test database is disposed");
      await db.close();
      db = openPostgres({ connectionString, schema });
      return db;
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      await db.close();
      const admin = openPostgres({ connectionString });
      try {
        await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally {
        await admin.close();
      }
    },
  };
}

export { testConnectionString };
