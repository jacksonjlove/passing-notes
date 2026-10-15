# Neon setup and verification

Date: October 14, 2026 (America/Detroit)
Result: selected production Postgres service connected, schema migrated, and live app flow verified. Frontend/backend public hosting remains separate.

## Target and changes

Used the user's specified organization `org-sweet-block-07612436`, project `shiny-snow-19628734`, and branch `production`. No substitute project was created. `neon init` created `neon.ts`, installed its config/env dependencies and agent guidance, and ignored the local `.neon` binding. The config leaves Neon Auth disabled; this task provisions Postgres only and preserves existing Express authentication.

`neon deploy` verified the existing branch policy and pulled `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, and `NEON_BRANCH` into ignored `.env.local`. The backend uses the existing pg driver, appropriate for the long-running Node/Express runtime. Migrations prefer the direct `DATABASE_URL_UNPOOLED`; pooled migration attempts are explicitly refused because the migration lock is session-based.

Backend/test/migration commands load `.env` followed by `.env.local`, with externally supplied process environment values taking precedence. Transaction-scoped `SET LOCAL search_path` replaces reliance on session settings across Neon PgBouncer transactions. Public-schema queries avoid a separate session-setting statement. Remote connections continue to verify TLS certificates. Credentials are not committed or included in this report.

The two existing append-only migrations applied successfully. No old SQLite file was uploaded or changed. The live test created disposable accounts and a group, then removed only its own records.

## Evidence

Command: `npx --yes neon@latest deploy`

```text
Applying to branch production
No changes — branch production already matches the policy.
Utilized services: Postgres
Pulled 3 Neon variables into .env.local
Postgres: DATABASE_URL, DATABASE_URL_UNPOOLED
Branch: NEON_BRANCH
```

Command: `npm run db:migrate`

Exit code 0; schema migration and readiness checks succeeded through the direct Neon connection.

Command: `npm run build`

```text
vite v6.4.4 building for production...
✓ 37 modules transformed.
✓ built in 230ms
```

Regression suite used the separate local database named `passing_notes_test`, never production as its test/reset target:

```text
Test Files  19 passed (19)
Tests       71 passed (71)
```

The built frontend was served on `127.0.0.1:5187` and forwarded API calls to the real app on port 3007. `scripts/verify-neon.mjs` started the app, exercised the service, restarted the backend, then cleaned up its own test data:

```text
PASS Neon PostgreSQL connection uses verified TLS
PASS production frontend and API proxy respond
PASS three accounts register through the app into Neon
PASS group creation, concurrent joins, saved prompt and creator permissions
PASS records and sessions survive backend restart; sign-in restores account
PASS logout invalidates the saved session
PASS disposable smoke-test records cleaned up
```

`npm run format:check` and `git diff --check` pass. `.env.local` and `.neon` are ignored by Git.

To repeat the live smoke test, stop any separately running backend on port 3007. Run `npm run build`, then in one terminal `npx vite preview --config vite.neon-check.config.js`. In another, run `node --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/verify-neon.mjs`. This is an explicit live integration test: it creates and cleans up disposable records in the selected Neon database, and manages its own backend process. Do not run it against an unrelated project.

## Failures and corrections

- Global `npm i -g neon@latest` failed with EACCES for `/usr/local/lib/node_modules/neon`. Used the requested npx fallback; no system permission changes were made.
- CLI browser sign-in did not initially appear, then expired after 60 seconds. A fresh login and user authorization resolved this; the subsequent deploy succeeded.
- The first smoke-test TLS assertion used `pg_stat_ssl` behind the transaction pooler, which describes Neon's internal backend hop rather than the client-to-pooler connection. Replaced that assertion with checks of the actual client TLS stream (`encrypted` and certificate `authorized`), which both passed. No encryption verification was disabled.
- Initialization warned that Copilot CLI was unavailable and installed Neon skills/MCP instead. The config/env dependency install also reported six npm audit advisories (three moderate, one high, two critical). No broad or breaking dependency upgrades were attempted in this connection task.

## References consulted

- Installed Neon guidance: `~/.agents/skills/neon/SKILL.md` and `~/.agents/skills/neon-postgres/SKILL.md`.
- [Connection method guidance for Render/Node](https://neon.com/docs/connect/choose-connection)
- [Pooled versus direct connections](https://neon.com/docs/connect/connection-pooling)
