import { it, expect } from "vitest";
import { fixture, write } from "./helpers.js";
it("permits invited joins across groups and protects creator settings", async () => {
  const f = await fixture(3),
    [owner, member, outsider] = f.agents;
  const created = await write(owner, "post", "/api/groups", {
    name: "Family",
    timeZone: "America/Detroit",
    answerTime: "17:00",
    revealTime: "21:00",
  });
  expect(created.status).toBe(201);
  const id = created.body.group.id;
  const invitation = await write(
    owner,
    "post",
    `/api/groups/${id}/invitations`,
  );
  expect(invitation.status).toBe(201);
  expect(
    (
      await write(member, "post", "/api/invitations/join", {
        code: invitation.body.code,
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await write(member, "post", "/api/invitations/join", {
        code: invitation.body.code,
      })
    ).status,
  ).toBe(200);
  expect((await member.get("/api/groups")).body.groups).toHaveLength(1);
  expect(
    (
      await write(member, "patch", `/api/groups/${id}/settings`, {
        answerTime: "16:00",
      })
    ).status,
  ).toBe(403);
  expect((await outsider.get(`/api/groups/${id}/settings`)).status).toBe(404);
  expect(
    (
      await write(owner, "patch", `/api/groups/${id}/settings`, {
        answerTime: "16:00",
      })
    ).status,
  ).toBe(200);
  const settings = (await owner.get(`/api/groups/${id}/settings`)).body
    .settings;
  expect(settings.answerTime).toBe("17:00");
  expect(settings.pending.answerTime).toBe("16:00");
  expect(
    (
      await write(member, "post", `/api/groups/${id}/prompts`, {
        text: "What is your secret superpower?",
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await write(owner, "post", `/api/groups/${id}/prompts`, {
        text: "What is your secret superpower?",
      })
    ).status,
  ).toBe(201);
  await write(
    owner,
    "delete",
    `/api/groups/${id}/invitations/${invitation.body.id}`,
  );
  expect(
    (
      await write(outsider, "post", "/api/invitations/join", {
        code: invitation.body.code,
      })
    ).status,
  ).toBe(404);
  await f.dispose();
});
it("rejects invalid schedules and empty prompts", async () => {
  const f = await fixture(1),
    a = f.agents[0];
  for (const fields of [
    { timeZone: "Bad/Zone" },
    { answerTime: "21:00", revealTime: "17:00" },
    { answerTime: "25:00" },
  ])
    expect(
      (
        await write(a, "post", "/api/groups", {
          name: "Group",
          timeZone: "America/Detroit",
          answerTime: "17:00",
          revealTime: "21:00",
          ...fields,
        })
      ).status,
    ).toBe(400);
  await f.dispose();
});
