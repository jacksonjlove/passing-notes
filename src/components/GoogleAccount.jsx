import React, { useEffect, useState } from "react";
import { api } from "../api.js";
export default function GoogleAccount({ user, invite }) {
  const [config, setConfig] = useState(null),
    [open, setOpen] = useState(false),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    api("/auth/config")
      .then((data) => {
        if (active) setConfig(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user?.id]);
  async function start(link = false) {
    setBusy(true);
    setError("");
    try {
      const { url } = await api("/auth/google/start", {
        method: "POST",
        body: { link, password: link ? password : undefined, invite },
      });
      setPassword("");
      window.location.assign(url);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  if (!config?.google) return null;
  if (!user)
    return (
      <div className="stack">
        <button className="button" onClick={() => start()} disabled={busy}>
          {busy ? "Connecting…" : "Continue with Google"}
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p className="muted small">
          Or use your player username and password below.
        </p>
      </div>
    );
  return (
    <section className="stack">
      <button
        className="text-button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        Account
      </button>
      {open && (
        <div className="paper">
          <h2>Your account</h2>
          <p>
            Signed in as {user.displayName} (@{user.username}).
          </p>
          {config.linked ? (
            <p>Google is linked to this player account.</p>
          ) : (
            <>
              <p>
                Link Google to this player account to keep the same groups,
                answers and scores.
              </p>
              <form
                className="stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  start(true);
                }}
              >
                <label>
                  Confirm your current player password
                  <input
                    type="password"
                    autoComplete="current-password"
                    required
                    maxLength={128}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <button className="button" disabled={busy}>
                  {busy ? "Connecting…" : "Link Google"}
                </button>
              </form>
            </>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
