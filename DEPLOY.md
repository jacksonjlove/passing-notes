App: https://passing-notes.vercel.app
API: https://passing-notes-api-0rsu.onrender.com
Protected: /api/groups

# Passing Notes deployment

Status: Deployed on Vercel, Render and Neon with Google player sign-in enabled. The shared Basic Auth gate is disabled. Username/password player sign-in remains available. Verification status below distinguishes completed checks from checks still awaiting a person.

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
| AUTH_MODE | Render setting | google in the live deployment; enables Google/player authentication and disables the shared gate |
| GOOGLE_CLIENT_ID | Render setting | Google web application OAuth client identifier |
| GOOGLE_CLIENT_SECRET | Render secret | Google code exchange; never exposed to the frontend |
| BASIC_AUTH_USERNAME, BASIC_AUTH_PASSWORD | Render secrets, legacy | Part A gate only; ignored in google mode and not needed for player access |
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

Remote PostgreSQL connections enforce certificate-verifying TLS. Neither Vite nor the browser receives database credentials or the Google client secret. Personal sessions use secure, HTTP-only, SameSite=Lax, host-only cookies; API responses are marked no-store. No database or OAuth secrets are configured in the frontend build.

## Authentication and authorization

Anyone with a Google account may sign in. A new Google identity creates a player account. Existing players can sign in with their player password and use Account → Link Google, confirming that password before completing Google authorization. Linking preserves the same player ID, groups, answers and scores. Identities are never automatically merged by email or display name. Google-only accounts do not have a password.

| Level | Server-enforced permissions |
| --- | --- |
| Visitor without a player session | Load frontend, use registration/sign-in endpoints and GET /api/version; /api/groups returns 401 |
| Signed-in player | Read their own account, create groups, join using an invitation, and access only groups they belong to |
| Group member | Submit their own eligible answers/guesses and view their group's permitted round, reveal and leaderboard data |
| Group creator | Member actions plus invitations, custom prompts and schedule settings for groups they created; other members receive 403 for these actions |

Authorization checks run in Express, independently of React. Google authentication does not confer membership or creator privileges. Joining a group still requires an invitation. Without membership, private group resources return 404 to avoid exposing their existence.

The owner registers the Google Web application client with an External audience. The live callback is `https://passing-notes.vercel.app/api/auth/google/callback`. The development callback is `http://localhost:5174/api/auth/google/callback`, configured on a separate development client. Both callbacks use the frontend host, which proxies to Express. Google receives only the `openid` and `profile` scopes for identity and display name; email, contacts, Drive and offline access are not requested. Provider access/refresh tokens are not persisted. See [Google setup](docs/google-setup.md).

## Release, recovery and verification

Every main push runs format checks, PostgreSQL-backed tests and a frontend build. The production job alone obtains deployment secrets. It skips superseded commits, serializes releases, applies append-only migrations, triggers Render at the tested SHA, waits for that SHA at /api/version, then builds/deploys Vercel and verifies its API forwarding. Vercel's Git triggers and Render's independent auto-deploy must remain disabled. Pull requests never receive production credentials.

Database migration failure stops the release. A later deployment failure can leave a compatible schema/backend ahead of the old frontend; deployments across two hosts are not atomic. Repair forward or roll back compatible code. Never drop production tables or reverse migrations automatically. Production data persists independently in Neon.

[Hosting setup and live checklist](docs/hosting-setup.md) describes provisioning, backups, restore checks and logs. Runtime request logs include method, route pattern and status, excluding bodies, cookies and OAuth codes.

## Verification status — October 14, 2026

Completed:

- 86 automated tests across 21 files passed, with PostgreSQL integration tests using a separate disposable database. Formatting and the production frontend build passed.
- [Google release deployment](https://github.com/jacksonjlove/passing-notes/actions/runs/38669247147) passed checks, migrations, Render deployment, Vercel deployment and stable URL verification.
- Both live /api/version endpoints reported the deployed main commit when checked. The protected /api/groups endpoint returned 401 without a player session and without a Basic challenge.
- Live Google authorization initiation used the exact registered callback, openid/profile scopes, PKCE and a secure HTTP-only browser-binding cookie. This checks initiation, not Google's completed consent flow.
- Live password registration, sign-in, session restoration and logout passed through Vercel into Neon. Temporary verification accounts and sessions were removed.
- Neon-backed records and sessions survived a backend restart during the earlier persistence check. Migration upgrade tests preserve existing player IDs and password hashes. Render request logs were inspected.
- Automated tests cover OAuth replay/expiry/browser/session checks, account-link conflicts, concurrent Google registration and server-enforced 401/403 permissions.

Still awaiting human or separate operational verification:

- Complete a real Google sign-in and returning sign-in in a supported browser; link an existing player account and confirm its data remains accessible.
- Have another person sign in and verify that a creator-only action is refused with 403. The automated permission test already passes.
- Observe the first request after more than 15 minutes of Render inactivity and complete a backup/restore drill in a separate database.

The public class-showcase pull request is a separate submission requirement. It is not established by deploying this application.
