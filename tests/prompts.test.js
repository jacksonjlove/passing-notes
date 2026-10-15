import { it, expect } from "vitest";
import { selectPrompt } from "../server/prompts.js";
import { fixture, write } from "./helpers.js";
it("exhausts unused prompts before repeating", async () => {
  const f = await fixture(1);
  const made = await write(f.agents[0], "post", "/api/groups", {
    name: "Test",
    timeZone: "UTC",
    answerTime: "17:00",
    revealTime: "21:00",
  });
  const id = made.body.group.id;
  const seen = new Set();
  for (let i = 0; i < 32; i++) {
    const p = await selectPrompt(f.db, id);
    expect(seen.has(p.id)).toBe(false);
    seen.add(p.id);
    await f.db.query("INSERT INTO prompt_usage VALUES($1,$2,$3)", [
      id,
      p.id,
      i + 1,
    ]);
  }
  expect((await selectPrompt(f.db, id)).id).toBe([...seen][0]);
  await f.dispose();
});
