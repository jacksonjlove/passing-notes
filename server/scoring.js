export function finalizeRound(db, roundId, nowMs) {
  return db.transaction(() => {
    const round = db.prepare("SELECT * FROM rounds WHERE id=?").get(roundId);
    if (!round || round.finalized) return;
    const answers = db
      .prepare("SELECT * FROM answers WHERE round_id=?")
      .all(roundId);
    const scored = answers.length >= 4;
    if (scored)
      for (const answer of answers) {
        const score = db
          .prepare(
            "SELECT count(*) AS n FROM guesses g JOIN answers a ON a.id=g.answer_id AND a.round_id=g.round_id WHERE g.round_id=? AND g.guesser_id=? AND a.account_id=g.person_id AND a.account_id!=g.guesser_id",
          )
          .get(roundId, answer.account_id).n;
        db.prepare("INSERT INTO round_scores VALUES(?,?,?)").run(
          roundId,
          answer.account_id,
          score,
        );
      }
    db.prepare(
      "UPDATE rounds SET phase='revealed',scored=?,finalized=1 WHERE id=?",
    ).run(Number(scored), roundId);
  })();
}
