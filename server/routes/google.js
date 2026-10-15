import { Router } from "express";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { digest, setSession, verifyPassword } from "../auth.js";
import { route, fail } from "../errors.js";
const random = () => randomBytes(32).toString("base64url");
const cookie = (req, key) =>
  req.headers.cookie
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(key + "="))
    ?.slice(key.length + 1);
export function googleRoutes({ db, now, secure, google }) {
  const router = Router();
  const options = {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: 600000,
  };
  router.use((req, res, next) => {
    res.set("Referrer-Policy", "no-referrer");
    next();
  });
  router.get(
    "/config",
    route(async (req, res) => {
      let linked = false,
        hasPassword = false;
      if (req.user) {
        const r = await db.query(
          "SELECT a.password_hash, g.subject FROM accounts a LEFT JOIN google_identities g ON g.account_id=a.id WHERE a.id=$1",
          [req.user.id],
        );
        linked = !!r.rows[0]?.subject;
        hasPassword = !!r.rows[0]?.password_hash;
      }
      res.json({ google: !!google, linked, hasPassword });
    }),
  );
  router.post(
    "/google/start",
    route(async (req, res) => {
      if (!google) fail(503, "Google sign-in is not available yet.");
      const linking = req.body.link === true;
      let sessionHash = null;
      if (linking) {
        if (!req.user) fail(401, "Please sign in first.");
        const {
          rows: [account],
        } = await db.query("SELECT password_hash FROM accounts WHERE id=$1", [
          req.user.id,
        ]);
        if (!account?.password_hash)
          fail(400, "Google is already your sign-in method.");
        if (
          typeof req.body.password !== "string" ||
          req.body.password.length > 128 ||
          !(await verifyPassword(req.body.password, account.password_hash))
        )
          fail(401, "Your current password is incorrect.");
        sessionHash = digest(cookie(req, "pn_session") || "");
      }
      const state = random(),
        browser = random(),
        nonce = random(),
        verifier = random();
      const invite =
        typeof req.body.invite === "string" &&
        /^[A-Za-z0-9_-]{1,200}$/.test(req.body.invite)
          ? req.body.invite
          : null;
      await db.query(
        "DELETE FROM oauth_attempts WHERE state_hash IN (SELECT state_hash FROM oauth_attempts WHERE expires_at<$1 LIMIT 100)",
        [now()],
      );
      await db.query(
        "INSERT INTO oauth_attempts VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          digest(state),
          digest(browser),
          nonce,
          verifier,
          linking ? req.user.id : null,
          sessionHash,
          invite,
          now() + 600000,
        ],
      );
      res.cookie("pn_google", browser, options);
      res.json({
        url: google.authorize({
          state,
          nonce,
          code_challenge: createHash("sha256")
            .update(verifier)
            .digest("base64url"),
        }),
      });
    }),
  );
  router.get("/google/callback", async (req, res) => {
    res.clearCookie("pn_google", {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/api/auth/google",
    });
    try {
      if (
        !google ||
        typeof req.query.state !== "string" ||
        req.query.state.length > 200
      )
        throw Error("Invalid state");
      const {
        rows: [attempt],
      } = await db.query(
        "DELETE FROM oauth_attempts WHERE state_hash=$1 AND browser_hash=$2 AND expires_at>$3 RETURNING *",
        [
          digest(req.query.state),
          digest(cookie(req, "pn_google") || ""),
          now(),
        ],
      );
      if (
        !attempt ||
        typeof req.query.code !== "string" ||
        req.query.code.length > 4096 ||
        req.query.error
      )
        throw Error("Invalid attempt");
      if (
        attempt.account_id &&
        (!req.user ||
          req.user.id !== attempt.account_id ||
          digest(cookie(req, "pn_session") || "") !== attempt.session_hash)
      )
        throw Error("Session changed");
      const identity = await google.verify({
        code: req.query.code,
        verifier: attempt.verifier,
        nonce: attempt.nonce,
      });
      if (
        typeof identity.sub !== "string" ||
        !identity.sub ||
        identity.sub.length > 255
      )
        throw Error("Invalid identity");
      const id = await db.transaction(async (tx) => {
        // Serializes both first-login creation and linking for the same Google subject.
        await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
          identity.sub,
        ]);
        const {
          rows: [existing],
        } = await tx.query(
          "SELECT account_id FROM google_identities WHERE subject=$1",
          [identity.sub],
        );
        if (attempt.account_id) {
          const {
            rows: [session],
          } = await tx.query(
            "SELECT account_id FROM sessions WHERE token_hash=$1 AND expires_at>$2 FOR UPDATE",
            [attempt.session_hash, now()],
          );
          if (session?.account_id !== attempt.account_id)
            throw Error("Expired session");
          if (existing && existing.account_id !== attempt.account_id)
            throw Error("Already linked");
          const {
            rows: [linked],
          } = await tx.query(
            "SELECT subject FROM google_identities WHERE account_id=$1",
            [attempt.account_id],
          );
          if (linked && linked.subject !== identity.sub)
            throw Error("Different identity");
          if (!existing)
            await tx.query("INSERT INTO google_identities VALUES($1,$2)", [
              identity.sub,
              attempt.account_id,
            ]);
          return attempt.account_id;
        }
        if (existing) return existing.account_id;
        const id = randomUUID(),
          username = "player_" + randomBytes(10).toString("hex");
        const name =
          typeof identity.name === "string" && identity.name.trim()
            ? identity.name.trim().slice(0, 40)
            : "Player";
        await tx.query(
          "INSERT INTO accounts(id,username,display_name,password_hash) VALUES($1,$2,$3,NULL)",
          [id, username, name],
        );
        await tx.query("INSERT INTO google_identities VALUES($1,$2)", [
          identity.sub,
          id,
        ]);
        return id;
      });
      await setSession(db, res, id, now(), secure);
      const query = new URLSearchParams();
      if (attempt.invite) query.set("invite", attempt.invite);
      if (attempt.account_id) query.set("google_linked", "1");
      res.redirect("/" + (query.size ? "?" + query : ""));
    } catch {
      res.redirect("/?google_error=1");
    }
  });
  return router;
}
