import { it, expect } from "vitest";
import request from "supertest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../server/db.js";
import { createApp } from "../server/app.js";
import { groupFixture, write, origin } from "./helpers.js";
it("preserves sessions, answers, guesses and totals after restarting the database", async () => {
  const folder = mkdtempSync(join(tmpdir(), "passing-notes-"));
  const path = join(folder, "test.sqlite");
  let db = openDatabase(path);
  try {
    const f = await groupFixture(4, { db });
    const roundPath = `/api/groups/${f.group.id}/round`;
    f.setTime("2026-10-09T14:00:00Z");
    for (let i = 0; i < 4; i++)
      await write(f.agents[i], "put", roundPath + "/answer", {
        text: `Note ${i}`,
      });
    const board = (await f.agents[0].get(roundPath)).body.board;
    const matches = board.answers
      .slice(0, 2)
      .map((a) => ({
        answerId: a.id,
        personId: f.users[Number(a.text.slice(-1))].id,
      }));
    await write(f.agents[0], "put", roundPath + "/matches", { matches });
    const login = await write(f.agents[0], "post", "/api/auth/login", {
      username: "player0",
      password: "test-password",
    });
    const cookie = login.headers["set-cookie"][0].split(";")[0];
    db.close();
    db = openDatabase(path);
    const app = createApp({
      db,
      now: () => Date.parse("2026-10-10T01:00:00Z"),
    });
    const client = request(app);
    expect(
      (await client.get("/api/auth/me").set("Cookie", cookie)).body.user.id,
    ).toBe(f.users[0].id);
    const result = await client.get(roundPath).set("Cookie", cookie);
    expect(result.body.reveal.answers).toHaveLength(4);
    expect(
      result.body.reveal.results.find((r) => r.user.id === f.users[0].id).score,
    ).toBe(2);
    for (let i = 0; i < 3; i++)
      await client.get(roundPath).set("Cookie", cookie);
    expect(
      (
        await client
          .get(`/api/groups/${f.group.id}/leaderboard`)
          .set("Cookie", cookie)
      ).body.entries[0].score,
    ).toBe(2);
    const row = db
      .prepare("SELECT password_hash FROM accounts WHERE id=?")
      .get(f.users[0].id);
    expect(row.password_hash).not.toContain("test-password");
  } finally {
    db.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
it("refuses expired sessions", async () => {
  const f = await groupFixture(3);
  f.setTime("2026-12-01T14:00:00Z");
  expect((await f.agents[0].get("/api/auth/me")).status).toBe(401);
  f.db.close();
});
