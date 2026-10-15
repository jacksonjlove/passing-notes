import { finalizeRoundLocked } from "./scoring.js";
import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { fail, text } from "./errors.js";
import { requireMembership, activeSchedule } from "./groups.js";
import { resolveSchedule } from "./schedule.js";
import { selectPrompt } from "./prompts.js";
import { withGroupTransaction } from "./locks.js";

export async function currentRound(db, groupId) {
  const {
    rows: [round],
  } = await db.query(
    "SELECT * FROM rounds WHERE group_id=$1 ORDER BY opens_at DESC,creation_order DESC LIMIT 1 FOR UPDATE",
    [groupId],
  );
  return round || null;
}
export async function createRound(
  db,
  g,
  date,
  schedule,
  participants,
  now,
  isTest = false,
) {
  const prompt = await selectPrompt(db, g.id),
    id = randomUUID();
  await db.query(
    "INSERT INTO rounds(id,group_id,local_date,prompt_id,prompt_text,opens_at,answer_deadline,reveal_at,is_test) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [
      id,
      g.id,
      date,
      prompt.id,
      prompt.text,
      schedule.opensAt,
      schedule.answerDeadline,
      schedule.revealAt,
      Number(isTest),
    ],
  );
  for (const member of participants)
    await db.query("INSERT INTO round_participants VALUES($1,$2)", [
      id,
      member.account_id,
    ]);
  await db.query(
    "INSERT INTO prompt_usage VALUES($1,$2,$3) ON CONFLICT(group_id,prompt_id) DO UPDATE SET used_at=excluded.used_at",
    [g.id, prompt.id, now],
  );
  const {
    rows: [round],
  } = await db.query("SELECT * FROM rounds WHERE id=$1", [id]);
  return round;
}
export async function advanceRound(db, round, now) {
  if (round.phase === "revealed") return;
  const {
    rows: [count],
  } = await db.query(
    "SELECT count(*)::int AS n FROM answers WHERE round_id=$1",
    [round.id],
  );
  const {
    rows: [eligible],
  } = await db.query(
    "SELECT count(*)::int AS n FROM round_participants WHERE round_id=$1",
    [round.id],
  );
  if (
    now >= round.reveal_at ||
    (now >= round.answer_deadline && Number(count.n) < 3)
  ) {
    await finalizeRoundLocked(db, round.id, now);
  } else if (
    Number(count.n) >= 3 &&
    (now >= round.answer_deadline || Number(count.n) === Number(eligible.n))
  ) {
    await db.query("UPDATE rounds SET phase='guessing',scored=1 WHERE id=$1", [
      round.id,
    ]);
  }
}
export async function reconcileGroupLocked(tx, groupId, now) {
  let {
    rows: [group],
  } = await tx.query("SELECT * FROM groups WHERE id=$1", [groupId]);
  if (!group) return null;
  const { rows: activeRounds } = await tx.query(
    "SELECT * FROM rounds WHERE group_id=$1 AND phase!='revealed' FOR UPDATE",
    [groupId],
  );
  for (const round of activeRounds) await advanceRound(tx, round, now);
  let date = DateTime.fromMillis(now, { zone: group.time_zone }).toISODate();
  if (group.pending) {
    const pending = JSON.parse(group.pending);
    if (date >= pending.effectiveDate) {
      await tx.query(
        "UPDATE groups SET time_zone=$1,answer_time=$2,reveal_time=$3,pending=NULL WHERE id=$4",
        [pending.timeZone, pending.answerTime, pending.revealTime, group.id],
      );
      ({
        rows: [group],
      } = await tx.query("SELECT * FROM groups WHERE id=$1", [group.id]));
      date = DateTime.fromMillis(now, { zone: group.time_zone }).toISODate();
    }
  }
  const current = await currentRound(tx, group.id);
  if (current && current.phase !== "revealed") return current;
  const { rows: existing } = await tx.query(
    "SELECT 1 FROM rounds WHERE group_id=$1 AND local_date=$2",
    [group.id, date],
  );
  if (
    group.activation_date &&
    date >= group.activation_date &&
    !existing.length
  ) {
    const schedule = resolveSchedule(date, activeSchedule(group));
    const { rows: participants } = await tx.query(
      "SELECT account_id FROM memberships WHERE group_id=$1 AND joined_at<$2",
      [group.id, schedule.opensAt],
    );
    if (participants.length >= 3) {
      const round = await createRound(
        tx,
        group,
        date,
        schedule,
        participants,
        now,
      );
      await advanceRound(tx, round, now);
    }
  }
  return currentRound(tx, group.id);
}
export async function reconcileGroup(db, groupId, now) {
  return withGroupTransaction(db, groupId, (tx) =>
    reconcileGroupLocked(tx, groupId, typeof now === "function" ? now() : now),
  );
}
export async function reconcileAll(db, now) {
  const { rows: groups } = await db.query("SELECT id FROM groups");
  for (const group of groups) {
    try {
      await reconcileGroup(db, group.id, now);
    } catch (error) {
      throw error;
    }
  }
}
export async function saveAnswer(db, { groupId, userId, text: value, nowMs }) {
  return withGroupTransaction(db, groupId, async (tx) => {
    await requireMembership(tx, groupId, userId);
    const now = typeof nowMs === "function" ? nowMs() : nowMs;
    const round = await reconcileGroupLocked(tx, groupId, now);
    if (!round || round.phase !== "answering")
      fail(409, "Answers are closed for this round.");
    const { rows: participant } = await tx.query(
      "SELECT 1 FROM round_participants WHERE round_id=$1 AND account_id=$2",
      [round.id, userId],
    );
    if (!participant.length)
      fail(403, "You can play from the next daily round.");
    const answer = text(value, 1, 200, "Your note");
    await tx.query(
      "INSERT INTO answers VALUES($1,$2,$3,$4) ON CONFLICT(round_id,account_id) DO UPDATE SET text=excluded.text",
      [randomUUID(), round.id, userId, answer],
    );
    await advanceRound(tx, round, now);
    return { ok: true };
  });
}
