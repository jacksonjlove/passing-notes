import { expect, it, vi } from "vitest";
import express from "express";
import { readConfig, startRuntime } from "../server/runtime.js";
it("requires production credentials, exact HTTPS origin and secure cookies", () => {
  const env = {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://test@db.example/db?sslmode=require",
    APP_ORIGIN: "https://notes.example",
    SECURE_COOKIES: "1",
    BASIC_AUTH_USERNAME: "test",
    BASIC_AUTH_PASSWORD: "test-only",
    RENDER_GIT_COMMIT: "a".repeat(40),
  };
  expect(readConfig(env).connectionString).toContain("sslmode=verify-full");
  expect(readConfig(env).host).toBe("0.0.0.0");
  for (const key of [
    "DATABASE_URL",
    "APP_ORIGIN",
    "BASIC_AUTH_PASSWORD",
    "RENDER_GIT_COMMIT",
    "SECURE_COOKIES",
  ])
    expect(() => readConfig({ ...env, [key]: "" })).toThrow();
  expect(() => readConfig({ ...env, LOCAL_TEST_CONTROLS: "1" })).toThrow();
  expect(() =>
    readConfig({ ...env, APP_ORIGIN: "https://notes.example/path" }),
  ).toThrow();
  expect(() => readConfig({ ...env, PORT: "banana" })).toThrow();
});
it("closes the pool if schema readiness fails", async () => {
  const db = { close: vi.fn() };
  const app = express();
  await expect(
    startRuntime({
      db,
      app,
      port: 0,
      host: "127.0.0.1",
      schemaReady: async () => {
        throw Error("schema");
      },
      reconcile: vi.fn(),
    }),
  ).rejects.toThrow("schema");
  expect(db.close).toHaveBeenCalledOnce();
});
it("prevents overlapping sweeps and closes server and pool once", async () => {
  const db = { close: vi.fn() };
  const app = express();
  app.get("/", (_, r) => r.send("ok"));
  let release;
  const pending = new Promise((r) => (release = r));
  let calls = 0;
  const reconcile = vi.fn(async () => {
    if (++calls > 1) await pending;
  });
  const runtime = await startRuntime({
    db,
    app,
    port: 0,
    host: "127.0.0.1",
    sweepMs: 10,
    schemaReady: async () => {},
    reconcile,
  });
  try {
    await new Promise((r) => setTimeout(r, 45));
    expect(reconcile).toHaveBeenCalledTimes(2);
    release();
    await runtime.stop();
    await runtime.stop();
    expect(db.close).toHaveBeenCalledOnce();
    expect(runtime.server.listening).toBe(false);
  } finally {
    release();
    await runtime.stop();
  }
});
it("catches sweep failures without leaking private error messages", async () => {
  const db = { close: vi.fn() };
  const log = vi.fn();
  let calls = 0;
  const runtime = await startRuntime({
    db,
    app: express(),
    port: 0,
    host: "127.0.0.1",
    sweepMs: 10,
    schemaReady: async () => {},
    logger: log,
    reconcile: async () => {
      if (++calls > 1) throw Error("private secret");
    },
  });
  try {
    await new Promise((r) => setTimeout(r, 35));
    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain("private secret");
  } finally {
    await runtime.stop();
  }
});
