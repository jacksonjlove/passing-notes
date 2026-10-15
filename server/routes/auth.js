import { Router } from "express";
import { route, fail } from "../errors.js";
import {
  register,
  verifyPassword,
  publicUser,
  setSession,
  digest,
} from "../auth.js";
export function authRoutes({ db, now, secure }) {
  const router = Router();
  router.post(
    "/register",
    route(async (req, res) => {
      const user = await register(db, req.body);
      await setSession(db, res, user.id, now(), secure);
      res.status(201).json({ user });
    }),
  );
  router.post(
    "/login",
    route(async (req, res) => {
      const username =
        typeof req.body.username === "string"
          ? req.body.username.trim().toLowerCase()
          : "";
      const {
        rows: [row],
      } = await db.query("SELECT * FROM accounts WHERE username=$1", [
        username,
      ]);
      if (
        typeof req.body.password !== "string" ||
        req.body.password.length > 128 ||
        !row ||
        !(await verifyPassword(req.body.password, row.password_hash))
      )
        fail(401, "Username or password is incorrect.");
      const user = publicUser(row);
      await setSession(db, res, user.id, now(), secure);
      res.json({ user });
    }),
  );
  router.get(
    "/me",
    route(async (req, res) => {
      if (!req.user) fail(401, "Please sign in.");
      res.json({ user: req.user });
    }),
  );
  router.post(
    "/logout",
    route(async (req, res) => {
      const token = req.headers.cookie
        ?.split(";")
        .map((x) => x.trim())
        .find((x) => x.startsWith("pn_session="))
        ?.slice(11);
      if (token)
        await db.query("DELETE FROM sessions WHERE token_hash=$1", [
          digest(token),
        ]);
      res.clearCookie("pn_session", {
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
      });
      res.json({ ok: true });
    }),
  );
  return router;
}
