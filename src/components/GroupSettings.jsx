import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import Icon from "./Icon.jsx";
export default function GroupSettings({ group, onUpdate }) {
  const [settings, setSettings] = useState(group),
    [prompts, setPrompts] = useState([]),
    [invitations, setInvitations] = useState([]),
    [invite, setInvite] = useState(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const base = `/groups/${group.id}`;
  async function load() {
    const [s, p, i] = await Promise.all([
      api(base + "/settings"),
      api(base + "/prompts"),
      api(base + "/invitations"),
    ]);
    setSettings(s.settings);
    setPrompts(p.prompts);
    setInvitations(i.invitations);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [group.id]);
  async function act(work, success) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
      setMessage(success);
      await load();
      onUpdate?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function schedule(e) {
    e.preventDefault();
    const fields = Object.fromEntries(new FormData(e.currentTarget));
    act(
      () => api(base + "/settings", { method: "PATCH", body: fields }),
      "Schedule saved for tomorrow.",
    );
  }
  async function prompt(e) {
    e.preventDefault();
    const form = e.currentTarget,
      text = new FormData(form).get("text");
    await act(async () => {
      await api(base + "/prompts", { method: "POST", body: { text } });
      form.reset();
    }, "Prompt added to your collection.");
  }
  return (
    <div className="settings-grid">
      <section className="paper">
        <span className="eyebrow">Make room for your people</span>
        <h2>Pass an invitation.</h2>
        <p className="muted">
          Anyone with your invitation can sign in and join this group.
        </p>
        <button
          className="button primary"
          disabled={busy}
          onClick={() =>
            act(
              async () =>
                setInvite(
                  await api(base + "/invitations", {
                    method: "POST",
                    body: {},
                  }),
                ),
              "Invitation ready to share.",
            )
          }
        >
          <Icon name="plus" />
          Create invitation
        </button>
        {invite && (
          <div className="invite-box">
            <label>
              Invitation link
              <input
                readOnly
                value={`${location.origin}/?invite=${invite.code}`}
                onFocus={(e) => e.target.select()}
              />
            </label>
            <label>
              Invitation code
              <input
                readOnly
                value={invite.code}
                onFocus={(e) => e.target.select()}
              />
            </label>
            <p className="small muted">
              Select and copy either one to share with your friends.
            </p>
          </div>
        )}
        {invitations
          .filter((i) => !i.revoked)
          .map((i, n) => (
            <div className="list-row" key={i.id}>
              <span>Active invitation {n + 1}</span>
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    await api(base + "/invitations/" + i.id, {
                      method: "DELETE",
                      body: {},
                    });
                    if (invite?.id === i.id) setInvite(null);
                  }, "Invitation revoked.")
                }
              >
                Revoke
              </button>
            </div>
          ))}
      </section>
      <section className="paper">
        <span className="eyebrow">A rhythm that fits</span>
        <h2>The daily schedule.</h2>
        <form
          className="stack"
          onSubmit={schedule}
          key={JSON.stringify(settings.pending || settings)}
        >
          <label>
            Time zone
            <input
              name="timeZone"
              defaultValue={settings.pending?.timeZone || settings.timeZone}
              required
            />
          </label>
          <div className="two-fields">
            <label>
              Answers close
              <input
                type="time"
                name="answerTime"
                defaultValue={
                  settings.pending?.answerTime || settings.answerTime
                }
                required
              />
            </label>
            <label>
              Notes reveal
              <input
                type="time"
                name="revealTime"
                defaultValue={
                  settings.pending?.revealTime || settings.revealTime
                }
                required
              />
            </label>
          </div>
          <p className="small muted">
            Changes start tomorrow. Today’s deadlines stay the same.
          </p>
          {settings.pending && (
            <p className="small">
              New schedule starts {settings.pending.effectiveDate}.
            </p>
          )}
          <button className="button secondary" disabled={busy}>
            Save schedule
          </button>
        </form>
      </section>
      <section className="paper prompts-panel">
        <span className="eyebrow">A little more personal</span>
        <h2>Your own prompts.</h2>
        <p className="muted">
          Add an inside joke or a question only this group could answer. We’ll
          mix it with the built-in collection.
        </p>
        <form className="stack" onSubmit={prompt}>
          <label>
            Custom prompt
            <textarea
              name="text"
              required
              maxLength={300}
              placeholder="What is a sentence only this group would understand?"
            />
          </label>
          <button className="button secondary" disabled={busy}>
            Add prompt
            <Icon name="plus" />
          </button>
        </form>
        {prompts.map((p) => (
          <p className="custom-prompt" key={p.id}>
            {p.text}
          </p>
        ))}
      </section>
      {message && (
        <p className="success settings-message" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="error settings-message" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
