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
it("waits until the answer deadline to reveal a three-person round", async () => {
  const f = await groupFixture(3);
  f.setTime("2026-10-09T14:00:00Z");
  const path = `/api/groups/${f.group.id}/round`;
  for (const a of f.agents)
    await write(a, "put", path + "/answer", { text: "Secret" });
  expect((await f.agents[0].get(path)).body.round?.phase).toBe("answering");
  f.setTime("2026-10-09T21:00:00Z");
  const view = (await f.agents[0].get(path)).body;
  expect(view.round.phase).toBe("revealed");
  expect(view.round.scored).toBe(false);
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
