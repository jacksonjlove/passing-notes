import { Router } from "express";
import { route } from "../errors.js";
import { requireMembership } from "../groups.js";
import { saveAnswer, reconcileGroup } from "../rounds.js";
import { getRoundView, saveMatches, leaderboard } from "../roundViews.js";
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
    route((req, res) =>
      res.json({
        ...getRoundView(db, {
          groupId: req.params.id,
          userId: req.user.id,
          nowMs: now(),
        }),
        devControls:
          devControls &&
          requireMembership(db, req.params.id, req.user.id).creator_id ===
            req.user.id,
      }),
    ),
  );
  r.put(
    "/groups/:id/round/answer",
    route((req, res) =>
      res.json(
        saveAnswer(db, {
          groupId: req.params.id,
          userId: req.user.id,
          text: req.body.text,
          nowMs: now(),
        }),
      ),
    ),
  );
  r.put(
    "/groups/:id/round/matches",
    route((req, res) =>
      res.json(
        saveMatches(db, {
          groupId: req.params.id,
          userId: req.user.id,
          matches: req.body.matches,
          nowMs: now(),
        }),
      ),
    ),
  );
  r.get(
    "/groups/:id/leaderboard",
    route((req, res) => {
      reconcileGroup(db, req.params.id, now());
      res.json({ entries: leaderboard(db, req.params.id, req.user.id) });
    }),
  );
  return r;
}
