App: not-provisioned
API: not-provisioned
Protected: /api/groups

# Passing Notes deployment

Status: Neon production database provisioned, migrated and verified end to end; Vercel/Render deployment is still pending.
The first two lines must be replaced with verified HTTPS URLs after account setup.
The values above deliberately do not claim that the app is online.

## Hosts

| Component | Host | Behavior |
| --- | --- | --- |
| React/Vite frontend | Vercel Hobby | Serves static files and forwards /api to Render |
| Express backend | Render Free | Sleeps after idle traffic; data is not stored on its disk |
| PostgreSQL database | Neon Free | Dedicated durable production database, initially empty |
| Verification/deployment | GitHub Actions | Tests each push to main before production changes |

## Settings (names and locations only)

| Name | Where | Purpose |
| --- | --- | --- |
| DATABASE_URL | Render secret | Neon pooled runtime connection |
| APP_ORIGIN | Render setting | Stable Vercel HTTPS origin, no trailing slash/path |
| SECURE_COOKIES | Render setting | Must be enabled in production |
| BASIC_AUTH_USERNAME, BASIC_AUTH_PASSWORD | Render secrets | Shared Part A access gate |
| LOCAL_TEST_CONTROLS | Render setting | Disabled in production |
| NODE_ENV | Render setting | Production |
| NODE_VERSION | Render setting | Node 24; package engines also requires 24.x |
| PORT, RENDER_GIT_COMMIT | Render automatically | Listening port and deployed full commit |
| DATABASE_URL_UNPOOLED | Ignored Neon .env.local | Direct migration connection pulled by Neon CLI |
| PRODUCTION_DATABASE_URL | GitHub production environment secret | Neon direct connection for schema migrations |
| RENDER_DEPLOY_HOOK_URL | GitHub production environment secret | Secret commit-pinned Render deployment hook |
| VERCEL_TOKEN | GitHub production environment secret | Owner's frontend deployment credential |
| VERCEL_ORG_ID, VERCEL_PROJECT_ID | GitHub production environment variables | Target Vercel account/project |
| RENDER_API_URL, APP_URL | GitHub production environment variables | Public backend and stable frontend URLs |
| DATABASE_URL, TEST_DATABASE_URL | Ignored local .env | Separate local development and designated test databases |

Remote PostgreSQL connections enforce certificate-verifying TLS. Neither Vite nor the browser receives database credentials. The shared gate uses the browser's HTTP authentication flow via /api/access. Personal sessions use secure, HTTP-only host cookies; user data is not cached.

## Current authorization levels

| Visitor | Allowed behavior |
| --- | --- |
| Without shared credential | Load frontend assets and GET /api/version; all other backend routes return 401 |
| With shared credential, no personal session | Register/sign in; personal account/group routes return 401 |
| Signed-in member | Access their groups, submit their own answers/guesses, view authorized reveals and leaderboard |
| Group creator | Member actions plus group invitations, prompts and schedule settings |

The server enforces these levels. Part B Google/GitHub OAuth and the showcase submission are separate work; local personal passwords do not satisfy Part B.

## Release, recovery and verification

Every main push runs format checks, PostgreSQL-backed tests and a frontend build. The production job alone obtains deployment secrets. It skips superseded commits, serializes releases, applies append-only migrations, triggers Render at the tested SHA, waits for that SHA at /api/version, then builds/deploys Vercel and verifies its API forwarding. Vercel's Git triggers and Render's independent auto-deploy must remain disabled. Pull requests never receive production credentials.

Database migration failure stops the release. A later deployment failure can leave a compatible schema/backend ahead of the old frontend; deployments across two hosts are not atomic. Repair forward or roll back compatible code. Never drop production tables or reverse migrations automatically. Production data persists independently in Neon.

[Hosting setup and live checklist](docs/hosting-setup.md) describes provisioning, backups, restore checks, logs and the live tests. No live persistence, cold-start, browser-cookie, host-log, or GitHub deployment check has yet been completed.
