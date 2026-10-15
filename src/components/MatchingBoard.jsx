import React, { useState, useRef, useEffect } from "react";
import Icon from "./Icon.jsx";
export function assignName(assignments, answerId, personId) {
  const next = { ...assignments };
  const previous = next[answerId];
  const elsewhere = Object.keys(next).find((id) => next[id] === personId);
  if (elsewhere && elsewhere !== answerId) {
    if (previous) next[elsewhere] = previous;
    else delete next[elsewhere];
  }
  next[answerId] = personId;
  return next;
}
export default function MatchingBoard({
  board,
  onSave,
  disabled = false,
  draftKey,
}) {
  const initial = Object.fromEntries(
    board.matches.map((m) => [m.answerId, m.personId]),
  );
  const [matches, setMatches] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey));
      if (
        saved &&
        Object.keys(saved).every((id) =>
          board.answers.some((a) => a.id === id),
        ) &&
        Object.values(saved).every((id) =>
          board.people.some((p) => p.id === id),
        )
      )
        return saved;
    } catch {}
    return initial;
  });
  const [selected, setSelected] = useState(null),
    [status, setStatus] = useState("All your matches are saved."),
    [error, setError] = useState(""),
    [drag, setDrag] = useState(null),
    [announcement, setAnnouncement] = useState("");
  const desired = useRef(matches),
    revision = useRef(0),
    savedRevision = useRef(0),
    running = useRef(false),
    mounted = useRef(true),
    saveRef = useRef(onSave);
  saveRef.current = onSave;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function flush() {
    if (running.current || disabled) return;
    running.current = true;
    setError("");
    setStatus("Saving your matches…");
    try {
      do {
        const version = revision.current,
          values = { ...desired.current };
        await saveRef.current(
          Object.entries(values).map(([answerId, personId]) => ({
            answerId,
            personId,
          })),
        );
        savedRevision.current = version;
      } while (savedRevision.current !== revision.current && mounted.current);
      if (mounted.current) {
        setStatus("All your matches are saved.");
        try {
          localStorage.removeItem(draftKey);
        } catch {}
      }
    } catch (e) {
      if (mounted.current) {
        setError(e.message);
        setStatus("Your latest matches are not saved yet.");
      }
    } finally {
      running.current = false;
    }
  }
  function update(next) {
    if (disabled) return;
    desired.current = next;
    setMatches(next);
    revision.current++;
    try {
      localStorage.setItem(draftKey, JSON.stringify(next));
    } catch {}
    flush();
  }
  function assign(answerId, personId = selected) {
    if (!personId || disabled) return;
    update(assignName(desired.current, answerId, personId));
    setSelected(null);
    const p = board.people.find((p) => p.id === personId);
    setAnnouncement(`${p.displayName} assigned to the note.`);
  }
  const duplicates = new Set(
    board.people
      .filter(
        (p) =>
          board.people.filter((q) => q.displayName === p.displayName).length >
          1,
      )
      .map((p) => p.displayName),
  );
  function dragStart(e, p) {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({
      personId: p.id,
      name: p.displayName,
      x: e.clientX,
      y: e.clientY,
    });
  }
  function dragEnd(e) {
    if (drag && !disabled) {
      const target = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest("[data-answer-id]");
      if (target) assign(target.dataset.answerId, drag.personId);
    }
    setDrag(null);
  }
  // A recovered draft is saved again after mounting; it remains visible on failure.
  useEffect(() => {
    try {
      if (localStorage.getItem(draftKey)) {
        revision.current++;
        flush();
      }
    } catch {}
  }, []);
  return (
    <section>
      <div className="match-heading">
        <div>
          <h2>A familiar voice. A wild guess.</h2>
          <p className="muted">
            Pick a name, then a note. Or drag a name using its grip.
          </p>
        </div>
        <span className="match-count">
          {Object.keys(matches).length} / {board.answers.length}
        </span>
      </div>
      <div className="matching-layout">
        <aside className="name-bank">
          <span className="eyebrow">Who could it be?</span>
          <div className="name-slips">
            {board.people.map((p) => (
              <div
                key={p.id}
                className={
                  "person-slip" +
                  (selected === p.id ? " selected" : "") +
                  (Object.values(matches).includes(p.id) ? " used" : "")
                }
              >
                <button
                  type="button"
                  className="person-select"
                  aria-label={`Select ${p.displayName}${duplicates.has(p.displayName) ? " " + p.username : ""}`}
                  aria-pressed={selected === p.id}
                  disabled={disabled}
                  onClick={() => {
                    setSelected(selected === p.id ? null : p.id);
                    setAnnouncement(
                      `${p.displayName} selected. Choose a note.`,
                    );
                  }}
                >
                  <span className="avatar">{p.displayName.slice(0, 1)}</span>
                  <span>
                    {p.displayName}
                    {duplicates.has(p.displayName) && (
                      <small>@{p.username}</small>
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  className="drag-handle"
                  aria-label={`Drag ${p.displayName}`}
                  disabled={disabled}
                  onPointerDown={(e) => dragStart(e, p)}
                  onPointerMove={(e) => {
                    if (drag) setDrag({ ...drag, x: e.clientX, y: e.clientY });
                  }}
                  onPointerUp={dragEnd}
                  onPointerCancel={() => setDrag(null)}
                  tabIndex={-1}
                >
                  ⠿
                </button>
              </div>
            ))}
          </div>
          <p>
            Each name fits one note. Changing a match will move or swap the
            names.
          </p>
        </aside>
        <div className="answers-grid">
          {board.answers.map((a, i) => {
            const person = board.people.find((p) => p.id === matches[a.id]);
            return (
              <article key={a.id} className="answer-note" data-answer-id={a.id}>
                <span className="note-number">
                  note {String(i + 1).padStart(2, "0")}
                </span>
                <blockquote>{a.text}</blockquote>
                <button
                  type="button"
                  className={"match-slot" + (person ? " filled" : "")}
                  aria-label={`Assign to note ${i + 1}`}
                  disabled={disabled}
                  onClick={() => assign(a.id)}
                >
                  {person ? (
                    <>
                      <span>
                        {person.displayName}
                        {duplicates.has(person.displayName)
                          ? " · @" + person.username
                          : ""}
                      </span>
                      <Icon name="check" size={15} />
                    </>
                  ) : (
                    <>
                      <span>
                        {selected ? "Place selected name" : "Who said this?"}
                      </span>
                      <Icon name="plus" size={15} />
                    </>
                  )}
                </button>
                {person && (
                  <button
                    type="button"
                    className="text-button clear-match"
                    disabled={disabled}
                    onClick={() => {
                      const next = { ...desired.current };
                      delete next[a.id];
                      update(next);
                    }}
                  >
                    Clear
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </div>
      <p className="save-status" role="status">
        <Icon name="check" size={15} />
        {status}
      </p>
      {error && (
        <div className="error" role="alert">
          {error}
          <button type="button" className="text-button" onClick={flush}>
            Retry
          </button>
        </div>
      )}
      <p className="small muted">
        You can change your matches until the scheduled reveal. Empty slots earn
        no points.
      </p>
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
      {drag && (
        <div
          className="drag-ghost"
          style={{ left: drag.x + 12, top: drag.y + 12 }}
        >
          {drag.name}
        </div>
      )}
    </section>
  );
}
