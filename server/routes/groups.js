import { Router } from "express";
import { randomBytes, randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { digest } from "../auth.js";
import { route, fail, text } from "../errors.js";
import {
  requireMembership,
  requireCreator,
  activeSchedule,
  validateSchedule,
  groupView,
  createGroup,
  activateIfReady,
} from "../groups.js";
export function groupRoutes({ db, now }) {
  const r = Router();
  r.use((req, res, next) => {
    if (!req.user)
      return res
        .status(401)
        .json({ error: { code: "401", message: "Please sign in." } });
    next();
  });
  r.get(
    "/groups",
    route((req, res) => {
      const rows = db
        .prepare(
          "SELECT g.* FROM groups g JOIN memberships m ON m.group_id=g.id WHERE m.account_id=? ORDER BY g.name",
        )
        .all(req.user.id);
      res.json({ groups: rows.map((g) => groupView(db, g, req.user.id)) });
    }),
  );
  r.post(
    "/groups",
    route((req, res) =>
      res
        .status(201)
        .json({ group: createGroup(db, req.user.id, req.body, now()) }),
    ),
  );
  r.post(
    "/groups/:id/invitations",
    route((req, res) => {
      requireCreator(db, req.params.id, req.user.id);
      const id = randomUUID(),
        code = randomBytes(18).toString("base64url");
      db.prepare(
        "INSERT INTO invitations(id,group_id,code_hash) VALUES(?,?,?)",
      ).run(id, req.params.id, digest(code));
      res.status(201).json({ id, code });
    }),
  );
  r.delete(
    "/groups/:id/invitations/:inviteId",
    route((req, res) => {
      requireCreator(db, req.params.id, req.user.id);
      db.prepare(
        "UPDATE invitations SET revoked=1 WHERE id=? AND group_id=?",
      ).run(req.params.inviteId, req.params.id);
      res.json({ ok: true });
    }),
  );
  r.get(
    "/groups/:id/invitations",
    route((req, res) => {
      requireCreator(db, req.params.id, req.user.id);
      res.json({
        invitations: db
          .prepare("SELECT id,revoked FROM invitations WHERE group_id=?")
          .all(req.params.id),
      });
    }),
  );
  r.post(
    "/invitations/join",
    route((req, res) => {
      if (typeof req.body.code !== "string" || req.body.code.length > 100)
        fail(400, "Enter an invitation code.");
      const invitation = db
        .prepare("SELECT * FROM invitations WHERE code_hash=? AND revoked=0")
        .get(digest(req.body.code.trim()));
      if (!invitation) fail(404, "This invitation is not available.");
      db.transaction(() => {
        db.prepare("INSERT OR IGNORE INTO memberships VALUES(?,?,?)").run(
          invitation.group_id,
          req.user.id,
          now(),
        );
        activateIfReady(db, invitation.group_id, now());
      })();
      res.json({
        group: groupView(
          db,
          requireMembership(db, invitation.group_id, req.user.id),
          req.user.id,
        ),
      });
    }),
  );
  r.get(
    "/groups/:id/settings",
    route((req, res) =>
      res.json({
        settings: groupView(
          db,
          requireMembership(db, req.params.id, req.user.id),
          req.user.id,
        ),
      }),
    ),
  );
  r.patch(
    "/groups/:id/settings",
    route((req, res) => {
      const g = requireCreator(db, req.params.id, req.user.id);
      const s = validateSchedule({ ...activeSchedule(g), ...req.body });
      const effectiveDate = DateTime.fromMillis(now(), { zone: g.time_zone })
        .plus({ days: 1 })
        .toISODate();
      db.prepare("UPDATE groups SET pending=? WHERE id=?").run(
        JSON.stringify({ ...s, effectiveDate }),
        g.id,
      );
      res.json({
        settings: groupView(
          db,
          requireMembership(db, g.id, req.user.id),
          req.user.id,
        ),
      });
    }),
  );
  r.get(
    "/groups/:id/prompts",
    route((req, res) => {
      requireMembership(db, req.params.id, req.user.id);
      res.json({
        prompts: db
          .prepare("SELECT id,text FROM custom_prompts WHERE group_id=?")
          .all(req.params.id),
      });
    }),
  );
  r.post(
    "/groups/:id/prompts",
    route((req, res) => {
      requireCreator(db, req.params.id, req.user.id);
      const value = text(req.body.text, 1, 300, "Prompt"),
        id = randomUUID();
      db.prepare("INSERT INTO custom_prompts VALUES(?,?,?)").run(
        id,
        req.params.id,
        value,
      );
      res.status(201).json({ prompt: { id, text: value } });
    }),
  );
  return r;
}
