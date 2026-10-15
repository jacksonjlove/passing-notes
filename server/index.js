import { openPostgres } from "./db.js";
import { createApp } from "./app.js";
import { readConfig, startRuntime } from "./runtime.js";
try {
  const config = readConfig();
  const db = openPostgres({ connectionString: config.connectionString });
  const app = createApp({
    db,
    ...config,
    requestLogger: (record) => console.log(JSON.stringify(record)),
  });
  const runtime = await startRuntime({
    db,
    app,
    host: config.host,
    port: config.port,
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
