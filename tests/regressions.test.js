import { it, expect } from "vitest";
import { groupFixture, write } from "./helpers.js";
it("returns an updated member count on round refresh", async () => {
  const f = await groupFixture(4);
  const result = await f.agents[0].get(`/api/groups/${f.group.id}/round`);
  expect(result.body.memberCount).toBe(4);
  f.db.close();
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
  f.db.close();
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
  expect(f.db.prepare("SELECT count(*) AS n FROM round_scores").get().n).toBe(
    4,
  );
  f.db.close();
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
  f.db.close();
});
