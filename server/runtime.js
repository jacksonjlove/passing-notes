import { createServer } from "node:http";
import { assertSchema } from "./migrate.js";
import { reconcileAll } from "./rounds.js";
export function readConfig(env = process.env) {
  const production = env.NODE_ENV === "production";
  if (!env.DATABASE_URL) throw Error("DATABASE_URL is required");
  const url = new URL(env.DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw Error("Use a PostgreSQL connection");
  const port = Number(env.PORT || 3002);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw Error("PORT must be a valid port");
  const origin = env.APP_ORIGIN || "http://localhost:5174";
  const parsed = new URL(origin);
  if (parsed.origin !== origin)
    throw Error("APP_ORIGIN must be an exact origin");
  const username = env.BASIC_AUTH_USERNAME,
    password = env.BASIC_AUTH_PASSWORD;
  if (username?.includes(":"))
    throw Error("Shared username cannot contain a colon");
  if (Boolean(username) !== Boolean(password))
    throw Error("Set both shared access credentials");
  if (production) {
    if (
      !username ||
      !password ||
      env.SECURE_COOKIES !== "1" ||
      !/^https:/.test(origin)
    )
      throw Error(
        "Production requires HTTPS, secure cookies and shared access credentials",
      );
    if (!/^[a-f0-9]{40}$/i.test(env.RENDER_GIT_COMMIT || ""))
      throw Error("RENDER_GIT_COMMIT must identify the deployed commit");
    if (env.LOCAL_TEST_CONTROLS === "1")
      throw Error("Local test controls cannot run in production");
    url.searchParams.set("sslmode", "verify-full");
  }
  return {
    connectionString: url.toString(),
    port,
    host: production ? "0.0.0.0" : "127.0.0.1",
    origin,
    secure: env.SECURE_COOKIES === "1",
    devControls: !production && env.LOCAL_TEST_CONTROLS === "1",
    basicAuthCredentials: username && password ? { username, password } : null,
    commit: env.RENDER_GIT_COMMIT || "local",
  };
}
export async function startRuntime({
  db,
  app,
  host = "127.0.0.1",
  port = 3002,
  sweepMs = 30000,
  reconcile = reconcileAll,
  schemaReady = assertSchema,
  logger = (...args) => console.error(...args),
  shutdownMs = 10000,
}) {
  const server = createServer(app);
  let timer,
    inFlight = null,
    stopping = false,
    stopPromise;
  try {
    await schemaReady(db);
    await reconcile(db, Date.now);
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => {
        server.removeListener("error", reject);
        resolve();
      });
    });
  } catch (error) {
    await db.close();
    throw error;
  }
  const sweep = () => {
    if (stopping || inFlight) return;
    inFlight = Promise.resolve()
      .then(() => reconcile(db, Date.now))
      .catch(() => logger("Round reconciliation failed"))
      .finally(() => {
        inFlight = null;
      });
  };
  timer = setInterval(sweep, sweepMs);
  timer.unref();
  const stop = () => {
    if (stopPromise) return stopPromise;
    stopping = true;
    clearInterval(timer);
    stopPromise = (async () => {
      let deadline;
      const cleanup = (async () => {
        await new Promise((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
        await inFlight;
        await db.close();
      })();
      try {
        await Promise.race([
          cleanup,
          new Promise((_, reject) => {
            deadline = setTimeout(() => {
              server.closeAllConnections();
              reject(Error("Shutdown timed out"));
            }, shutdownMs);
            deadline.unref();
          }),
        ]);
      } finally {
        clearTimeout(deadline);
      }
    })();
    return stopPromise;
  };
  return { server, stop };
}
