# Passing Notes...

A private daily guessing game for friends and family. Answer a shared prompt, match anonymous notes to their authors, and return for the reveal. Built for both phones and computers with a notebook-inspired interface.

**Note to the grader:** This is a new project for Problem Set 3. It is different from the PS2 guitar amp simulator, The Creative Useful Modeler, which remains in `ps2-web-app/`. See [GRADER_NOTE.md](GRADER_NOTE.md).

## Run locally

Use Node.js 24. The active database is PostgreSQL; the old local SQLite file stays untouched and is not imported.

1. Run `npm ci` and `docker compose up -d` in this folder. Docker is needed for the supplied local database service; an existing local PostgreSQL 17 instance also works.
2. Create the separate test database: `docker compose exec postgres createdb -U passing_notes passing_notes_test` (once).
3. Copy `.env.example` to ignored `.env` and set `DATABASE_URL=postgresql://passing_notes@127.0.0.1:5432/passing_notes_dev` and `TEST_DATABASE_URL=postgresql://passing_notes@127.0.0.1:5432/passing_notes_test`. These are local trust-authentication connections, never production credentials.
4. Run `npm run db:migrate`, then `npm start`. Open http://localhost:5174.

The local frontend proxies to port 3002. Optional local shared credentials must be supplied as both BASIC_AUTH_USERNAME and BASIC_AUTH_PASSWORD. Leave secure cookies off for HTTP localhost. Production requires HTTPS and secure cookies.

## Play

- A group needs at least three members. Accounts can join multiple groups.
- A fresh prompt arrives at midnight in the group’s chosen time zone. Its first normal round starts the midnight after the third member joins.
- Each player submits one text answer, up to 200 Unicode characters. Answers remain editable until matching begins.
- Three or more submitted answers make a scored round. Matching opens at the answer deadline, or early if everyone eligible has answered.
- With fewer than three answers at the answer deadline, notes reveal immediately without guessing or points. All three members answering early opens matching immediately; the reveal time stays fixed.
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

Create at least three test profiles in separate browser profiles or by signing out and back in. Join them to the same group. The creator can expand **Local testing controls** on the group page, start a practice round, close answers, and reveal notes. Three answers are required for points. Practice rounds use the same storage and scoring rules and contribute to that local group’s leaderboard.

Practice rounds have an answer deadline one hour after creation and a reveal two hours after creation; the controls can advance these sooner. Normal daily rounds use the group’s chosen schedule. Starting a practice round is refused while a current round is active. The testing endpoints are absent unless the setting is enabled.

## Data and settings

Neon CLI setup writes its secrets into ignored `.env.local`. Backend, test, and migration commands load `.env`, then `.env.local`; externally supplied environment variables take priority. The backend uses pooled `DATABASE_URL`; migrations prefer direct `DATABASE_URL_UNPOOLED`. Your separate `TEST_DATABASE_URL` must still identify `passing_notes_test`.

PostgreSQL stores accounts and game records. Production uses its own fresh Neon database; development and tests use separate databases. Schema migrations are explicit (`npm run db:migrate`) and checked before startup; app startup never changes the production schema. Remote database connections verify TLS certificates.

See [DEPLOY.md](DEPLOY.md) for setting names and [hosting setup](docs/hosting-setup.md) for account setup and the live verification checklist. Never put credentials into frontend code, chat, or tracked files.

## Verify

```sh
node --env-file-if-exists=.env node_modules/vitest/vitest.mjs run
npm run build
npm run format:check
```

Tests cover accounts, creator/member permissions, invitations, prompt rotation, schedules and clock changes, author secrecy, matching validation, scoring, failed-save retry, and persistence after reopening the database. Browser verification covers desktop and 360px layouts and drag/click/keyboard matching. A physical phone/touchscreen has not been separately tested.

## PS3 status

The PostgreSQL conversion, Part A shared authentication, public version endpoint, and test-gated deployment workflow are implemented. Production has not yet been provisioned or verified. Render Free may take about a minute to wake after idle time; the frontend shows connecting/retry feedback and never automatically replays writes.

Part B Google/GitHub sign-in, account linking, and the class showcase remain separate work. Existing personal passwords do not replace that requirement. See [hosting setup](docs/hosting-setup.md).

Google player sign-in and linking setup: [docs/google-setup.md](docs/google-setup.md). Password login remains available; Google activation is controlled on Render.
