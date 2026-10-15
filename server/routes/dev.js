import { Router } from "express";
import { randomUUID } from "node:crypto";
import { route, fail } from "../errors.js";
import { requireCreator } from "../groups.js";
import { currentRound, createRound, advanceRound } from "../rounds.js";
export function devRoutes({ db, now, devControls }) {
  const r = Router();
  if (!devControls) return r;
  r.post(
    "/groups/:id/dev/round",
    route((req, res) => {
      if (!req.user) fail(401, "Please sign in.");
      const g = requireCreator(db, req.params.id, req.user.id);
      const action = req.body.action;
      if (!["start", "guess", "reveal"].includes(action))
        fail(400, "Choose a test action.");
      let current = currentRound(db, g.id);
      db.transaction(() => {
        if (action === "start") {
          if (current && current.phase !== "revealed")
            fail(409, "Finish the current round first.");
          const participants = db
            .prepare("SELECT account_id FROM memberships WHERE group_id=?")
            .all(g.id);
          if (participants.length < 3)
            fail(409, "Invite at least three members before starting.");
          current = createRound(
            db,
            g,
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
          if (action === "guess")
            db.prepare("UPDATE rounds SET answer_deadline=? WHERE id=?").run(
              now(),
              current.id,
            );
          else
            db.prepare("UPDATE rounds SET reveal_at=? WHERE id=?").run(
              now(),
              current.id,
            );
          advanceRound(
            db,
            db.prepare("SELECT * FROM rounds WHERE id=?").get(current.id),
            now(),
          );
        }
      })();
      res.status(action === "start" ? 201 : 200).json({ ok: true });
    }),
  );
  return r;
}
