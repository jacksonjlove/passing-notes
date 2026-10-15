import React, { useState } from "react";
export default function AnswerForm({
  initialText = "",
  onSave,
  disabled = false,
  draftKey,
}) {
  const [value, setValue] = useState(() => {
    try {
      return localStorage.getItem(draftKey) || initialText;
    } catch {
      return initialText;
    }
  });
  const [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const count = [...value.trim()].length;
  async function save(e) {
    e?.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave(value);
      setStatus("Your note is saved.");
      try {
        localStorage.removeItem(draftKey);
      } catch {}
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="answer-form">
      <label htmlFor="your-note" className="eyebrow">
        Your note
      </label>
      <textarea
        id="your-note"
        placeholder="Something only you would say…"
        value={value}
        disabled={disabled || busy}
        onChange={(e) => {
          setValue(e.target.value);
          setStatus("");
          try {
            localStorage.setItem(draftKey, e.target.value);
          } catch {}
        }}
      />
      <div className="form-foot">
        <span className={count > 200 ? "error-text" : "muted"}>
          {count} / 200
        </span>
        <button
          className="button primary"
          disabled={disabled || busy || count < 1 || count > 200}
        >
          {busy ? "Saving…" : initialText ? "Save changes" : "Save note"}
        </button>
      </div>
      {status && (
        <p className="success" role="status">
          {status}
        </p>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
          <button
            type="button"
            className="text-button"
            onClick={save}
            disabled={disabled || busy}
          >
            Retry
          </button>
        </div>
      )}
      <p className="small muted">
        You can edit your note until matching begins. Keep your identity a
        secret!
      </p>
    </form>
  );
}
