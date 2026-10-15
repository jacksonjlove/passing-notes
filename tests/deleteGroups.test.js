import { it, expect } from "vitest";
import request from "supertest";
import { groupFixture, write } from "./helpers.js";
it("only the creator can delete a group after confirming its name", async () => {
  const f = await groupFixture(3),
    path = `/api/groups/${f.group.id}`;
  expect(
    (await write(request(f.app), "delete", path, { name: f.group.name }))
      .status,
  ).toBe(401);
  expect(
    (await write(f.agents[1], "delete", path, { name: f.group.name })).status,
  ).toBe(403);
  expect(
    (await write(f.agents[0], "delete", path, { name: "wrong" })).status,
  ).toBe(400);
  expect(
    (await f.db.query("SELECT id FROM groups WHERE id=$1", [f.group.id])).rows,
  ).toHaveLength(1);
  expect(
    (await write(f.agents[0], "delete", path, { name: f.group.name })).status,
  ).toBe(200);
  expect((await f.agents[1].get("/api/groups")).body.groups).toHaveLength(0);
  expect(
    (
      await write(f.agents[2], "post", "/api/invitations/join", {
        code: f.code,
      })
    ).status,
  ).toBe(404);
});
it("removes all dependent round data while preserving player accounts and other groups", async () => {
  const f = await groupFixture(3),
    owner = f.agents[0];
  const other = await write(owner, "post", "/api/groups", {
    name: "Keep this group",
    timeZone: "America/Detroit",
    answerTime: "17:00",
    revealTime: "21:00",
  });
  await write(owner, "post", `/api/groups/${f.group.id}/prompts`, {
    text: "A custom question?",
  });
  await write(owner, "post", `/api/groups/${f.group.id}/dev/round`, {
    action: "start",
  });
  const {
    rows: [round],
  } = await f.db.query("SELECT id FROM rounds WHERE group_id=$1", [f.group.id]);
  const user = f.users[0].id;
  await f.db.query("INSERT INTO answers VALUES($1,$2,$3,$4)", [
    "answer-id",
    round.id,
    user,
    "Test answer",
  ]);
  await f.db.query("INSERT INTO round_boards VALUES($1,$2,$3)", [
    round.id,
    user,
    "[]",
  ]);
  await f.db.query("INSERT INTO guesses VALUES($1,$2,$3,$4)", [
    round.id,
    user,
    "answer-id",
    f.users[1].id,
  ]);
  await f.db.query("INSERT INTO round_scores VALUES($1,$2,$3)", [
    round.id,
    user,
    1,
  ]);
  expect(
    (
      await write(owner, "delete", `/api/groups/${f.group.id}`, {
        name: f.group.name,
      })
    ).status,
  ).toBe(200);
  for (const table of [
    "rounds",
    "round_participants",
    "answers",
    "round_boards",
    "guesses",
    "round_scores",
    "custom_prompts",
    "prompt_usage",
    "invitations",
  ])
    expect((await f.db.query(`SELECT * FROM ${table}`)).rows).toHaveLength(0);
  expect((await f.db.query("SELECT * FROM accounts")).rows).toHaveLength(3);
  expect((await f.db.query("SELECT id FROM groups")).rows).toEqual([
    { id: other.body.group.id },
  ]);
});
it("rolls back dependent cleanup if deletion cannot complete", async () => {
  const f = await groupFixture(3),
    id = f.group.id;
  await f.db.query(
    "CREATE FUNCTION prevent_group_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Test cleanup failure'; END $$",
  );
  await f.db.query(
    "CREATE TRIGGER prevent_delete BEFORE DELETE ON groups FOR EACH ROW EXECUTE FUNCTION prevent_group_delete()",
  );
  expect(
    (
      await write(f.agents[0], "delete", `/api/groups/${id}`, {
        name: f.group.name,
      })
    ).status,
  ).toBe(500);
  expect(
    (await f.db.query("SELECT id FROM groups WHERE id=$1", [id])).rows,
  ).toHaveLength(1);
  expect(
    (await f.db.query("SELECT * FROM memberships WHERE group_id=$1", [id]))
      .rows,
  ).toHaveLength(3);
  expect(
    (await f.db.query("SELECT * FROM invitations WHERE group_id=$1", [id]))
      .rows,
  ).toHaveLength(1);
});
it("serializes deletion with joining so no orphaned membership survives", async () => {
  const f = await groupFixture(3);
  const created = await write(f.agents[0], "post", "/api/groups", {
    name: "Race group",
    timeZone: "America/Detroit",
    answerTime: "17:00",
    revealTime: "21:00",
  });
  const g = created.body.group;
  const invite = await write(
    f.agents[0],
    "post",
    `/api/groups/${g.id}/invitations`,
  );
  const [removed, joined] = await Promise.all([
    write(f.agents[0], "delete", `/api/groups/${g.id}`, { name: g.name }),
    write(f.agents[1], "post", "/api/invitations/join", {
      code: invite.body.code,
    }),
  ]);
  expect(removed.status).toBe(200);
  expect([200, 404]).toContain(joined.status);
  expect(
    (await f.db.query("SELECT * FROM memberships WHERE group_id=$1", [g.id]))
      .rows,
  ).toHaveLength(0);
});
