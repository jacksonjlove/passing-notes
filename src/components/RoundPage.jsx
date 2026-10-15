import MatchingBoard from "./MatchingBoard.jsx";
import Reveal from "./Reveal.jsx";
import Leaderboard from "./Leaderboard.jsx";
import React, { useEffect, useState } from "react";
import { api, localTime } from "../api.js";
import Icon from "./Icon.jsx";
import AnswerForm from "./AnswerForm.jsx";
import GroupSettings from "./GroupSettings.jsx";
export default function RoundPage({ group, user, onBack, onUpdate }) {
  const [tab, setTab] = useState("today"),
    [view, setView] = useState(null),
    [error, setError] = useState(""),
    [entries, setEntries] = useState([]);
  const base = `/groups/${group.id}`;
  async function refresh() {
    try {
      const [v, l] = await Promise.all([
        api(base + "/round"),
        api(base + "/leaderboard"),
      ]);
      setView(v);
      setEntries(l.entries);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    let alive = true;
    const update = () => {
      if (alive && document.visibilityState !== "hidden") refresh();
    };
    refresh();
    const interval = setInterval(update, 15000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      alive = false;
      clearInterval(interval);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [group.id]);
  async function test(action) {
    try {
      await api(base + "/dev/round", { method: "POST", body: { action } });
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  }
  const round = view?.round;
  return (
    <>
      <button className="text-button back-link" onClick={onBack}>
        <Icon name="back" size={16} />
        All notebooks
      </button>
      <div className="page-heading group-heading">
        <div>
          <span className="eyebrow">Your daily little mystery</span>
          <h1>{group.name}</h1>
          <p className="muted">
            <Icon name="group" size={16} />
            {view?.memberCount ?? group.memberCount}{" "}
            {(view?.memberCount ?? group.memberCount) === 1
              ? "person"
              : "people"}{" "}
            · {group.timeZone}
          </p>
        </div>
        <span className="group-sticker">just between us</span>
      </div>
      <nav className="tabs" aria-label="Group pages">
        <button
          className={tab === "today" ? "active" : ""}
          onClick={() => setTab("today")}
        >
          Today’s note
        </button>
        <button
          className={tab === "scores" ? "active" : ""}
          onClick={() => setTab("scores")}
        >
          Leaderboard
        </button>
        {group.role === "creator" && (
          <button
            className={tab === "settings" ? "active" : ""}
            onClick={() => setTab("settings")}
          >
            Group settings
          </button>
        )}
      </nav>
      {error && (
        <div className="error" role="alert">
          {error}
          <button className="text-button" onClick={refresh}>
            Retry
          </button>
        </div>
      )}
      {tab === "settings" ? (
        <GroupSettings group={group} onUpdate={onUpdate} onDelete={onBack} />
      ) : tab === "scores" ? (
        <Leaderboard entries={entries} />
      ) : !view ? (
        <p className="loading">Opening today’s page…</p>
      ) : !round ? (
        <section className="paper waiting">
          <Icon name="clock" size={36} />
          <h2>A new page is on its way.</h2>
          <p className="muted">
            {(view?.memberCount ?? group.memberCount) < 3
              ? "Your group needs at least three members to start a daily game."
              : "Your first prompt arrives at the next midnight in your group’s time zone."}
          </p>
          {group.role === "creator" && (
            <button
              className="button secondary"
              onClick={() => setTab("settings")}
            >
              Invite your people
              <Icon name="arrow" />
            </button>
          )}
        </section>
      ) : (
        <>
          <div className="round-meta">
            <span className={"phase-badge " + round.phase}>
              {round.phase === "answering"
                ? "01 · Leave a note"
                : round.phase === "guessing"
                  ? "02 · Make your guesses"
                  : "03 · Open the notes"}
            </span>
            <span>
              <Icon name="clock" size={16} />
              {round.phase === "answering"
                ? `Answers close ${localTime(round.answerDeadline)}`
                : round.phase === "guessing"
                  ? `Reveal at ${localTime(round.revealAt)}`
                  : "The mystery is out"}
            </span>
          </div>
          <section className="prompt-paper">
            <span className="eyebrow">
              {round.isTest ? "Practice prompt" : "Today’s prompt"}
            </span>
            <h2>{round.prompt}</h2>
            <span className="prompt-scribble">what would you say?</span>
          </section>
          {round.phase === "answering" ? (
            <div className="answer-layout">
              <section className="paper writing-paper">
                {view.eligible ? (
                  <AnswerForm
                    key={round.id}
                    draftKey={`pn-answer-${user.id}-${round.id}`}
                    initialText={view.ownAnswer?.text || ""}
                    onSave={async (text) => {
                      await api(base + "/round/answer", {
                        method: "PUT",
                        body: { text },
                      });
                      refresh();
                    }}
                  />
                ) : (
                  <div>
                    <h2>Your seat is saved.</h2>
                    <p>
                      You joined after this round began. You can answer tomorrow
                      and read today’s notes after the reveal.
                    </p>
                  </div>
                )}
              </section>
              <aside className="participation">
                <span className="eyebrow">Around the table</span>
                <div className="participation-number">
                  {view.participation.answered}
                  <span> / {view.participation.total}</span>
                </div>
                <p>notes passed so far</p>
                <div className="progress-track">
                  <span
                    style={{
                      width: `${view.participation.total ? (view.participation.answered / view.participation.total) * 100 : 0}%`,
                    }}
                  />
                </div>
                <p className="small muted">
                  Three answers make a scored round. With fewer, we’ll simply
                  open the notes when answers close.
                </p>
              </aside>
            </div>
          ) : round.phase === "guessing" ? (
            view.board ? (
              <MatchingBoard
                key={round.id}
                draftKey={`pn-matches-${user.id}-${round.id}`}
                board={view.board}
                onSave={(matches) =>
                  api(base + "/round/matches", {
                    method: "PUT",
                    body: { matches },
                  })
                }
              />
            ) : (
              <section className="paper waiting">
                <h2>The guessing is underway.</h2>
                <p className="muted">
                  Only people who answered can match this round. Come back at{" "}
                  {localTime(round.revealAt)} to read the notes.
                </p>
              </section>
            )
          ) : (
            <Reveal reveal={view.reveal} userId={user.id} />
          )}
        </>
      )}
      {view?.devControls && (
        <details className="dev-panel">
          <summary>Local testing controls</summary>
          <p className="small muted">
            Try a round without waiting. These controls are only enabled for
            local testing.
          </p>
          <div className="button-row">
            <button
              className="button secondary"
              disabled={round && round.phase !== "revealed"}
              onClick={() => test("start")}
            >
              Start test round
            </button>
            <button
              className="button secondary"
              disabled={!round?.isTest || round.phase !== "answering"}
              onClick={() => test("guess")}
            >
              Close answers
            </button>
            <button
              className="button secondary"
              disabled={!round?.isTest || round.phase === "revealed"}
              onClick={() => test("reveal")}
            >
              Reveal notes
            </button>
          </div>
        </details>
      )}
    </>
  );
}
