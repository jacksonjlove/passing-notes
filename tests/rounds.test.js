import { it, expect } from "vitest";
import { groupFixture, write } from "./helpers.js";
it("locks four answers early, hiding authors until scheduled reveal", async () => {
  const f = await groupFixture(4);
  f.setTime("2026-10-09T14:00:00Z");
  const path = `/api/groups/${f.group.id}/round`;
  expect((await f.agents[0].get(path)).body.round?.phase).toBe("answering");
  for (let i = 0; i < 4; i++)
    expect(
      (await write(f.agents[i], "put", path + "/answer", { text: `Note ${i}` }))
        .status,
    ).toBe(200);
  const view = (await f.agents[0].get(path)).body;
  expect(view.round.phase).toBe("guessing");
  expect(view.reveal).toBeUndefined();
  expect(
    (
      await write(f.agents[0], "put", path + "/answer", {
        text: "Edit too late",
      })
    ).status,
  ).toBe(409);
  f.db.close();
});
it("scores three players, opens matching early, and keeps the fixed reveal", async () => {
  const f = await groupFixture(3);
  f.setTime("2026-10-09T14:00:00Z");
  const path = `/api/groups/${f.group.id}/round`;
  for (let i = 0; i < 3; i++)
    await write(f.agents[i], "put", path + "/answer", { text: `Note ${i}` });
  const view = (await f.agents[0].get(path)).body;
  expect(view.round.phase).toBe("guessing");
  expect(view.round.revealAt).toBe(Date.parse("2026-10-10T01:00:00Z"));
  expect(view.board.answers).toHaveLength(2);
  const matches = view.board.answers.map((a) => ({
    answerId: a.id,
    personId: f.users[Number(a.text.slice(-1))].id,
  }));
  expect(
    (await write(f.agents[0], "put", path + "/matches", { matches })).status,
  ).toBe(200);
  f.setTime("2026-10-10T01:00:00Z");
  const reveal = (await f.agents[0].get(path)).body;
  expect(reveal.reveal.scored).toBe(true);
  expect(
    reveal.reveal.results.find((r) => r.user.id === f.users[0].id).score,
  ).toBe(2);
  for (let i = 0; i < 2; i++)
    expect(
      (await f.agents[0].get(`/api/groups/${f.group.id}/leaderboard`)).body
        .entries[0].score,
    ).toBe(2);
  f.db.close();
});
it("opens matching at the deadline with three answers in a larger group", async () => {
  const f = await groupFixture(4);
  f.setTime("2026-10-09T14:00:00Z");
  const path = `/api/groups/${f.group.id}/round`;
  for (const a of f.agents.slice(0, 3))
    await write(a, "put", path + "/answer", { text: "Secret" });
  expect((await f.agents[0].get(path)).body.round.phase).toBe("answering");
  f.setTime("2026-10-09T21:00:00Z");
  expect((await f.agents[0].get(path)).body.round.phase).toBe("guessing");
  expect(
    (await write(f.agents[3], "put", path + "/matches", { matches: [] }))
      .status,
  ).toBe(403);
  f.db.close();
});
it("reveals two answers without points at the answer deadline", async () => {
  const f = await groupFixture(3);
  f.setTime("2026-10-09T14:00:00Z");
  const path = `/api/groups/${f.group.id}/round`;
  for (const a of f.agents.slice(0, 2))
    await write(a, "put", path + "/answer", { text: "Secret" });
  expect((await f.agents[0].get(path)).body.round.phase).toBe("answering");
  f.setTime("2026-10-09T21:00:00Z");
  const view = (await f.agents[0].get(path)).body;
  expect(view.round.phase).toBe("revealed");
  expect(view.reveal.scored).toBe(false);
  expect(view.reveal.results).toEqual([]);
  f.db.close();
});
it("requires three group members for daily and practice rounds", async () => {
  const f = await groupFixture(2);
  expect(
    (
      await write(f.agents[0], "post", `/api/groups/${f.group.id}/dev/round`, {
        action: "start",
      })
    ).status,
  ).toBe(409);
  f.setTime("2026-10-09T14:00:00Z");
  expect(
    (await f.agents[0].get(`/api/groups/${f.group.id}/round`)).body.round,
  ).toBeNull();
  f.db.close();
});
it("rejects blank/long answers and excludes a mid-round joiner", async () => {
  const f = await groupFixture(3);
  f.setTime("2026-10-09T14:00:00Z");
  const path = `/api/groups/${f.group.id}/round`;
  await f.agents[0].get(path);
  for (const text of ["", "x".repeat(201)])
    expect(
      (await write(f.agents[0], "put", path + "/answer", { text })).status,
    ).toBe(400);
  const agent = (await import("supertest")).default.agent(f.app);
  await write(agent, "post", "/api/auth/register", {
    username: "lateplayer",
    displayName: "Late",
    password: "test-password",
  });
  await write(agent, "post", "/api/invitations/join", { code: f.code });
  expect(
    (await write(agent, "put", path + "/answer", { text: "Late answer" }))
      .status,
  ).toBe(403);
  f.db.close();
});
