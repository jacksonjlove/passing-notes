import request from "supertest";
import { afterEach } from "vitest";
import { createApp } from "../server/app.js";
import { createTestDatabase } from "./postgresFixture.js";
export const origin = "http://localhost:5174";
const activeDatabases = new Set();
afterEach(async () => {
  const databases = [...activeDatabases];
  activeDatabases.clear();
  await Promise.all(databases.map((database) => database.dispose()));
});
export async function fixture(count = 4, options = {}) {
  const database = options.database || (await createTestDatabase());
  activeDatabases.add(database);
  let time = Date.parse("2026-10-08T14:00:00Z");
  const app = createApp({
    db: database.db,
    now: () => time,
    devControls: true,
    ...options,
  });
  const agents = [],
    users = [];
  for (let i = 0; i < count; i++) {
    const agent = request.agent(app);
    const result = await agent
      .post("/api/auth/register")
      .set("Origin", origin)
      .send({
        username: `player${i}`,
        displayName: `Player ${i}`,
        password: "test-password",
      });
    agents.push(agent);
    users.push(result.body.user);
  }
  return {
    get db() {
      return database.db;
    },
    database,
    app,
    agents,
    users,
    setTime: (x) => {
      time = typeof x === "string" ? Date.parse(x) : x;
    },
    getTime: () => time,
    dispose: () => database.dispose(),
    reconnect: () => database.reconnect(),
  };
}
export const write = (agent, method, path, body = {}) =>
  agent[method](path).set("Origin", origin).send(body);
export async function groupFixture(count = 4, options = {}) {
  const f = await fixture(count, options);
  const made = await write(f.agents[0], "post", "/api/groups", {
    name: "The lunch table",
    timeZone: "America/Detroit",
    answerTime: "17:00",
    revealTime: "21:00",
  });
  f.group = made.body.group;
  if (!f.group)
    throw new Error("Group creation failed: " + JSON.stringify(made.body));
  const invite = await write(
    f.agents[0],
    "post",
    `/api/groups/${f.group.id}/invitations`,
  );
  f.code = invite.body.code;
  for (const agent of f.agents.slice(1))
    await write(agent, "post", "/api/invitations/join", { code: f.code });
  return f;
}
