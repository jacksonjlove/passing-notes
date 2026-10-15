# Passing Notes... Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete local daily matching game for private groups, with temporary accounts and a responsive notebook interface.

**Architecture:** React renders authorized views from an Express API. SQLite persists accounts, sessions, group schedules, rounds, answers, guesses, and scores. A clock-injected round service reconciles deadlines transactionally, independently of browser timers.

**Tech Stack:** JavaScript ES modules, React, Vite, Express, better-sqlite3, Node crypto, Luxon for named time zones, Vitest, Testing Library, Supertest.

**Spec:** `docs/superpowers/specs/2026-10-08-passing-notes-design.md` (paths in this plan are relative to `assignments/ps3/`).

## Global Constraints

- The first version runs locally with a React frontend, Node backend, and SQLite relational database.
- It belongs in `assignments/ps3/`; the submitted PS2 app remains intact.
- One account may belong to multiple groups.
- A group needs at least three members to start daily rounds.
- Each eligible player may submit one nonblank plain-text answer, up to 200 characters.
- With fewer than four, reveal all submitted notes immediately, with no guessing or points.
- Only players who answered can guess.
- Award one point per correct match. The player's own answer earns no point.
- Show only display name and total score, ordered highest first, with alphabetical display-name ordering for ties and a stable account-ID fallback.
- Schedule changes take effect on the next local day and never alter an existing round.
- Layouts must work on phones and desktops.
- Secrets are never committed.
- Google, hosting, auto-deploy, showcase submission, and production auth are separate future work. Local accounts are not PS3's Part A basic authentication.

## File map and shared contracts

Create the following focused modules as their tasks are reached:

| Files | Responsibility |
| --- | --- |
| `package.json`, `package-lock.json`, `.gitignore`, `vite.config.js`, `index.html` | Local commands, dependencies, proxy, ignored data |
| `server/index.js`, `server/app.js` | Startup/sweep/shutdown and API assembly |
| `server/db.js`, `server/migrations/001-initial.sql` | Connection, migrations, constraints |
| `server/auth.js`, `server/routes/auth.js` | Hashing, sessions, account endpoints |
| `server/groups.js`, `server/routes/groups.js` | Membership, invitation, schedule permissions |
| `server/prompts.js`, `server/data/prompts.js` | Prompt selection |
| `server/schedule.js`, `server/rounds.js`, `server/scoring.js` | Time-zone deadlines, lifecycle, scoring |
| `server/roundViews.js`, `server/routes/rounds.js` | Filtered round views and mutations |
| `server/routes/dev.js` | Disabled-by-default test advancement |
| `src/main.jsx`, `src/App.jsx`, `src/api.js`, `src/styles.css` | Entry, screen selection, requests, notebook theme |
| `src/components/AccountForm.jsx`, `GroupList.jsx`, `GroupSettings.jsx` | Accounts and group management |
| `src/components/RoundPage.jsx`, `AnswerForm.jsx`, `MatchingBoard.jsx`, `Reveal.jsx`, `Leaderboard.jsx` | Game screens |
| `tests/helpers.js`, `tests/*.test.js`, `src/testSetup.js`, `src/components/*.test.jsx` | Isolated database fixtures, deterministic tests, UI checks |
| `README.md` | Local setup, use, troubleshooting, limitations |

Use string UUIDs for entity IDs and integer UTC epoch milliseconds for instants. Public account objects are `{id, username, displayName}`. Public errors are `{error: {code, message}}`, using 400 for validation, 401 for no session, 403 for insufficient permissions, 404 for absent/inaccessible entities, and 409 for phase/state conflicts. Never serialize raw database rows to clients.

`createApp({db, now = Date.now, devControls = false})` returns Express without listening. Tests create an isolated in-memory database via `openDatabase(':memory:')`. `server/index.js` opens `data/passing-notes.sqlite`, listens on 3002, reconciles every 30 seconds, and closes cleanly on shutdown. Vite runs on 5174 and proxies `/api` to 3002 so cookies remain same-origin locally.

Every mutation requires JSON and a valid Origin equal to the configured local app origin; tests supply it. Sessions use cryptographic tokens, store a SHA-256 token digest, last 30 days, and use an HTTP-only, SameSite=Lax, path=/ cookie (Secure when configured for HTTPS). Rate-limit account attempts and invitation attempts. Use Node scrypt with random salts and timing-safe comparison. No logging passwords or tokens.

## Task 1: Persistent accounts and local application foundation

**Files:** Create package/config/entry files, `server/db.js`, migration, auth modules, `tests/helpers.js`, `tests/auth.test.js`, `.gitignore`.

**Interfaces:** Produce `openDatabase(path) -> db`, `createApp(options) -> app`, `hashPassword(password) -> encodedHash`, `verifyPassword(password, hash) -> boolean`, `requireUser` middleware setting `req.user`. Endpoints: `POST /api/auth/register {username,displayName,password}`, `POST /api/auth/login {username,password}`, `POST /api/auth/logout`, `GET /api/auth/me`; successful account responses are `{user}`.

- [ ] Write the account/persistence test before implementation:

```js
it('restores the same account in a second browser', async () => {
  const first = request.agent(app);
  const created = await first.post('/api/auth/register').set('Origin', origin)
    .send({username:'alex', displayName:'Alex', password:'four-word-test-password'});
  expect(created.status).toBe(201);
  const second = request.agent(app);
  const logged = await second.post('/api/auth/login').set('Origin', origin)
    .send({username:'alex', password:'four-word-test-password'});
  expect(logged.body.user.id).toBe(created.body.user.id);
  expect((await second.get('/api/auth/me')).body.user.displayName).toBe('Alex');
  expect(JSON.stringify(logged.body)).not.toMatch(/password|token|salt/);
});
```

- [ ] Run `npm test -- tests/auth.test.js`; confirm the missing-module/behavior failure after configuring Vitest. Use the same React/Vite/Express/test versions as PS2 where practical, add Luxon, and lock dependencies. Scripts: `start` runs server/client concurrently, `server`, `client`, `build`, and `test`.
- [ ] Implement migration tables: `accounts(id,username UNIQUE,display_name,password_hash)`, `sessions(token_hash PRIMARY KEY,account_id REFERENCES accounts,expires_at)`, `schema_migrations(version PRIMARY KEY)`. Enable SQLite foreign keys. Apply unapplied migrations transactionally. Ignore `node_modules/`, `dist/`, `data/`, `.env`, `.env.*` except `.env.example`; never place credentials in an example file.
- [ ] Implement validation and auth with these boundaries:

```js
const normalizedUsername = username.trim().toLowerCase();
if (!/^[a-z0-9_-]{3,30}$/.test(normalizedUsername)) throw badRequest('Invalid username');
if (!displayName.trim() || [...displayName.trim()].length > 40) throw badRequest('Invalid display name');
if (password.length < 8 || password.length > 128) throw badRequest('Use 8–128 characters');
// Hash using scrypt(password, randomBytes(16), 64); store salt + hash.
// Set a randomBytes(32) session token cookie; persist only its SHA-256 digest.
```

- [ ] Add tests for duplicate normalized usernames, invalid passwords, wrong credentials, expired/logout sessions, denied untrusted-origin mutations, and hashed storage. Test reopening a temporary file database preserves account and session. Run auth tests and `npm run build` after adding the minimal React entry.
- [ ] Commit only Task 1 paths with message `feat: add persistent local player accounts`.

## Task 2: Invite-only groups, creator settings, and prompts

**Files:** Extend migration before it has shipped (or add `002-groups.sql` if already committed/applied); create groups/prompt modules/routes/data and `tests/groups.test.js`, `tests/prompts.test.js`.

**Interfaces:** Produce `requireMembership(db,groupId,userId) -> membership`, `requireCreator(...) -> group`, `selectPrompt(db,groupId) -> {id,text}`. Routes: `GET/POST /api/groups`, `POST /api/invitations/join {code}`, `POST /api/groups/:id/invitations`, `DELETE /api/groups/:id/invitations/:inviteId`, `GET/PATCH /api/groups/:id/settings`, `GET/POST /api/groups/:id/prompts`, `GET /api/groups/:id/leaderboard`. Creation body: `{name,timeZone,answerTime,revealTime}`; times are `HH:mm`. Group responses include `{id,name,role,memberCount,currentPhase,nextDeadline}`. Membership is unique per account/group.

- [ ] Write and run a failing permissions test:

```js
it('permits invited membership but rejects member schedule edits', async () => {
  const group = await createGroup(owner, {name:'Family', timeZone:'America/Detroit', answerTime:'17:00', revealTime:'21:00'});
  const invite = await owner.post(`/api/groups/${group.id}/invitations`).set('Origin', origin).send({});
  expect((await member.post('/api/invitations/join').set('Origin', origin).send({code:invite.body.code})).status).toBe(200);
  expect((await member.patch(`/api/groups/${group.id}/settings`).set('Origin', origin).send({answerTime:'16:00'})).status).toBe(403);
});
```

- [ ] Implement `groups` (creator, name, active schedule, pending schedule/effective date), `memberships` (joined instant), `invitations` (digest, group, revoked flag), `custom_prompts` and prompt usage history. Return a newly generated invite code only at creation, accept repeated joins idempotently, permit revocation, and reject nonmember reads. Group creator is also a member. No removing members or deleting accounts/groups in this version.
- [ ] Validate group names (1–60 characters), named zone using Luxon, real `HH:mm` values, and `00:00 < answerTime < revealTime <= 23:59`. Validate custom prompts as 1–300 code points. Settings edits update pending schedule for the following group-local date; existing rounds use snapshots. Invitations use random cryptographic codes, not sequential IDs.
- [ ] Seed at least 30 varied original prompts in `server/data/prompts.js`. Prefer unused prompts, then least recently used, with randomized ties. Snapshot text at round creation. Leaderboard query includes all members with zero when they have no scored rounds; sum stored scores, descending score then display name then ID.
- [ ] Test multiple-group membership, bad/revoked codes, creator-only prompts/invitations, duplicate display names, invalid zones/times, deferred schedules, and prompt exhaustion. Run group/prompt tests; commit as `feat: add private groups and daily prompt settings`.

## Task 3: Deterministic daily lifecycle and answer storage

**Files:** Create schedule/round modules, round tables/migration, rounds routes, `tests/schedule.test.js`, `tests/rounds.test.js`.

**Interfaces:** `resolveSchedule(localDate,schedule) -> {opensAt,answerDeadline,revealAt}`, `reconcileGroup(db,groupId,nowMs) -> round|null`, `reconcileAll(db,nowMs)`, `saveAnswer(db,{groupId,userId,text,nowMs})`. Persist phases `answering`, `guessing`, `revealed`; store `scored` boolean. Endpoints: `GET /api/groups/:id/round`, `PUT /api/groups/:id/round/answer {text}`. Reconcile before every round read/mutation. Snapshot participant IDs and schedule; initialize only when at least three memberships predate the round opening.

- [ ] Add failing clock-driven tests:

```js
it('reveals three answers immediately at the answer deadline without points', () => {
  const round = seedRound(db, {members:4, answers:3, answerDeadline:1000, revealAt:2000});
  reconcileGroup(db, round.groupId, 1000);
  expect(readRound(db, round.id)).toMatchObject({phase:'revealed',scored:false});
  expect(db.prepare('SELECT count(*) AS n FROM round_scores').get().n).toBe(0);
});
it('opens guessing early only with four answers from all eligible members', () => {
  const round = seedRound(db, {members:4, answers:4, answerDeadline:1000,revealAt:2000});
  reconcileGroup(db, round.groupId, 500);
  expect(readRound(db, round.id).phase).toBe('guessing');
});
```

- [ ] Run `npm test -- tests/rounds.test.js tests/schedule.test.js`; confirm failure. Implement tables `rounds` (unique group/local date, prompt snapshot, UTC deadlines, phase, scored, finalized), `round_participants` (unique round/account), `answers` (unique round/account, stable answer ID, text), and score/guess tables needed by Task 4.
- [ ] Implement this transactional decision order so a late request cannot briefly expose the wrong phase:

```js
if (nowMs >= round.revealAt) finalizeRound(round);
else if (nowMs >= round.answerDeadline)
  answerCount < 4 ? revealUnscored(round) : openGuessing(round);
else if (answerCount >= 4 && answerCount === participantCount) openGuessing(round);
```

`finalizeRound` at this task may reveal unscored rounds; scored finalization is completed in Task 4 before any app handoff. Catch up existing rounds first, then create only the current day's eligible round; never fabricate missed-day rounds. Select memberships joined before opening, applying pending schedule only at its effective date. Creation after a group reaches three members waits until the following local midnight; store an activation local date.
- [ ] Resolve time zones with Luxon. For nonexistent spring-forward times, use the first valid local instant after the gap; for ambiguous fall-back times, choose the earlier instant. If resolution collapses answer/reveal ordering, reject that scheduled day with a clear settings error rather than create an invalid round. Test both transitions and a viewer in a different time zone.
- [ ] Save trimmed nonblank answers with `Array.from(text).length <= 200`; reject ineligible members and any edit after phase transition. Submission and early guessing transition share one transaction. Before guessing only participation counts and the viewer's own answer are returned.
- [ ] Test zero/three/four submissions, all-three early waiting, late joins, edits at exactly the deadline, restart reconciliation, skipped offline days, and pending schedules. Commit as `feat: implement scheduled rounds and saved answers`.

## Task 4: Private matching, reveal, scores, and local test controls

**Files:** Create scoring/view/dev modules, complete round routes, `tests/matching.test.js`, `tests/scoring.test.js`, `tests/privacy.test.js`, `tests/dev.test.js`.

**Interfaces:** `getRoundView(db,{groupId,userId,nowMs}) -> {round,participation,ownAnswer,board,reveal}` with phase-dependent optional fields. Board: `{answers:[{id,text}],people:[{id,displayName,username}],matches:[{answerId,personId}]}`; IDs of people never appear on anonymous answers. `saveMatches(db,{roundId,userId,matches,nowMs})`; `finalizeRound(db,roundId,nowMs)`; route `PUT /api/groups/:id/round/matches {matches}` replaces the complete partial board transactionally. Reveal: `{answers:[{id,text,author}],myMatches,results:[{user,score,isWinner}],scored}`.

- [ ] Write and run the privacy and idempotency failures:

```js
it('does not expose another answer author before reveal', async () => {
  const result = await answeringPlayer.get(`/api/groups/${group.id}/round`);
  for (const answer of result.body.board.answers) {
    expect(Object.keys(answer).sort()).toEqual(['id','text']);
  }
  expect(result.body.reveal).toBeUndefined();
});
it('awards each round once across repeated reconciliation', () => {
  const round = seedScoredRound(db, {correctMatches:2});
  finalizeRound(db, round.id, round.revealAt);
  finalizeRound(db, round.id, round.revealAt + 1);
  expect(readPlayerTotal(db, round.groupId, round.playerId)).toBe(2);
});
```

- [ ] Persist stable per-player shuffled board order in `round_boards` and matches in `guesses` (unique round/guesser/answer and round/guesser/person). Shuffle with crypto-backed Fisher-Yates; never derive order from authors. For each submitted match validate answer belongs to this round, person submitted in it, neither is the guesser's own, and neither answer nor person repeats. Permit incomplete matches. A nonanswering member receives no board and cannot submit guesses.
- [ ] Implement scoring in one transaction: calculate each answering player's correct other-answer matches, insert one `round_scores` row per round/player, set finalized, and reveal. Unassigned slots count zero. Unique constraints plus finalized guard prevent double awarding. Winners share max score, including zero ties. Query leaderboard totals from score rows rather than separately incrementing account counters.
- [ ] Implement safe view projections and membership checks. After reveal all group members see author/answer pairs; only the requesting player sees their guessed matches. Concurrent deadline requests must not bypass locks or leak identities.
- [ ] Add creator-only `POST /api/groups/:id/dev/round {action}` for `start`, `guess`, `reveal`. Require explicit `LOCAL_TEST_CONTROLS=1` parsed at startup; routes otherwise return 404. Test rounds are tagged; refuse overlapping real active rounds. `guess` with fewer than four answers immediately reveals unscored. Controls advance persisted deadlines using the same lifecycle, never separate scoring logic.
- [ ] Run all server tests including tampered author/answer IDs, outsider access, duplicate names, incomplete boards, ties, double finalize, restart scores, and controls disabled. Commit as `feat: add anonymous matching and reliable scoring`.

## Task 5: Notebook accounts, groups, settings, and answering screens

**Files:** Create frontend account/group/answer components, App/api/theme, component tests, `src/testSetup.js`.

**Interfaces:** `api(path,{method='GET',body,signal}={})` includes credentials, sends JSON, returns parsed data, or throws `{code,message,status}`. App restores `/api/auth/me`, then groups; account expiration returns to sign-in without discarding an in-progress draft. `RoundPage({groupId})` fetches the authorized round and passes it to phase-specific components. Poll active round every 15 seconds while visible, refresh on focus, and abort/clear on unmount.

- [ ] Write an answer failure-retention test:

```jsx
it('retains a note when saving fails and retries it', async () => {
  const save = vi.fn().mockRejectedValueOnce(new Error('Could not save')).mockResolvedValueOnce({});
  render(<AnswerForm initialText="" onSave={save} disabled={false}/>);
  fireEvent.change(screen.getByLabelText('Your note'), {target:{value:'A tiny dragon'}});
  fireEvent.click(screen.getByRole('button',{name:'Save note'}));
  expect(await screen.findByText('Could not save')).toBeVisible();
  expect(screen.getByLabelText('Your note')).toHaveValue('A tiny dragon');
  fireEvent.click(screen.getByRole('button',{name:'Retry'}));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
});
```

- [ ] Run the test for failure, then implement explicit form labels, pending/error/saved states, disabled deadlines, and Unicode counter. Save drafts in component state; prevent polling from replacing dirty text. Avoid issuing overlapping answer saves. A phase change disables editing and refreshes the board.
- [ ] Build create/join group forms, account forms, settings, invitation creation/revocation, custom prompt additions, and local test controls when server reports enabled. Handle 401/403/409 with readable messages. Invitations use the same origin with `?invite=CODE`; preserve invite through registration and remove it from the URL after joining. Default new schedules to Detroit/local browser zone, 17:00 and 21:00, editable before creation.
- [ ] Implement paper/ruled CSS with readable system body fonts, handwritten-style heading fallback, visible focus, reduced-motion support, generous touch targets, and no decorative rank indicators. Use a narrow single-column mobile layout and wider desktop layout without horizontal scrolling at 360px.
- [ ] Test register/sign-in screens, create/join flow, member settings restrictions, draft retention, and phase refresh. Run frontend tests and build. Commit as `feat: build responsive notebook group and answer screens`.

## Task 6: Accessible matching, reveal, leaderboard, and complete verification

**Files:** Create MatchingBoard/Reveal/Leaderboard components and tests, finish RoundPage, `tests/restart.test.js`, `README.md`.

**Interfaces:** `MatchingBoard({board,onSave,disabled})`, `Reveal({reveal})`, `Leaderboard({entries})`. Keep a local assignment map and revision counter; serialize saves so older responses cannot overwrite newer matches. `onSave(matches)` receives the full partial assignment array. Display a visible retry action for failed saves and warn that unsaved guesses have not reached the server.

- [ ] Write the swap/keyboard and leaderboard tests:

```jsx
it('swaps occupied assignments without using a name twice', () => {
  const next = assignName({a:'p1',b:'p2'}, 'a', 'p2');
  expect(next).toEqual({a:'p2',b:'p1'});
});
it('shows names and totals without ranks', () => {
  render(<Leaderboard entries={[{id:'a',displayName:'Alex',score:8},{id:'b',displayName:'Sam',score:4}]}/>);
  expect(screen.getByText('Alex')).toBeVisible();
  expect(screen.getByText('8')).toBeVisible();
  expect(screen.queryByText('1st')).not.toBeInTheDocument();
});
```

- [ ] Run failures, then implement one shared `assignName(assignments,answerId,personId)` operation for dragging and button/keyboard selection. If target has another person and chosen person is elsewhere, swap; if target is empty, move; allow clear. Use Pointer Events for mouse/touch dragging with explicit handles, preserve page scrolling outside handles, and retain tap/keyboard buttons. Announce selected person, assignment, and save status via a live region.
- [ ] Render shuffled answers without author cues, distinguish duplicate names using username, exclude own answer, and retain unsaved state during polling. After fixed reveal, fetch and render author pairs, correct/incorrect matches, daily winners, unscored notice, and total-score list. Show all notes to nonanswerers only after reveal.
- [ ] Add a temporary-file restart test that registers four accounts, creates/join a group, runs a test round, saves answers/matches, closes the app/database, reopens with a later injected clock, and asserts revealed authors and exactly-once totals. Include a second three-answer round with immediate unscored reveal. Run `npm test` and `npm run build` once the full flow passes.
- [ ] Verify the running app at desktop and 360px phone widths: four different browser sessions, refresh/relogin, two groups, tap/drag/keyboard assignment, missed answer, incomplete guesses, early guessing, ties, and failed saves. Use development controls for time changes. Record actual results, not assumed passes.
- [ ] Write README commands and behavior:

```text
npm install
npm start
Open http://localhost:5174
Enable local test controls: LOCAL_TEST_CONTROLS=1 npm start
npm test
npm run build
```

Explain account rules, local data path, restarting, group schedule phases, four-answer scoring minimum, and that remote friends need a later hosting step. Note Google linking and deployment remain future work. Do not provide a public URL or claim PS3 is complete.
- [ ] Commit as `feat: complete Passing Notes daily game and local guide`.

## Plan review and execution boundary

Coverage: accounts/security (1), invitations/multiple groups/prompts (2), schedules/late eligibility/answers/lifecycle (3), secrecy/matching/scoring/dev controls (4), notebook/mobile/desktop/forms/retries (5), interaction/reveal/leaderboard/persistence/end-to-end verification (6). All six tasks are part of one game; no separate independent subsystem requires another spec.

Create and review each meaningful deliverable before the next. Stage only relevant files, preserving the preexisting `.DS_Store` modification. No deployment, pushes, merges, or edits to the submitted PS2 app are part of this plan.

After user approval, choose inline execution with checkpoints or subagent-driven development. Read the selected execution skill from the course-pinned `superpowers/` clone before implementation; follow the course's model/effort rules if delegation is selected.
