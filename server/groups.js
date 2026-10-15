import { DateTime, IANAZone } from "luxon";
import { randomUUID } from "node:crypto";
import { fail, text } from "./errors.js";
import { withGroupTransaction } from "./locks.js";
export async function requireMembership(db, groupId, userId) {
  const {
    rows: [group],
  } = await db.query(
    "SELECT g.* FROM groups g JOIN memberships m ON m.group_id=g.id WHERE g.id=$1 AND m.account_id=$2",
    [groupId, userId],
  );
  if (!group) fail(404, "This group is not available.");
  return group;
}
export async function requireCreator(db, groupId, userId) {
  const group = await requireMembership(db, groupId, userId);
  if (group.creator_id !== userId)
    fail(403, "Only the group creator can do that.");
  return group;
}
export function validateSchedule(s) {
  if (!IANAZone.isValidZone(s.timeZone)) fail(400, "Choose a valid time zone.");
  const pattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (
    !pattern.test(s.answerTime) ||
    !pattern.test(s.revealTime) ||
    s.answerTime === "00:00" ||
    s.answerTime >= s.revealTime
  )
    fail(400, "Choose an answer time before the reveal time, after midnight.");
  return {
    timeZone: s.timeZone,
    answerTime: s.answerTime,
    revealTime: s.revealTime,
  };
}
export const activeSchedule = (g) => ({
  timeZone: g.time_zone,
  answerTime: g.answer_time,
  revealTime: g.reveal_time,
});
export async function groupView(db, g, userId) {
  const {
    rows: [memberCount],
  } = await db.query(
    "SELECT count(*) AS n FROM memberships WHERE group_id=$1",
    [g.id],
  );
  const {
    rows: [round],
  } = await db.query(
    "SELECT phase FROM rounds WHERE group_id=$1 ORDER BY opens_at DESC,creation_order DESC LIMIT 1",
    [g.id],
  );
  return {
    id: g.id,
    name: g.name,
    role: g.creator_id === userId ? "creator" : "member",
    memberCount: Number(memberCount.n),
    ...activeSchedule(g),
    pending: g.pending ? JSON.parse(g.pending) : null,
    activationDate: g.activation_date,
    currentPhase: round?.phase || null,
  };
}
export async function createGroup(db, userId, body, now) {
  const name = text(body.name, 1, 60, "Group name"),
    s = validateSchedule(body),
    id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.query(
      "INSERT INTO groups(id,name,creator_id,time_zone,answer_time,reveal_time) VALUES($1,$2,$3,$4,$5,$6)",
      [id, name, userId, s.timeZone, s.answerTime, s.revealTime],
    );
    await tx.query("INSERT INTO memberships VALUES($1,$2,$3)", [
      id,
      userId,
      now,
    ]);
  });
  return groupView(db, await requireMembership(db, id, userId), userId);
}
export async function activateIfReady(db, groupId, now) {
  return withGroupTransaction(db, groupId, (tx, group) =>
    activateIfReadyLocked(tx, group, now),
  );
}
export async function activateIfReadyLocked(tx, group, now) {
  const {
    rows: [g],
  } = await tx.query("SELECT * FROM groups WHERE id=$1", [group.id]);
  const {
    rows: [count],
  } = await tx.query(
    "SELECT count(*) AS n FROM memberships WHERE group_id=$1",
    [group.id],
  );
  if (!g.activation_date && Number(count.n) >= 3) {
    const date = DateTime.fromMillis(now, { zone: g.time_zone })
      .plus({ days: 1 })
      .toISODate();
    await tx.query("UPDATE groups SET activation_date=$1 WHERE id=$2", [
      date,
      group.id,
    ]);
  }
}
