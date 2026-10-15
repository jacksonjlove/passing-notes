import { DateTime, IANAZone } from "luxon";
import { randomUUID } from "node:crypto";
import { fail, text } from "./errors.js";
export function requireMembership(db, groupId, userId) {
  const group = db
    .prepare(
      "SELECT g.* FROM groups g JOIN memberships m ON m.group_id=g.id WHERE g.id=? AND m.account_id=?",
    )
    .get(groupId, userId);
  if (!group) fail(404, "This group is not available.");
  return group;
}
export function requireCreator(db, groupId, userId) {
  const group = requireMembership(db, groupId, userId);
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
export function groupView(db, g, userId) {
  return {
    id: g.id,
    name: g.name,
    role: g.creator_id === userId ? "creator" : "member",
    memberCount: db
      .prepare("SELECT count(*) AS n FROM memberships WHERE group_id=?")
      .get(g.id).n,
    ...activeSchedule(g),
    pending: g.pending ? JSON.parse(g.pending) : null,
    activationDate: g.activation_date,
    currentPhase:
      db
        .prepare(
          "SELECT phase FROM rounds WHERE group_id=? ORDER BY opens_at DESC,rowid DESC LIMIT 1",
        )
        .get(g.id)?.phase || null,
  };
}
export function createGroup(db, userId, body, now) {
  const name = text(body.name, 1, 60, "Group name"),
    s = validateSchedule(body),
    id = randomUUID();
  db.transaction(() => {
    db.prepare(
      "INSERT INTO groups(id,name,creator_id,time_zone,answer_time,reveal_time) VALUES(?,?,?,?,?,?)",
    ).run(id, name, userId, s.timeZone, s.answerTime, s.revealTime);
    db.prepare("INSERT INTO memberships VALUES(?,?,?)").run(id, userId, now);
  })();
  return groupView(db, requireMembership(db, id, userId), userId);
}
export function activateIfReady(db, groupId, now) {
  const g = db.prepare("SELECT * FROM groups WHERE id=?").get(groupId);
  const n = db
    .prepare("SELECT count(*) AS n FROM memberships WHERE group_id=?")
    .get(groupId).n;
  if (!g.activation_date && n >= 3) {
    const date = DateTime.fromMillis(now, { zone: g.time_zone })
      .plus({ days: 1 })
      .toISODate();
    db.prepare("UPDATE groups SET activation_date=? WHERE id=?").run(
      date,
      groupId,
    );
  }
}
