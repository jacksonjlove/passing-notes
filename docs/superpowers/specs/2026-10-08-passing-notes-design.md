# Passing Notes... — local app design

Date: October 8, 2026
Status: Approved in conversation; written spec awaiting review.

## Purpose and scope

Build a mobile-friendly, asynchronous daily guessing game for friends and family. Members of private groups answer a shared prompt, match anonymous answers to their authors, and return for a scheduled reveal. The first version runs locally with a React frontend, Node backend, and SQLite relational database. It belongs in `assignments/ps3/`; the submitted PS2 app remains intact.

Hosting, automatic deployment, Google integration, the class showcase, and production deployment documentation are later work. Local testing includes the full game and temporary accounts. Hosting choices will be established separately before deployment. A local instance alone does not provide remote access for friends.

## Accounts and authorization

- Register with a unique username, display name, and personal password. Store only a salted password hash. Display names need not be unique; matching cards must distinguish members with the same name.
- Keep players signed in using persistent server-backed sessions and an HTTP-only cookie. Support signing out and signing in from another device. Do not expose password hashes or session credentials through application responses.
- One account may belong to multiple groups. Groups are invite-only: a signed-in player follows an invitation link or enters its code to join.
- Each group has a creator and members. The creator manages invitations, custom prompts, and schedules. Members submit their own answers and guesses and see their group's reveals and leaderboard. The server enforces membership, ownership, and phase rules on every relevant request.
- Preserve stable account IDs so a later Google identity can attach to an existing account without replacing its memberships or scores. Google linking is outside this build.
- Account recovery and ownership transfer are outside the initial version.

## Groups and schedules

A group needs at least three members to start daily rounds. Its creator selects a time zone, answer deadline, and reveal time. A new prompt becomes available at midnight in that time zone. The answer deadline must precede the reveal time within the same local day. Display deadlines in each viewer's local time, with the group's time zone available for reference.

Schedule changes take effect on the next local day and never alter an existing round. Snapshot the schedule and eligible membership for each round. Members joining after a round starts become eligible the next day. A newly created group begins its first round at the next scheduled midnight after it reaches three members; the local testing control can create a test round immediately.

Time calculations must use named time zones and account for daylight-saving changes. Persist resolved deadline instants on each round. The backend determines phases from its clock, never the browser clock.

## Prompts and answers

Ship a curated collection of playful text prompts; do not use an AI service. Creators can add group-specific custom prompts. Choose from the built-in and group-specific collection, preferring prompts not yet used by that group; once exhausted, favor the least recently used. Snapshot prompt text so later changes cannot change an active or historical round.

Each eligible player may submit one nonblank plain-text answer, up to 200 characters. Define character counting consistently across frontend and backend using Unicode code points. Players can edit their answer during answering. Opening guessing or revealing locks the answers. Render all user-provided text as text, never executable markup.

## Round lifecycle

1. **Answering:** Show the prompt, answer field, character counter, and deadline. Keep submissions and authors private; show only participation progress.
2. **Early guessing:** If every eligible member submits before the answer deadline and there are at least four answers, open guessing immediately and lock answers. The reveal time remains unchanged.
3. **Answer deadline:** With at least four submitted answers, open guessing. With fewer than four, reveal all submitted notes immediately, with no guessing or points. Even if all three eligible members answer early, wait until the answer deadline for this unscored reveal.
4. **Guessing:** Only players who answered can guess. Members who missed answering cannot earn points and see the notes only after reveal.
5. **Scheduled reveal:** For scored rounds, lock guesses and reveal authors at the fixed reveal time, whether or not everyone finished guessing.

The lifecycle must recover after restarts without depending on an in-memory timer. Reconcile persisted rounds on server startup and relevant requests; a periodic local sweep may keep open pages current. Opening the app after a missed deadline must immediately reflect the correct phase. Do not create a backlog of playable rounds for days the local server was offline.

## Matching and scoring

- Each guessing player sees all other submitted answers, excluding their own, and the corresponding author names. Each name is used once; each answer has at most one assigned name.
- Assign a stable shuffled order per player per round so reloading does not rearrange cards. No pre-reveal response may associate an answer with its author; only the viewer's own answer may be identified to that viewer.
- Support both drag-and-drop and tap-to-select/tap-to-assign. Allow reassignment and swapping without duplicate names. Keyboard users must be able to perform matching as well.
- Save matches as they change and permit revisions until reveal. Partial boards are allowed; unanswered slots earn zero. Server validation rejects duplicate authors, foreign answers, self-matches, and ineligible participants.
- Award one point per correct match. The player's own answer earns no point. Incorrect and unassigned matches earn zero. Persist scoring exactly once per round, including when reveal is requested concurrently or after a restart.
- The player or players with the most correct matches win that day. Ties share the win, including a zero-point tie if everyone scores zero.
- Each group's running leaderboard sums total correct matches across its scored rounds. Show only display name and total score, ordered highest first, with alphabetical display-name ordering for ties and a stable account-ID fallback. No rank numbers, medals, or podium.
- After reveal, all group members can view the submitted notes and authors. Answering players additionally see their own matches and correctness. Unscored rounds clearly indicate that no points were awarded.

## Notebook interface

Use warm paper backgrounds, ruled lines, and handwritten accents for headings. Keep answers, names, deadlines, and controls in a readable typeface with adequate contrast.

- **My groups:** Notebook-style group cards showing the current phase and deadline, plus create/join actions.
- **Daily round:** Phase-specific answering, matching, or reveal views. Show saving, saved, and retry states clearly.
- **Leaderboard:** A simple descending list of names and cumulative scores.
- **Group settings:** Creator-only invitations, custom prompts, time zone, answer deadline, and reveal time.
- **Account screens:** Registration, sign-in, and sign-out.

Layouts must work on phones and desktops. Matching cannot rely solely on dragging, color, or hover. Retain local text and match selections after a failed save and provide a retry. Explain closed deadlines and permission failures in plain language.

## Local testing control

Provide a clearly labeled creator-only development control to create a test round and advance it through answering, guessing, and reveal. It must apply the same participation and scoring rules as ordinary rounds; an under-four round reveals without points. Enable it only with an explicit local development setting and reject its endpoints when disabled. This supports trying the entire flow without waiting all day and is not a production feature.

## Architecture and storage

Keep frontend views, API request handling, authentication, round lifecycle/scoring, prompt selection, and database access in focused modules. Use database transactions and uniqueness constraints for membership, one answer per participant per round, matching assignments, and exactly-once scoring.

Relational entities include accounts, sessions, groups, memberships, invitations, custom prompts, rounds, round participants, answers, guesses, and per-player round scores. Use migrations for schema changes. Store the local database outside tracked source and ignore it, local environment files, and generated artifacts in Git. Secrets are never committed.

The frontend asks the API for authorized round views; the backend filters fields by membership and phase. Author identities must not be hidden merely by React. The database is the source of truth for saved answers, guesses, deadlines, and scores.

## Verification

Meaningful automated checks cover account/session behavior; creator/member permissions; invitation joining; server-side author secrecy; answer validation; one-to-one matching; early opening; deadline transitions; under-four immediate reveal; eligibility of late joiners; daylight-saving schedule resolution; score calculation and idempotency; and persistence after restarting against the same database.

Exercise the complete local flow with at least four accounts, plus a three-answer unscored round. Verify phone layout, drag/tap/keyboard matching, refresh persistence, failed-save retry, ties, and disabled development controls. A controllable clock should make lifecycle tests deterministic without real-time waiting.

## Later PS3 work

Once the basic local app is complete, design hosting for all three components, durable production storage, test-gated automatic deployment, Part A shared basic authentication, and the public version endpoint. Then add Google sign-in and preserve temporary accounts through linking. The local username/password system does not itself replace PS3's required Part A basic authentication or Part B provider sign-in.
