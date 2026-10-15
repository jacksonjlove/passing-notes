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
  activateIfReadyLocked,
} from "../groups.js";
import { withGroupTransaction } from "../locks.js";
export function groupRoutes({ db, now }) {
  const r = Router();
  r.use((req, res, next) =>
    !req.user
      ? res
          .status(401)
          .json({ error: { code: "401", message: "Please sign in." } })
      : next(),
  );
  r.get(
    "/groups",
    route(async (req, res) => {
      const { rows } = await db.query(
        "SELECT g.* FROM groups g JOIN memberships m ON m.group_id=g.id WHERE m.account_id=$1 ORDER BY g.name",
        [req.user.id],
      );
      const groups = [];
      for (const group of rows)
        groups.push(await groupView(db, group, req.user.id));
      res.json({ groups });
    }),
  );
  r.post(
    "/groups",
    route(async (req, res) =>
      res
        .status(201)
        .json({ group: await createGroup(db, req.user.id, req.body, now()) }),
    ),
  );
  r.post(
    "/groups/:id/invitations",
    route(async (req, res) => {
      const id = randomUUID(),
        code = randomBytes(18).toString("base64url");
      await withGroupTransaction(db, req.params.id, async (tx) => {
        await requireCreator(tx, req.params.id, req.user.id);
        await tx.query(
          "INSERT INTO invitations(id,group_id,code_hash) VALUES($1,$2,$3)",
          [id, req.params.id, digest(code)],
        );
      });
      res.status(201).json({ id, code });
    }),
  );
  r.delete(
    "/groups/:id/invitations/:inviteId",
    route(async (req, res) => {
      await withGroupTransaction(db, req.params.id, async (tx) => {
        await requireCreator(tx, req.params.id, req.user.id);
        await tx.query(
          "UPDATE invitations SET revoked=1 WHERE id=$1 AND group_id=$2",
          [req.params.inviteId, req.params.id],
        );
      });
      res.json({ ok: true });
    }),
  );
  r.get(
    "/groups/:id/invitations",
    route(async (req, res) => {
      await requireCreator(db, req.params.id, req.user.id);
      const { rows } = await db.query(
        "SELECT id,revoked FROM invitations WHERE group_id=$1",
        [req.params.id],
      );
      res.json({
        invitations: rows.map((row) => ({
          ...row,
          revoked: Boolean(row.revoked),
        })),
      });
    }),
  );
  r.post(
    "/invitations/join",
    route(async (req, res) => {
      if (typeof req.body.code !== "string" || req.body.code.length > 100)
        fail(400, "Enter an invitation code.");
      const {
        rows: [invitation],
      } = await db.query(
        "SELECT * FROM invitations WHERE code_hash=$1 AND revoked=0",
        [digest(req.body.code.trim())],
      );
      if (!invitation) fail(404, "This invitation is not available.");
      await withGroupTransaction(db, invitation.group_id, async (tx, group) => {
        const {
          rows: [currentInvitation],
        } = await tx.query(
          "SELECT * FROM invitations WHERE id=$1 AND code_hash=$2 AND revoked=0",
          [invitation.id, digest(req.body.code.trim())],
        );
        if (!currentInvitation) fail(404, "This invitation is not available.");
        const { rows: existingMembership } = await tx.query(
          "SELECT 1 FROM memberships WHERE group_id=$1 AND account_id=$2",
          [invitation.group_id, req.user.id],
        );
        const joinedAt = now();
        if (!existingMembership.length)
          await tx.query(
            "INSERT INTO memberships VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
            [invitation.group_id, req.user.id, joinedAt],
          );
        await activateIfReadyLocked(tx, group, joinedAt);
      });
      const group = await requireMembership(
        db,
        invitation.group_id,
        req.user.id,
      );
      res.json({ group: await groupView(db, group, req.user.id) });
    }),
  );
  r.delete(
    "/groups/:id",
    route(async (req, res) => {
      await withGroupTransaction(db, req.params.id, async (tx) => {
        const group = await requireCreator(tx, req.params.id, req.user.id);
        if (req.body.name !== group.name)
          fail(400, "Type the group name exactly to confirm deletion.");
        for (const table of [
          "guesses",
          "round_boards",
          "round_scores",
          "round_participants",
          "answers",
        ])
          await tx.query(
            `DELETE FROM ${table} WHERE round_id IN (SELECT id FROM rounds WHERE group_id=$1)`,
            [group.id],
          );
        for (const table of [
          "rounds",
          "prompt_usage",
          "custom_prompts",
          "invitations",
          "memberships",
        ])
          await tx.query(`DELETE FROM ${table} WHERE group_id=$1`, [group.id]);
        await tx.query("DELETE FROM groups WHERE id=$1", [group.id]);
      });
      res.json({ ok: true });
    }),
  );
  r.get(
    "/groups/:id/settings",
    route(async (req, res) => {
      const group = await requireMembership(db, req.params.id, req.user.id);
      res.json({ settings: await groupView(db, group, req.user.id) });
    }),
  );
  r.patch(
    "/groups/:id/settings",
    route(async (req, res) => {
      await withGroupTransaction(db, req.params.id, async (tx, lockedGroup) => {
        const group = await requireCreator(tx, req.params.id, req.user.id);
        const schedule = validateSchedule({
          ...activeSchedule(group),
          ...req.body,
        });
        const effectiveDate = DateTime.fromMillis(now(), {
          zone: lockedGroup.time_zone,
        })
          .plus({ days: 1 })
          .toISODate();
        await tx.query("UPDATE groups SET pending=$1 WHERE id=$2", [
          JSON.stringify({ ...schedule, effectiveDate }),
          group.id,
        ]);
      });
      const updated = await requireMembership(db, req.params.id, req.user.id);
      res.json({ settings: await groupView(db, updated, req.user.id) });
    }),
  );
  r.get(
    "/groups/:id/prompts",
    route(async (req, res) => {
      await requireMembership(db, req.params.id, req.user.id);
      const { rows } = await db.query(
        "SELECT id,text FROM custom_prompts WHERE group_id=$1",
        [req.params.id],
      );
      res.json({ prompts: rows });
    }),
  );
  r.post(
    "/groups/:id/prompts",
    route(async (req, res) => {
      const value = text(req.body.text, 1, 300, "Prompt"),
        id = randomUUID();
      await withGroupTransaction(db, req.params.id, async (tx) => {
        await requireCreator(tx, req.params.id, req.user.id);
        await tx.query("INSERT INTO custom_prompts VALUES($1,$2,$3)", [
          id,
          req.params.id,
          value,
        ]);
      });
      res.status(201).json({ prompt: { id, text: value } });
    }),
  );
  return r;
}
