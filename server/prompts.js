import { randomInt } from "node:crypto";
import { builtInPrompts } from "./data/prompts.js";
export function selectPrompt(db, groupId) {
  const pool = [
    ...builtInPrompts,
    ...db
      .prepare("SELECT id,text FROM custom_prompts WHERE group_id=?")
      .all(groupId),
  ];
  const uses = new Map(
    db
      .prepare("SELECT prompt_id,used_at FROM prompt_usage WHERE group_id=?")
      .all(groupId)
      .map((r) => [r.prompt_id, r.used_at]),
  );
  const oldest = Math.min(...pool.map((p) => uses.get(p.id) || 0));
  const choices = pool.filter((p) => (uses.get(p.id) || 0) === oldest);
  return choices[randomInt(choices.length)];
}
