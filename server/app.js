import express from "express";
import { googleRoutes } from "./routes/google.js";
import { authRoutes } from "./routes/auth.js";
import { devRoutes } from "./routes/dev.js";
import { roundRoutes } from "./routes/rounds.js";
import { groupRoutes } from "./routes/groups.js";
import { readUser } from "./auth.js";
import { basicAuth } from "./basicAuth.js";
export function createApp({
  db,
  now = Date.now,
  devControls = false,
  origin = "http://localhost:5174",
  secure = false,
  basicAuthCredentials = null,
  google = null,
  commit = "local",
  requestLogger = () => {},
} = {}) {
  if (!db) throw new Error("createApp requires a database executor");
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) res.set("Cache-Control", "no-store");
    res.once("finish", () =>
      requestLogger({
        method: req.method,
        route: req.route?.path || "unmatched",
        status: res.statusCode,
      }),
    );
    next();
  });
  if (basicAuthCredentials)
    app.head("/api/version", basicAuth(basicAuthCredentials));
  app.get("/api/version", (req, res) => res.json({ commit }));
  if (basicAuthCredentials) app.use(basicAuth(basicAuthCredentials));
  app.get("/api/access", (req, res) => {
    if (!basicAuthCredentials) return res.redirect("/");
    res
      .type("html")
      .send(
        '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Passing Notes access</title><body><main><h1>Passing Notes access confirmed</h1><p>Your browser has authenticated with the shared access gate.</p><p><a href="/">Continue to Passing Notes</a></p></main></body></html>',
      );
  });
  app.use(express.json({ limit: "16kb" }));
  const attempts = new Map();
  app.use((req, res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (req.headers.origin !== origin)
        return res.status(403).json({
          error: {
            code: "ORIGIN",
            message: "Please use the app to send this request.",
          },
        });
      if (!req.is("application/json"))
        return res
          .status(400)
          .json({ error: { code: "JSON", message: "Send JSON data." } });
      if (
        req.path.startsWith("/api/auth") ||
        req.path === "/api/invitations/join"
      ) {
        const key = req.ip + req.path;
        let value = attempts.get(key);
        if (!value || now() - value.start >= 60000)
          value = { start: now(), count: 0 };
        value.count++;
        attempts.set(key, value);
        if (value.count > 30)
          return res.status(429).json({
            error: {
              code: "LIMIT",
              message: "Please wait a minute before trying again.",
            },
          });
        if (attempts.size > 10000) attempts.clear();
      }
    }
    Promise.resolve(readUser(db, req, now()))
      .then((user) => {
        req.user = user;
        next();
      })
      .catch(next);
  });
  app.use("/api/auth", googleRoutes({ db, now, secure, google }));
  app.use("/api/auth", authRoutes({ db, now, secure }));
  app.use("/api", groupRoutes({ db, now }));
  app.use("/api", roundRoutes({ db, now, devControls }));
  app.use("/api", devRoutes({ db, now, devControls }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status || 500;
    if (status === 500)
      console.error(
        "Request failed",
        /^\w{1,12}$/.test(error.code || "") ? error.code : "INTERNAL",
      );
    res.status(status).json({
      error: {
        code: error.code || String(status),
        message:
          status === 500
            ? "Something went wrong. Please retry."
            : error.message,
      },
    });
  });
  return app;
}
