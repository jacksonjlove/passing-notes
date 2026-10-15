import { requireMembership } from "./groups.js";
import { withGroupTransaction } from "./locks.js";
export async function leaderboard(db, groupId, userId) {
  await requireMembership(db, groupId, userId);
  const { rows } = await db.query(
    `SELECT u.id,u.display_name AS "displayName",u.username,
      COALESCE(sum(s.score),0)::int AS score
     FROM memberships m JOIN accounts u ON u.id=m.account_id
     LEFT JOIN rounds r ON r.group_id=m.group_id
     LEFT JOIN round_scores s ON s.round_id=r.id AND s.account_id=m.account_id
     WHERE m.group_id=$1 GROUP BY u.id
     ORDER BY score DESC,lower(u.display_name),u.id`,
    [groupId],
  );
  return rows;
}
export async function finalizeRoundLocked(tx, roundId, nowMs) {
  const {
    rows: [round],
  } = await tx.query("SELECT * FROM rounds WHERE id=$1 FOR UPDATE", [roundId]);
  if (!round || round.finalized) return;
  const { rows: answers } = await tx.query(
    "SELECT * FROM answers WHERE round_id=$1",
    [roundId],
  );
  const scored = answers.length >= 3;
  if (scored) {
    for (const answer of answers) {
      const {
        rows: [score],
      } = await tx.query(
        `SELECT count(*)::int AS n FROM guesses g JOIN answers a
         ON a.id=g.answer_id AND a.round_id=g.round_id
         WHERE g.round_id=$1 AND g.guesser_id=$2 AND a.account_id=g.person_id
         AND a.account_id!=g.guesser_id`,
        [roundId, answer.account_id],
      );
      await tx.query("INSERT INTO round_scores VALUES($1,$2,$3)", [
        roundId,
        answer.account_id,
        Number(score.n),
      ]);
    }
  }
  await tx.query(
    "UPDATE rounds SET phase='revealed',scored=$1,finalized=1 WHERE id=$2",
    [Number(scored), roundId],
  );
}
export async function finalizeRound(db, roundId, nowMs) {
  const {
    rows: [round],
  } = await db.query("SELECT group_id FROM rounds WHERE id=$1", [roundId]);
  if (!round) return;
  return withGroupTransaction(db, round.group_id, async (tx) => {
    const {
      rows: [current],
    } = await tx.query("SELECT group_id FROM rounds WHERE id=$1 FOR UPDATE", [
      roundId,
    ]);
    if (!current || current.group_id !== round.group_id) return;
    return finalizeRoundLocked(tx, roundId, nowMs);
  });
}
