import React, { useState } from "react";
import { api } from "../api.js";
import Icon from "./Icon.jsx";
export default function GroupList({ groups, onOpen, onRefresh, user, invite }) {
  const [mode, setMode] = useState(invite ? "join" : null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const zone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Detroit";
  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const fields = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const data = await api(
        mode === "create" ? "/groups" : "/invitations/join",
        { method: "POST", body: fields },
      );
      if (mode === "join") history.replaceState(null, "", location.pathname);
      setMode(null);
      await onRefresh();
      onOpen(data.group.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Your little circles</span>
          <h1>
            The more, <em>the merrier.</em>
          </h1>
          <p className="muted">
            A separate notebook for every group of people you love.
          </p>
        </div>
        <button
          className="button primary"
          onClick={() => {
            setMode("create");
            setError("");
          }}
        >
          <Icon name="plus" />
          New group
        </button>
      </div>
      <div className="section-line">
        <h2>
          My notebooks <span className="count">{groups.length}</span>
        </h2>
        <button
          className="text-button"
          onClick={() => {
            setMode("join");
            setError("");
          }}
        >
          Have an invite? Join a group <Icon name="arrow" size={16} />
        </button>
      </div>
      {mode && (
        <section className="paper create-panel">
          <div className="section-line">
            <h2>
              {mode === "create" ? "Start a new notebook" : "Pull up a chair"}
            </h2>
            <button className="text-button" onClick={() => setMode(null)}>
              Close
            </button>
          </div>
          <form className="stack" onSubmit={submit}>
            {mode === "join" ? (
              <label>
                Invitation code
                <input
                  name="code"
                  defaultValue={invite || ""}
                  required
                  placeholder="Paste the code your friend shared"
                />
              </label>
            ) : (
              <>
                <label>
                  Group name
                  <input
                    name="name"
                    maxLength={60}
                    required
                    placeholder="The lunch table"
                  />
                </label>
                <label>
                  Group time zone
                  <input
                    name="timeZone"
                    defaultValue={zone}
                    required
                    list="time-zones"
                  />
                  <datalist id="time-zones">
                    {[
                      "America/Detroit",
                      "America/New_York",
                      "America/Chicago",
                      "America/Denver",
                      "America/Los_Angeles",
                      "Europe/London",
                      "UTC",
                    ].map((z) => (
                      <option key={z} value={z} />
                    ))}
                  </datalist>
                </label>
                <div className="two-fields">
                  <label>
                    Answers close
                    <input
                      type="time"
                      name="answerTime"
                      defaultValue="17:00"
                      required
                    />
                  </label>
                  <label>
                    Notes reveal
                    <input
                      type="time"
                      name="revealTime"
                      defaultValue="21:00"
                      required
                    />
                  </label>
                </div>
                <p className="small muted">
                  A fresh prompt at midnight. Choose times in your group’s time
                  zone.
                </p>
              </>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary" disabled={busy}>
              {busy
                ? "Saving…"
                : mode === "create"
                  ? "Create notebook"
                  : "Join notebook"}
              <Icon name="arrow" />
            </button>
          </form>
        </section>
      )}
      {groups.length ? (
        <div className="notebook-grid">
          {groups.map((g, i) => (
            <button
              className={"notebook cover-" + (i % 4)}
              key={g.id}
              onClick={() => onOpen(g.id)}
            >
              <div className="binding" />
              <div className="cover-top">
                <Icon name="group" size={28} />
                <span className="badge">
                  {g.role === "creator" ? "Your group" : "Member"}
                </span>
              </div>
              <h3>{g.name}</h3>
              <p>
                {g.memberCount} {g.memberCount === 1 ? "person" : "people"} ·
                One daily mystery
              </p>
              <div className="cover-bottom">
                <span>
                  {g.currentPhase
                    ? {
                        answering: "Leave your note",
                        guessing: "Time to match",
                        revealed: "The notes are open",
                      }[g.currentPhase]
                    : g.memberCount < 3
                      ? "Invite a few friends"
                      : "Ready for a daily round"}
                </span>
                <Icon name="arrow" />
              </div>
            </button>
          ))}
        </div>
      ) : (
        <section className="empty-notebooks">
          <div className="empty-icon">
            <Icon name="note" size={40} />
          </div>
          <h2>A blank page. A good beginning.</h2>
          <p className="muted">
            Create a notebook for your friends, or join one with an invitation.
          </p>
          <button
            className="button secondary"
            onClick={() => setMode("create")}
          >
            Start your first group
            <Icon name="plus" />
          </button>
        </section>
      )}
      <aside className="how-it-works">
        <span className="eyebrow">The daily ritual</span>
        <div>
          <p>
            <b>01</b>
            <strong>Leave a note</strong>
            <span>One prompt. Your answer.</span>
          </p>
          <p>
            <b>02</b>
            <strong>Make your guesses</strong>
            <span>Match the voices you know.</span>
          </p>
          <p>
            <b>03</b>
            <strong>Open the notes</strong>
            <span>Find out who said what.</span>
          </p>
        </div>
      </aside>
    </>
  );
}
