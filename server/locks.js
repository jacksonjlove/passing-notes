import { fail } from "./errors.js";

export async function withGroupTransaction(db, groupId, callback) {
  return db.transaction(async (tx) => {
    const {
      rows: [group],
    } = await tx.query("SELECT * FROM groups WHERE id=$1 FOR UPDATE", [
      groupId,
    ]);
    if (!group) fail(404, "Group not found.");
    return callback(tx, group);
  });
}
