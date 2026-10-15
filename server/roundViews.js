import { randomInt } from "node:crypto";
import { requireMembership } from "./groups.js";
import { reconcileGroupLocked } from "./rounds.js";
import { withGroupTransaction } from "./locks.js";
import { fail } from "./errors.js";
export { leaderboard } from "./scoring.js";
function shuffle(values) {
  const array = [...values];
  for (let i = array.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
const user = (row) => ({
  id: row.account_id ?? row.id,
  displayName: row.display_name,
  username: row.username,
});
export async function getRoundView(db, { groupId, userId, nowMs }) {
  return withGroupTransaction(db, groupId, async (tx) => {
    await requireMembership(tx, groupId, userId);
    const now = typeof nowMs === "function" ? nowMs() : nowMs;
    const round = await reconcileGroupLocked(tx, groupId, now);
    const {
      rows: [memberRow],
    } = await tx.query(
      "SELECT count(*)::int AS n FROM memberships WHERE group_id=$1",
      [groupId],
    );
    const memberCount = Number(memberRow.n);
    if (!round)
      return {
        memberCount,
        round: null,
        eligible: false,
        participation: { answered: 0, total: 0 },
      };
    const { rows: answers } = await tx.query(
      "SELECT a.*,u.display_name,u.username FROM answers a JOIN accounts u ON u.id=a.account_id WHERE a.round_id=$1",
      [round.id],
    );
    const own = answers.find((answer) => answer.account_id === userId);
    const {
      rows: [participantCount],
    } = await tx.query(
      "SELECT count(*)::int AS n FROM round_participants WHERE round_id=$1",
      [round.id],
    );
    const { rows: eligibleRows } = await tx.query(
      "SELECT 1 FROM round_participants WHERE round_id=$1 AND account_id=$2",
      [round.id, userId],
    );
    const result = {
      memberCount,
      round: {
        id: round.id,
        phase: round.phase,
        prompt: round.prompt_text,
        answerDeadline: round.answer_deadline,
        revealAt: round.reveal_at,
        scored: Boolean(round.scored),
        isTest: Boolean(round.is_test),
        localDate: round.local_date,
      },
      participation: {
        answered: answers.length,
        total: Number(participantCount.n),
      },
      eligible: Boolean(eligibleRows.length),
    };
    if (own) result.ownAnswer = { id: own.id, text: own.text };
    if (round.phase === "guessing" && own) {
      const others = answers.filter((answer) => answer.account_id !== userId);
      let {
        rows: [order],
      } = await tx.query(
        "SELECT answer_order FROM round_boards WHERE round_id=$1 AND account_id=$2",
        [round.id, userId],
      );
      if (!order) {
        await tx.query(
          "INSERT INTO round_boards VALUES($1,$2,$3) ON CONFLICT(round_id,account_id) DO NOTHING",
          [
            round.id,
            userId,
            JSON.stringify(shuffle(others.map((answer) => answer.id))),
          ],
        );
        ({
          rows: [order],
        } = await tx.query(
          "SELECT answer_order FROM round_boards WHERE round_id=$1 AND account_id=$2",
          [round.id, userId],
        ));
      }
      const byId = new Map(
        others.map((answer) => [
          answer.id,
          { id: answer.id, text: answer.text },
        ]),
      );
      const { rows: matches } = await tx.query(
        'SELECT answer_id AS "answerId",person_id AS "personId" FROM guesses WHERE round_id=$1 AND guesser_id=$2',
        [round.id, userId],
      );
      result.board = {
        answers: JSON.parse(order.answer_order).map((id) => byId.get(id)),
        people: others
          .map(user)
          .sort(
            (a, b) =>
              a.displayName.localeCompare(b.displayName) ||
              a.id.localeCompare(b.id),
          ),
        matches,
      };
    }
    if (round.phase === "revealed") {
      const {
        rows: [storedOrder],
      } = await tx.query(
        "SELECT answer_order FROM round_boards WHERE round_id=$1 AND account_id=$2",
        [round.id, userId],
      );
      const order = storedOrder
        ? JSON.parse(storedOrder.answer_order)
        : answers
            .filter((answer) => answer.account_id !== userId)
            .map((answer) => answer.id);
      const lookup = new Map(answers.map((answer) => [answer.id, answer]));
      const ordered = own
        ? [...order.map((id) => lookup.get(id)), own]
        : answers;
      const { rows: scoreRows } = await tx.query(
        "SELECT s.account_id,s.score,u.display_name,u.username FROM round_scores s JOIN accounts u ON u.id=s.account_id WHERE s.round_id=$1 ORDER BY s.score DESC,lower(u.display_name),u.id",
        [round.id],
      );
      const max = scoreRows.length ? scoreRows[0].score : null;
      const { rows: guesses } = await tx.query(
        'SELECT g.answer_id AS "answerId",g.person_id AS "personId",(a.account_id=g.person_id) AS correct FROM guesses g JOIN answers a ON a.id=g.answer_id WHERE g.round_id=$1 AND g.guesser_id=$2',
        [round.id, userId],
      );
      result.reveal = {
        answers: ordered.map((answer) => ({
          id: answer.id,
          text: answer.text,
          author: user(answer),
        })),
        myMatches: own
          ? guesses.map((guess) => ({
              ...guess,
              correct: Boolean(guess.correct),
            }))
          : [],
        results: scoreRows.map((score) => ({
          user: user(score),
          score: Number(score.score),
          isWinner: score.score === max,
        })),
        scored: Boolean(round.scored),
      };
    }
    return result;
  });
}
export async function saveMatches(db, { groupId, userId, matches, nowMs }) {
  return withGroupTransaction(db, groupId, async (tx) => {
    await requireMembership(tx, groupId, userId);
    const now = typeof nowMs === "function" ? nowMs() : nowMs;
    const round = await reconcileGroupLocked(tx, groupId, now);
    if (!round || round.phase !== "guessing")
      fail(409, "Matching is closed for this round.");
    const { rows: answers } = await tx.query(
      "SELECT * FROM answers WHERE round_id=$1",
      [round.id],
    );
    if (!answers.some((answer) => answer.account_id === userId))
      fail(403, "You need to answer to take part in matching.");
    if (!Array.isArray(matches) || matches.length > answers.length - 1)
      fail(400, "Send one match per note.");
    const validAnswers = new Set(
      answers
        .filter((answer) => answer.account_id !== userId)
        .map((answer) => answer.id),
    );
    const people = new Set(
      answers
        .filter((answer) => answer.account_id !== userId)
        .map((answer) => answer.account_id),
    );
    const usedAnswers = new Set(),
      usedPeople = new Set();
    for (const match of matches) {
      if (
        !match ||
        !validAnswers.has(match.answerId) ||
        !people.has(match.personId) ||
        usedAnswers.has(match.answerId) ||
        usedPeople.has(match.personId)
      )
        fail(400, "Use each person once, with notes from this round.");
      usedAnswers.add(match.answerId);
      usedPeople.add(match.personId);
    }
    await tx.query("DELETE FROM guesses WHERE round_id=$1 AND guesser_id=$2", [
      round.id,
      userId,
    ]);
    for (const match of matches)
      await tx.query("INSERT INTO guesses VALUES($1,$2,$3,$4)", [
        round.id,
        userId,
        match.answerId,
        match.personId,
      ]);
    return { ok: true };
  });
}
