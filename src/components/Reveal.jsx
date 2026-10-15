import React from "react";
import Icon from "./Icon.jsx";
export default function Reveal({ reveal, userId }) {
  const own = reveal.results.find((r) => r.user.id === userId),
    winners = reveal.results.filter((r) => r.isWinner);
  return (
    <section>
      <div className="reveal-banner">
        <div>
          <span className="eyebrow">The mystery is out</span>
          <h2>
            {reveal.scored
              ? winners.length === 1
                ? `${winners[0].user.displayName} knows the group!`
                : "A shared win. Nicely guessed."
              : "A few notes, just for fun."}
          </h2>
          <p>
            {reveal.scored
              ? winners.length > 1
                ? `${winners.map((w) => w.user.displayName).join(", ")} share today’s win.`
                : "Your points have been added to the leaderboard."
              : "Fewer than three people answered, so this round awards no points."}
          </p>
        </div>
        {own && (
          <div className="your-score">
            {own.score}
            <span>Your points</span>
          </div>
        )}
      </div>
      <div className="reveal-grid">
        {reveal.answers.map((a, i) => {
          const guess = reveal.myMatches.find((m) => m.answerId === a.id);
          const isOwn = a.author.id === userId;
          const guessedPerson = reveal.answers.find(
            (x) => x.author.id === guess?.personId,
          )?.author;
          return (
            <article className="answer-note" key={a.id}>
              <span className="note-number">
                note {String(i + 1).padStart(2, "0")}
              </span>
              <blockquote>{a.text}</blockquote>
              <div className="author-label">
                <span className="avatar">
                  {a.author.displayName.slice(0, 1)}
                </span>
                <span>
                  {a.author.displayName} <small>@{a.author.username}</small>
                  {isOwn ? " · You" : ""}
                </span>
              </div>
              {reveal.scored && own && !isOwn && (
                <p
                  className={
                    "guess-result" + (guess?.correct ? "" : " incorrect")
                  }
                >
                  {guess?.correct ? (
                    <>
                      <Icon name="check" size={12} /> You got this one. +1
                    </>
                  ) : guess ? (
                    `You guessed ${guessedPerson?.displayName || "someone else"}.`
                  ) : (
                    "No guess saved for this note."
                  )}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
