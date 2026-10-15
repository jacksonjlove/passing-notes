# Passing Notes...

A private daily guessing game for friends and family. Answer a shared prompt, match anonymous notes to their authors, and return for the reveal. Built for both phones and computers with a notebook-inspired interface.

**Note to the grader:** This is a new project for Problem Set 3. It is different from the PS2 guitar amp simulator, The Creative Useful Modeler, which remains in `ps2-web-app/`. See [GRADER_NOTE.md](GRADER_NOTE.md).

## Run locally

Use Node.js 24 and install the project’s dependencies from this folder:

```sh
npm install
npm start
```

Open [Passing Notes on localhost](http://localhost:5174). The frontend runs on port 5174 and proxies requests to the backend on port 3002. Stop both with Ctrl+C.

Create a profile with a username, display name, and password. Create a group or join with an invitation. The app remembers sign-in on the same device for up to 30 days; sign in again to play on another browser. There is no password-reset flow in this local version.

## Play

- A group needs at least three members. Accounts can join multiple groups.
- A fresh prompt arrives at midnight in the group’s chosen time zone. Its first normal round starts the midnight after the third member joins.
- Each player submits one text answer, up to 200 Unicode characters. Answers remain editable until matching begins.
- Four or more submitted answers make a scored round. Matching opens at the answer deadline, or early if everyone eligible has answered.
- With fewer than four answers at the answer deadline, notes reveal immediately without guessing or points. A three-member group does not reveal early just because all three answered.
- Only people who answered can guess. New members join the game the next day.
- Your own answer is excluded from your matching board. Use each person once. Click/tap a name and then a note, drag using the name’s grip, or use keyboard focus and Enter/Space. Occupied names move or swap.
- Matches save automatically and can change until the fixed reveal time. Empty or incorrect slots score zero; correct matches score one point. If saving fails, retry while the round is still open.
- Ties share the daily win. The leaderboard shows names and cumulative correct matches, ordered highest first, without rank labels.
- Creators manage invitations, custom prompts, and schedules. Schedule changes apply the next day, leaving active deadlines intact.

The built-in prompt collection mixes with custom group prompts and avoids repeats until the collection is exhausted. All permissions, answer secrecy, deadlines, and scoring are enforced on the server.

## Try the full game immediately

Run with explicit local testing controls:

```sh
LOCAL_TEST_CONTROLS=1 npm start
```

Create at least three test profiles in separate browser profiles or by signing out and back in. Join them to the same group. The creator can expand **Local testing controls** on the group page, start a practice round, close answers, and reveal notes. Four answers are still required for points. Practice rounds use the same storage and scoring rules and contribute to that local group’s leaderboard.

Practice rounds have an answer deadline one hour after creation and a reveal two hours after creation; the controls can advance these sooner. Normal daily rounds use the group’s chosen schedule. Starting a practice round is refused while a current round is active. The testing endpoints are absent unless the setting is enabled.

## Data and settings

SQLite stores local data in `data/passing-notes.sqlite`. It survives server restarts. The database and its journal files, environment files, build output, and dependencies are ignored by Git. Database migrations run automatically at startup; existing rows are retained.

Optional environment setting names:

| Setting | Purpose |
| --- | --- |
| `DATABASE_PATH` | Alternative SQLite file path |
| `APP_ORIGIN` | Allowed frontend origin; defaults to `http://localhost:5174` |
| `LOCAL_TEST_CONTROLS` | Set to `1` to enable creator-only local controls |
| `SECURE_COOKIES` | Set to `1` when a future environment serves the app over HTTPS |

Passwords use salted scrypt hashes. Session tokens are held in HTTP-only cookies; the database stores token digests. Use the exact localhost URL above, since a different origin needs matching configuration.

## Verify

```sh
npm test
npm run build
npm run format:check
```

Tests cover accounts, creator/member permissions, invitations, prompt rotation, schedules and clock changes, author secrecy, matching validation, scoring, failed-save retry, and persistence after reopening the database. Browser verification covers desktop and 360px layouts and drag/click/keyboard matching. A physical phone/touchscreen has not been separately tested.

## PS3 status

This is a working **local** app. Remote play with friends will need hosting. Hosting, automatic deployment, basic authentication for Part A, Google sign-in for Part B, `DEPLOY.md`, and the showcase pull request are future steps. Personal local passwords do not replace the assignment’s required basic authentication or Google/GitHub integration.

The design and implementation plan live in `docs/superpowers/`. Stable account IDs allow Google identities to be attached later without replacing memberships and scores.
