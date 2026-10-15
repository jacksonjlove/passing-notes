import { openPostgres } from "../server/postgres.js";
import { assertSchema, migrate } from "../server/migrate.js";

const connectionString =
  process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL_UNPOOLED or a direct DATABASE_URL is required");
}

const db = openPostgres({ connectionString });
try {
  await migrate(db);
  await assertSchema(db);
} catch {
  console.error(
    "Database migration failed; inspect schema readiness and connection settings",
  );
  process.exitCode = 1;
} finally {
  await db.close();
}
