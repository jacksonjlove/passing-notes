import React, { useState } from "react";
import { api } from "../api.js";
import Icon from "./Icon.jsx";
export default function AccountForm({ onSignedIn, invite }) {
  const [register, setRegister] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const result = await api("/auth/" + (register ? "register" : "login"), {
        method: "POST",
        body: data,
      });
      onSignedIn(result.user);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="welcome">
      <div className="welcome-copy">
        <span className="eyebrow">
          A daily guessing game for your friend group
        </span>
        <h1>
          Your friends wrote these notes. <em>Can you tell who wrote which?</em>
        </h1>
        <p>
          Every day, your private group answers one question anonymously. Match
          each answer to a friend, then return for the reveal. Each correct
          match earns a point.
        </p>
        <section className="landing-example" aria-label="Example round">
          <span className="eyebrow">Picture a round like this</span>
          <p className="example-question">What’s your useless superpower?</p>
          <blockquote>“Knowing exactly when the toast will pop.”</blockquote>
          <div className="example-guess">
            <strong>Who wrote it?</strong>
            <span>Alex · Sam · Jordan</span>
          </div>
        </section>
        <ol className="landing-steps" aria-label="How to play">
          <li>
            <strong>Answer</strong>
            <span>The daily question.</span>
          </li>
          <li>
            <strong>Match</strong>
            <span>Friends to their anonymous answers.</span>
          </li>
          <li>
            <strong>Reveal</strong>
            <span>Who said what and see your score.</span>
          </li>
        </ol>
      </div>
      <section className="paper auth-paper">
        <span className="eyebrow">Your seat at the table</span>
        <h2>{register ? "Make yourself a name." : "Welcome back."}</h2>
        <p className="muted">
          {invite
            ? "You have an invitation waiting. Sign in or create a profile to join."
            : "Sign in, leave a note, and let the guessing begin."}
        </p>
        <form onSubmit={submit} className="stack">
          <label>
            Username
            <input
              name="username"
              autoComplete="username"
              required
              minLength={3}
              maxLength={30}
              pattern="[A-Za-z0-9_-]+"
              placeholder="your_username"
            />
          </label>
          {register && (
            <label>
              Display name
              <input
                name="displayName"
                autoComplete="nickname"
                maxLength={40}
                required
                placeholder="What your friends call you"
              />
            </label>
          )}
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              minLength={register ? 8 : undefined}
              maxLength={128}
              autoComplete={register ? "new-password" : "current-password"}
              placeholder="Your little secret"
            />
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? "One moment…" : register ? "Create profile" : "Sign in"}
            <Icon name="arrow" />
          </button>
        </form>
        <p className="small auth-switch">
          {register ? "Already have a profile?" : "New to the notebook?"}{" "}
          <button
            className="text-button"
            onClick={() => {
              setRegister(!register);
              setError("");
            }}
          >
            {register ? "Sign in" : "Create a profile"}
          </button>
        </p>
        <div className="auth-foot">
          <Icon name="note" />
          <span>We’ll remember you on this device.</span>
        </div>
      </section>
    </div>
  );
}
