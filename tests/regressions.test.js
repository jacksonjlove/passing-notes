import { it, expect } from "vitest";
import { groupFixture, write } from "./helpers.js";
it("selects the newest same-time practice round for round and group views", async () => {
  const f = await groupFixture(3);
  const now = Date.parse("2026-10-09T14:00:00Z");
  f.setTime(now);
  await f.db.query(
    `INSERT INTO rounds(id,group_id,local_date,prompt_id,prompt_text,opens_at,answer_deadline,reveal_at,phase,scored,finalized,is_test)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12),
           ($13,$2,$14,$4,$5,$6,$7,$8,$15,$16,$17,$12)`,
    [
      "z-practice-old",
      f.group.id,
      "practice-old",
      "test-prompt",
      "Old round",
      now,
      now + 3600000,
      now + 7200000,
      "revealed",
      0,
      1,
      1,
      "a-practice-new",
      "practice-new",
      "guessing",
      1,
      0,
    ],
  );

  const round = (await f.agents[0].get(`/api/groups/${f.group.id}/round`)).body
    .round;
  expect(round).toMatchObject({ id: "a-practice-new", phase: "guessing" });
  const group = (await f.agents[0].get("/api/groups")).body.groups[0];
  expect(group.currentPhase).toBe("guessing");
});

it("returns an updated member count on round refresh", async () => {
  const f = await groupFixture(4);
  const result = await f.agents[0].get(`/api/groups/${f.group.id}/round`);
  expect(result.body.memberCount).toBe(4);
  await f.dispose();
});
it("applies tomorrow schedules without changing an active round", async () => {
  const f = await groupFixture(4);
  f.setTime("2026-10-09T14:00:00Z");
  const base = `/api/groups/${f.group.id}`;
  const current = (await f.agents[0].get(base + "/round")).body.round;
  await write(f.agents[0], "patch", base + "/settings", {
    answerTime: "16:00",
    revealTime: "20:00",
  });
  expect(
    (await f.agents[0].get(base + "/round")).body.round.answerDeadline,
  ).toBe(current.answerDeadline);
  f.setTime("2026-10-10T14:00:00Z");
  const next = (await f.agents[0].get(base + "/round")).body.round;
  expect(next.answerDeadline).toBe(Date.parse("2026-10-10T20:00:00Z"));
  expect(next.revealAt).toBe(Date.parse("2026-10-11T00:00:00Z"));
  await f.dispose();
});
it("reveals tied zero scores once without leaking other players guesses", async () => {
  const f = await groupFixture(4);
  f.setTime("2026-10-09T14:00:00Z");
  const path = `/api/groups/${f.group.id}/round`;
  for (let i = 0; i < 4; i++)
    await write(f.agents[i], "put", path + "/answer", { text: `A note ${i}` });
  f.setTime("2026-10-10T01:00:00Z");
  const reveal = (await f.agents[0].get(path)).body.reveal;
  expect(reveal.results).toHaveLength(4);
  expect(reveal.results.every((r) => r.score === 0 && r.isWinner)).toBe(true);
  expect(reveal.myMatches).toEqual([]);
  const {
    rows: [count],
  } = await f.db.query("SELECT count(*)::int AS n FROM round_scores");
  expect(Number(count.n)).toBe(4);
  await f.dispose();
});
it("keeps each player’s anonymous note order when authors are revealed", async () => {
  const f = await groupFixture(4);
  f.setTime("2026-10-09T14:00:00Z");
  const path = `/api/groups/${f.group.id}/round`;
  for (let i = 0; i < 4; i++)
    await write(f.agents[i], "put", path + "/answer", { text: `A note ${i}` });
  const views = await Promise.all(f.agents.map((a) => a.get(path)));
  f.setTime("2026-10-10T01:00:00Z");
  for (let i = 0; i < 4; i++) {
    const ids = (await f.agents[i].get(path)).body.reveal.answers.map(
      (a) => a.id,
    );
    expect(ids).toEqual([
      ...views[i].body.board.answers.map((a) => a.id),
      views[i].body.ownAnswer.id,
    ]);
  }
  await f.dispose();
});
