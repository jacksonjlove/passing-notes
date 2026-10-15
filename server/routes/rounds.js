import { Router } from "express";
import { route } from "../errors.js";
import { requireMembership } from "../groups.js";
import { saveAnswer } from "../rounds.js";
import { getRoundView, saveMatches, leaderboard } from "../roundViews.js";
import { withGroupTransaction } from "../locks.js";
import { reconcileGroupLocked } from "../rounds.js";
export function roundRoutes({ db, now, devControls }) {
  const r = Router();
  r.use((req, res, next) => {
    if (!req.user)
      return res
        .status(401)
        .json({ error: { code: "401", message: "Please sign in." } });
    next();
  });
  r.get(
    "/groups/:id/round",
    route(async (req, res) =>
      res.json({
        ...(await getRoundView(db, {
          groupId: req.params.id,
          userId: req.user.id,
          nowMs: now,
        })),
        devControls:
          devControls &&
          (await requireMembership(db, req.params.id, req.user.id))
            .creator_id === req.user.id,
      }),
    ),
  );
  r.put(
    "/groups/:id/round/answer",
    route(async (req, res) =>
      res.json(
        await saveAnswer(db, {
          groupId: req.params.id,
          userId: req.user.id,
          text: req.body.text,
          nowMs: now,
        }),
      ),
    ),
  );
  r.put(
    "/groups/:id/round/matches",
    route(async (req, res) =>
      res.json(
        await saveMatches(db, {
          groupId: req.params.id,
          userId: req.user.id,
          matches: req.body.matches,
          nowMs: now,
        }),
      ),
    ),
  );
  r.get(
    "/groups/:id/leaderboard",
    route(async (req, res) => {
      const entries = await withGroupTransaction(
        db,
        req.params.id,
        async (tx) => {
          await requireMembership(tx, req.params.id, req.user.id);
          await reconcileGroupLocked(tx, req.params.id, now());
          return leaderboard(tx, req.params.id, req.user.id);
        },
      );
      res.json({ entries });
    }),
  );
  return r;
}
