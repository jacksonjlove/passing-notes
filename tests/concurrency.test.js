import { describe, expect, it } from "vitest";
import { groupFixture, write } from "./helpers.js";

describe("serialized game transitions", () => {
  it("serializes concurrent answers, board creation, guess replacement and reveal", async () => {
    const f = await groupFixture(3);
    const path = `/api/groups/${f.group.id}/round`;
    f.setTime("2026-10-09T14:00:00Z");

    const answerResults = await Promise.all(
      f.agents.map((agent, index) =>
        write(agent, "put", `${path}/answer`, { text: `Note ${index}` }),
      ),
    );
    expect(answerResults.map((result) => result.status)).toEqual([
      200, 200, 200,
    ]);

    const boardViews = await Promise.all(
      Array.from({ length: 8 }, () => f.agents[0].get(path)),
    );
    expect(boardViews.map((result) => result.status)).toEqual(
      Array(8).fill(200),
    );
    const initialBoard = boardViews[0].body.board;
    expect(initialBoard.answers).toHaveLength(2);
    expect(
      boardViews.every(
        (result) =>
          JSON.stringify(result.body.board.answers) ===
          JSON.stringify(initialBoard.answers),
      ),
    ).toBe(true);

    const [firstAnswer, secondAnswer] = initialBoard.answers;
    const [firstPerson, secondPerson] = initialBoard.people;
    const guessesA = [
      { answerId: firstAnswer.id, personId: firstPerson.id },
      { answerId: secondAnswer.id, personId: secondPerson.id },
    ];
    const guessesB = [
      { answerId: firstAnswer.id, personId: secondPerson.id },
      { answerId: secondAnswer.id, personId: firstPerson.id },
    ];
    const replacements = await Promise.all([
      write(f.agents[0], "put", `${path}/matches`, { matches: guessesA }),
      write(f.agents[0], "put", `${path}/matches`, { matches: guessesB }),
    ]);
    expect(replacements.map((result) => result.status)).toEqual([200, 200]);
    const finalBoard = (await f.agents[0].get(path)).body.board;
    const canonical = (matches) =>
      matches.map((match) => `${match.answerId}:${match.personId}`).sort();
    expect([canonical(guessesA), canonical(guessesB)]).toContainEqual(
      canonical(finalBoard.matches),
    );

    f.setTime("2026-10-10T01:00:00Z");
    const reveals = await Promise.all(
      Array.from({ length: 8 }, () => f.agents[0].get(path)),
    );
    expect(reveals.map((result) => result.status)).toEqual(Array(8).fill(200));
    expect(
      reveals.every((result) => result.body.round.phase === "revealed"),
    ).toBe(true);

    const scoreCount = await f.db.query(
      "SELECT count(*)::int AS n FROM round_scores WHERE round_id IN (SELECT id FROM rounds WHERE group_id=$1)",
      [f.group.id],
    );
    expect(scoreCount.rows[0].n).toBe(3);
    const totalsBefore = await f.db.query(
      "SELECT account_id,score FROM round_scores WHERE round_id IN (SELECT id FROM rounds WHERE group_id=$1) ORDER BY account_id",
      [f.group.id],
    );

    const lateAnswer = await write(f.agents[0], "put", `${path}/answer`, {
      text: "Too late",
    });
    expect(lateAnswer.status).toBe(409);
    const totalsAfter = await f.db.query(
      "SELECT account_id,score FROM round_scores WHERE round_id IN (SELECT id FROM rounds WHERE group_id=$1) ORDER BY account_id",
      [f.group.id],
    );
    expect(totalsAfter.rows).toEqual(totalsBefore.rows);

    const integrity = await f.db.query(
      "SELECT count(*)::int AS n FROM rounds WHERE group_id=$1 AND local_date='2026-10-09'",
      [f.group.id],
    );
    expect(integrity.rows[0].n).toBe(1);
  });

  it("does not create duplicate memberships when the same invitation is joined concurrently", async () => {
    const f = await groupFixture(4);
    const joinResults = await Promise.all(
      Array.from({ length: 6 }, () =>
        write(f.agents[3], "post", "/api/invitations/join", { code: f.code }),
      ),
    );
    expect(joinResults.every((result) => result.status === 200)).toBe(true);
    const membership = await f.db.query(
      "SELECT count(*)::int AS n FROM memberships WHERE group_id=$1 AND account_id=$2",
      [f.group.id, f.users[3].id],
    );
    expect(membership.rows[0].n).toBe(1);
  });

  it("does not allow a revoked invitation to add a membership", async () => {
    const f = await groupFixture(4);
    const created = await write(f.agents[0], "post", "/api/groups", {
      name: "Private table",
      timeZone: "America/Detroit",
      answerTime: "17:00",
      revealTime: "21:00",
    });
    const groupId = created.body.group.id;
    const invitation = await write(
      f.agents[0],
      "post",
      `/api/groups/${groupId}/invitations`,
    );
    await write(
      f.agents[0],
      "delete",
      `/api/groups/${groupId}/invitations/${invitation.body.id}`,
    );
    const joined = await write(f.agents[3], "post", "/api/invitations/join", {
      code: invitation.body.code,
    });
    expect(joined.status).toBe(404);
    const membership = await f.db.query(
      "SELECT count(*)::int AS n FROM memberships WHERE group_id=$1 AND account_id=$2",
      [groupId, f.users[3].id],
    );
    expect(membership.rows[0].n).toBe(0);
  });

  it("rejects an answer queued behind the group lock after the reveal deadline", async () => {
    const f = await groupFixture(3);
    const path = `/api/groups/${f.group.id}/round`;
    f.setTime("2026-10-09T14:00:00Z");
    const first = await write(f.agents[0], "put", `${path}/answer`, {
      text: "Already saved",
    });
    expect(first.status).toBe(200);

    const realTransaction = f.db.transaction.bind(f.db);
    let releaseLock;
    let markLockHeld;
    const lockHeld = new Promise((resolve) => (markLockHeld = resolve));
    const waitForRelease = new Promise((resolve) => (releaseLock = resolve));
    const lockTransaction = realTransaction(async (tx) => {
      await tx.query("SELECT id FROM groups WHERE id=$1 FOR UPDATE", [
        f.group.id,
      ]);
      markLockHeld();
      await waitForRelease;
    });
    await lockHeld;

    let markQueued;
    const queued = new Promise((resolve) => (markQueued = resolve));
    f.db.transaction = (callback) =>
      realTransaction((tx) =>
        callback({
          query(sql, values) {
            if (sql.includes("SELECT * FROM groups WHERE id=$1 FOR UPDATE"))
              markQueued();
            return tx.query(sql, values);
          },
        }),
      );

    const answerRequest = (async () =>
      await write(f.agents[1], "put", `${path}/answer`, {
        text: "Queued too late",
      }))();
    try {
      await queued;
      f.setTime("2026-10-10T01:00:00Z");
    } finally {
      releaseLock();
      await lockTransaction;
      f.db.transaction = realTransaction;
    }

    const answer = await answerRequest;
    expect(answer.status).toBe(409);
    const stored = await f.db.query(
      "SELECT count(*)::int AS n FROM answers WHERE round_id IN (SELECT id FROM rounds WHERE group_id=$1)",
      [f.group.id],
    );
    expect(stored.rows[0].n).toBe(1);
  });
});
