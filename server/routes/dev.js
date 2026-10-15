import { Router } from "express";
import { randomUUID } from "node:crypto";
import { route, fail } from "../errors.js";
import { requireCreator } from "../groups.js";
import { currentRound, createRound, advanceRound } from "../rounds.js";
import { withGroupTransaction } from "../locks.js";
export function devRoutes({ db, now, devControls }) {
  const r = Router();
  if (!devControls) return r;
  r.post(
    "/groups/:id/dev/round",
    route(async (req, res) => {
      if (!req.user) fail(401, "Please sign in.");
      const action = req.body.action;
      if (!["start", "guess", "reveal"].includes(action))
        fail(400, "Choose a test action.");
      await withGroupTransaction(db, req.params.id, async (tx) => {
        const group = await requireCreator(tx, req.params.id, req.user.id);
        let current = await currentRound(tx, group.id);
        if (action === "start") {
          if (current && current.phase !== "revealed")
            fail(409, "Finish the current round first.");
          const { rows: participants } = await tx.query(
            "SELECT account_id FROM memberships WHERE group_id=$1",
            [group.id],
          );
          if (participants.length < 3)
            fail(409, "Invite at least three members before starting.");
          current = await createRound(
            tx,
            group,
            "test-" + randomUUID(),
            {
              opensAt: now(),
              answerDeadline: now() + 3600000,
              revealAt: now() + 7200000,
            },
            participants,
            now(),
            true,
          );
        } else {
          if (!current || !current.is_test || current.phase === "revealed")
            fail(409, "Start a test round first.");
          await tx.query(
            action === "guess"
              ? "UPDATE rounds SET answer_deadline=$1 WHERE id=$2"
              : "UPDATE rounds SET reveal_at=$1 WHERE id=$2",
            [now(), current.id],
          );
          const {
            rows: [updated],
          } = await tx.query("SELECT * FROM rounds WHERE id=$1", [current.id]);
          await advanceRound(tx, updated, now());
        }
      });
      res.status(action === "start" ? 201 : 200).json({ ok: true });
    }),
  );
  return r;
}
