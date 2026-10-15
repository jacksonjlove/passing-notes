import pg from "pg";

const { Pool } = pg;
const TEST_SCHEMA_PATTERN = /^pn_test_[a-f0-9]{32}$/;

function validateSchema(schema) {
  if (schema !== "public" && !TEST_SCHEMA_PATTERN.test(schema)) {
    throw new Error(
      "PostgreSQL schema must be public or a generated pn_test schema",
    );
  }
  return schema;
}

function normalizeInt8(result) {
  for (const field of result.fields ?? []) {
    if (field.dataTypeID !== 20) continue;
    for (const row of result.rows) {
      if (row[field.name] === null) continue;
      const value = Number(row[field.name]);
      if (!Number.isSafeInteger(value)) {
        throw new RangeError(
          `PostgreSQL int8 value in ${field.name} exceeds JavaScript's safe integer range`,
        );
      }
      row[field.name] = value;
    }
  }
  return result;
}

function executor(client) {
  return {
    async query(sql, values) {
      return normalizeInt8(await client.query(sql, values));
    },
  };
}

export function openPostgres({ connectionString, schema = "public" }) {
  if (!connectionString)
    throw new Error("A PostgreSQL connection string is required");
  validateSchema(schema);

  const connection = new URL(connectionString);
  if (
    !["localhost", "127.0.0.1", "::1", "[::1]"].includes(connection.hostname)
  ) {
    connection.searchParams.set("sslmode", "verify-full");
  }
  const pool = new Pool({
    connectionString: connection.toString(),
    connectionTimeoutMillis: 10000,
  });
  pool.on("error", () => console.error("Database connection interrupted"));
  let closed = false;

  async function configure(client) {
    await client.query(`SET search_path TO "${schema}"`);
  }

  const db = {
    async query(sql, values) {
      if (closed) throw new Error("PostgreSQL pool is closed");
      const client = await pool.connect();
      try {
        if (schema === "public")
          return await executor(client).query(sql, values);
        await client.query("BEGIN");
        try {
          await client.query(`SET LOCAL search_path TO "${schema}"`);
          const result = await executor(client).query(sql, values);
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      } finally {
        client.release();
      }
    },
    async transaction(callback) {
      if (closed) throw new Error("PostgreSQL pool is closed");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        try {
          await client.query(`SET LOCAL search_path TO "${schema}"`);
          const value = await callback(executor(client));
          await client.query("COMMIT");
          return value;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      } finally {
        client.release();
      }
    },
    async withAdvisoryLock(callback) {
      if (connection.hostname.includes("-pooler."))
        throw new Error(
          "Migrations require DATABASE_URL_UNPOOLED (direct connection)",
        );
      if (closed) throw new Error("PostgreSQL pool is closed");
      const client = await pool.connect();
      try {
        await configure(client);
        await client.query("SELECT pg_advisory_lock($1, $2)", [20261014, 212]);
        const lockedDb = {
          query: (sql, values) => executor(client).query(sql, values),
          async transaction(transactionCallback) {
            await client.query("BEGIN");
            try {
              const value = await transactionCallback(executor(client));
              await client.query("COMMIT");
              return value;
            } catch (error) {
              await client.query("ROLLBACK");
              throw error;
            }
          },
        };
        return await callback(lockedDb);
      } finally {
        try {
          await client.query(
            "SELECT pg_advisory_unlock($1, $2)",
            [20261014, 212],
          );
        } finally {
          client.release();
        }
      }
    },
    async close() {
      if (closed) return;
      closed = true;
      await pool.end();
    },
  };

  return db;
}

export { validateSchema };
