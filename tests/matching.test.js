import { it, expect } from "vitest";
import { groupFixture, write } from "./helpers.js";
async function ready(count = 4) {
  const f = await groupFixture(count);
  f.path = `/api/groups/${f.group.id}/round`;
  f.setTime("2026-10-09T14:00:00Z");
  for (let i = 0; i < 4; i++)
    await write(f.agents[i], "put", f.path + "/answer", { text: `Note ${i}` });
  if (count > 4) f.setTime("2026-10-09T21:00:00Z");
  return f;
}
it("shuffles a stable anonymous board, excludes self, rejects duplicates and scores once", async () => {
  const f = await ready();
  const view = (await f.agents[0].get(f.path)).body;
  expect(view.board?.answers).toHaveLength(3);
  for (const a of view.board.answers)
    expect(Object.keys(a).sort()).toEqual(["id", "text"]);
  expect(view.board.people.map((p) => p.id)).not.toContain(f.users[0].id);
  expect((await f.agents[0].get(f.path)).body.board.answers).toEqual(
    view.board.answers,
  );
  const matches = view.board.answers.map((a) => ({
    answerId: a.id,
    personId: f.users[Number(a.text.slice(-1))].id,
  }));
  expect(
    (
      await write(f.agents[0], "put", f.path + "/matches", {
        matches: [
          { ...matches[0] },
          { ...matches[1], personId: matches[0].personId },
        ],
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await write(f.agents[0], "put", f.path + "/matches", {
        matches: [{ ...matches[0], personId: f.users[0].id }],
      })
    ).status,
  ).toBe(400);
  expect(
    (await write(f.agents[0], "put", f.path + "/matches", { matches })).status,
  ).toBe(200);
  expect((await f.agents[0].get(f.path)).body.reveal).toBeUndefined();
  f.setTime("2026-10-10T01:00:00Z");
  const result = (await f.agents[0].get(f.path)).body;
  expect(result.reveal.answers).toHaveLength(4);
  expect(
    result.reveal.results.find((r) => r.user.id === f.users[0].id).score,
  ).toBe(3);
  expect(
    result.reveal.results.find((r) => r.user.id === f.users[0].id).isWinner,
  ).toBe(true);
  await f.agents[1].get(f.path);
  const entries = (
    await f.agents[0].get(`/api/groups/${f.group.id}/leaderboard`)
  ).body.entries;
  expect(entries[0]).toMatchObject({ displayName: "Player 0", score: 3 });
  expect(
    (await write(f.agents[0], "put", f.path + "/matches", { matches })).status,
  ).toBe(409);
  f.db.close();
});
it("denies guesses to nonanswerers but permits reading the reveal", async () => {
  const f = await ready(5);
  expect((await f.agents[4].get(f.path)).body.board).toBeUndefined();
  expect(
    (await write(f.agents[4], "put", f.path + "/matches", { matches: [] }))
      .status,
  ).toBe(403);
  f.setTime("2026-10-10T01:00:00Z");
  expect((await f.agents[4].get(f.path)).body.reveal.answers).toHaveLength(4);
  f.db.close();
});
it("enforces creator-only development controls and respects under-four scoring", async () => {
  const f = await groupFixture(3);
  const path = `/api/groups/${f.group.id}/dev/round`;
  expect(
    (await write(f.agents[1], "post", path, { action: "start" })).status,
  ).toBe(403);
  expect(
    (await write(f.agents[0], "post", path, { action: "start" })).status,
  ).toBe(201);
  for (const a of f.agents)
    await write(a, "put", `/api/groups/${f.group.id}/round/answer`, {
      text: "Hi",
    });
  expect(
    (await write(f.agents[0], "post", path, { action: "guess" })).status,
  ).toBe(200);
  const result = (await f.agents[0].get(`/api/groups/${f.group.id}/round`))
    .body;
  expect(result.round.phase).toBe("revealed");
  expect(result.reveal.scored).toBe(false);
  f.db.close();
});
it("does not expose development routes when disabled", async () => {
  const f = await groupFixture(3, { devControls: false });
  expect(
    (
      await write(f.agents[0], "post", `/api/groups/${f.group.id}/dev/round`, {
        action: "start",
      })
    ).status,
  ).toBe(404);
  f.db.close();
});
