import React from "react";
export default function Leaderboard({ entries = [] }) {
  const duplicate = (name) =>
    entries.filter((e) => e.displayName === name).length > 1;
  return (
    <section className="paper score-paper">
      <span className="eyebrow">A little friendly competition</span>
      <h2>Know your people.</h2>
      <p className="muted">
        Every correct match adds one point. A good reason to keep passing notes.
      </p>
      <div className="score-header">
        <span>Name</span>
        <span>Total score</span>
      </div>
      {entries.map((e) => (
        <div key={e.id} className="score-row">
          <span className="score-person">
            <span className="avatar">{e.displayName.slice(0, 1)}</span>
            <span>
              {e.displayName}
              {duplicate(e.displayName) && <small>@{e.username}</small>}
            </span>
          </span>
          <strong>{e.score}</strong>
        </div>
      ))}
      {!entries.length && (
        <p className="muted small">Your group’s scores will appear here.</p>
      )}
    </section>
  );
}
