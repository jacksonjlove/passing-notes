import { randomInt } from "node:crypto";
import { builtInPrompts } from "./data/prompts.js";
export async function selectPrompt(db, groupId) {
  const { rows: custom } = await db.query(
    "SELECT id,text FROM custom_prompts WHERE group_id=$1",
    [groupId],
  );
  const { rows: usages } = await db.query(
    "SELECT prompt_id,used_at FROM prompt_usage WHERE group_id=$1",
    [groupId],
  );
  const pool = [...builtInPrompts, ...custom];
  const uses = new Map(usages.map((r) => [r.prompt_id, r.used_at]));
  const oldest = Math.min(...pool.map((p) => uses.get(p.id) || 0));
  const choices = pool.filter((p) => (uses.get(p.id) || 0) === oldest);
  return choices[randomInt(choices.length)];
}
