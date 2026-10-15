import { reconcileAll } from "./rounds.js";
import { googleProvider } from "./googleProvider.js";
import { openPostgres } from "./db.js";
import { createApp } from "./app.js";
import { readConfig, startRuntime } from "./runtime.js";
try {
  const config = readConfig();
  const db = openPostgres({ connectionString: config.connectionString });
  const app = createApp({
    db,
    ...config,
    google: config.googleConfig ? googleProvider(config.googleConfig) : null,
    requestLogger: (record) => console.log(JSON.stringify(record)),
  });
  const runtime = await startRuntime({
    db,
    app,
    host: config.host,
    port: config.port,
    reconcile: async (database, clock) => {
      await reconcileAll(database, clock);
      await database.query(
        "DELETE FROM oauth_attempts WHERE state_hash IN (SELECT state_hash FROM oauth_attempts WHERE expires_at<$1 LIMIT 100)",
        [clock()],
      );
    },
  });
  console.log(`Passing Notes API listening on ${config.port}`);
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => {
      runtime
        .stop()
        .then(() => process.exit(0))
        .catch(() => {
          console.error("Shutdown failed");
          process.exit(1);
        });
    });
} catch {
  console.error(
    "Startup failed: check configuration, database access and migrations",
  );
  process.exitCode = 1;
}
