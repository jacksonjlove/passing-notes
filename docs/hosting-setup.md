# Passing Notes hosting setup

Create free Vercel, Render and Neon accounts using your existing GitHub account where convenient. This guide uses the public jacksonjlove/passing-notes repository; it does not change its visibility. Sign in yourself and enter all secret values directly into host/GitHub settings. Never paste secrets into chat or commit them.

## 1. Neon: fresh production database

The selected Neon production branch is now configured and verified; see [Neon verification](neon-verification.md). For a fresh installation, create a dedicated project/database for production, preferably in a region near your Render service. Do not upload the old SQLite file. Obtain its pooled connection for Render DATABASE_URL and direct connection for GitHub PRODUCTION_DATABASE_URL. Both use TLS; the app forces certificate verification for remote connections. Local and test databases remain separate.

## 2. Render: backend

Create a Free Node Web Service linked to jacksonjlove/passing-notes, branch main, repository root. Build: npm ci. Start: npm run server. Node: 24. Disable automatic deployment (Auto-Deploy off); the GitHub workflow will trigger a specific tested commit through the service's secret Deploy Hook URL.

Enter DATABASE_URL, BASIC_AUTH_USERNAME and BASIC_AUTH_PASSWORD as secrets. Set NODE_ENV=production, NODE_VERSION=24, SECURE_COOKIES=1 and LOCAL_TEST_CONTROLS=0. Once Vercel gives you the stable frontend origin, set APP_ORIGIN to that exact HTTPS origin without a trailing slash. PORT and RENDER_GIT_COMMIT are provided by Render. Do not configure a SQLite path or disk.

Before migrations have run, the initial Render launch may fail its schema check. That is expected during provisioning; the first successful gated release migrates before requesting its backend deployment. Use /api/version as the public service health path, if configuring one.

## 3. Vercel: frontend

Create a Vite project for this repository with Root Directory left empty (repository root), build npm run build, output dist, Node 24. Use a personal Hobby account owned by the Git commit author; check account/repository eligibility before linking. Keep the repository private if it is private. Independent Git deployments are disabled by vercel.json (git.deploymentEnabled=false); confirm this in project settings. Do not add database secrets or shared passwords to frontend environment values.

Record the stable project URL and public account/project IDs. Create an owner deployment token in Vercel settings; enter it only in GitHub's production environment. The workflow runs the Vercel CLI from the repository root to match the standalone repository layout. It replaces the explicitly marked example API rewrite destination with the public RENDER_API_URL before building; no secret is added to that configuration. For manual local preview packaging, set the public RENDER_API_URL and run npm run hosting:configure from the repository root first.

Confirm that /api routes proxy to Render rather than return the SPA's HTML. Confirm public visitors can load the stable frontend URL; any Vercel platform protection requiring a Vercel account must be configured to permit intended visitors. Branch previews must not gain access to the production API.

## 4. GitHub: production deployment settings

Create an environment named production in repository Settings > Environments. Allow main deployments and do not add a required manual reviewer if you want unattended main deployments. Enable Actions for the repository.

Add secrets PRODUCTION_DATABASE_URL, RENDER_DEPLOY_HOOK_URL and VERCEL_TOKEN. Add environment variables VERCEL_ORG_ID, VERCEL_PROJECT_ID, RENDER_API_URL (Render HTTPS base URL) and APP_URL (stable Vercel origin). See DEPLOY.md for every runtime setting. Never give a pull-request job production secrets or use pull_request_target to run contributed code.

Push the reviewed implementation to main only after the branch is approved to land. The workflow tests every main push, including documentation changes; then it migrates Neon, deploys Render at that full SHA, and waits up to 15 minutes for /api/version to match. Only then does it build/deploy Vercel. A failure stops the remaining steps. Inspect the Actions log and Render deployment status; a deployment-hook success alone does not mean the backend is ready.

## 5. Live acceptance checklist

- [ ] Replace App:/API: in DEPLOY.md with verified URLs. Protected: stays /api/groups.
- [ ] GET direct Render /api/version and Vercel /api/version without authentication; both report latest main SHA.
- [ ] Request /api/groups without shared credentials; both URLs refuse with 401 and a Basic challenge.
- [ ] Open the Vercel /api/access link, use the browser's shared-password prompt, and return home. Register/sign in, refresh, then sign out. Verify cookies are secure, HTTP-only, SameSite=Lax, host-only and forwarded correctly. Do not put credentials in a URL or JavaScript.
- [ ] Have three test players join a group. Verify a member cannot change creator settings; authors remain secret until reveal.
- [ ] Add live data, push a small visible change through main, and confirm the change appears with the new version SHA while that data remains.
- [ ] Confirm failing PR tests never enter the production job and both hosts' independent Git deployment triggers remain off.
- [ ] Leave the app idle for more than 15 minutes. The next visit should show connecting feedback while Render wakes; if a proxy timeout occurs, explicit retry should succeed without resending mutations. Verify persisted deadlines reconcile correctly.
- [ ] Check desktop and 360px layouts, answer drafts and matching retries.
- [ ] Sign in to Render's supported CLI or connector yourself; make a request and inspect its redacted request log. Runtime logs include method, route pattern and status, never bodies/cookies/credentials. Check forwarding behavior before enabling any proxy trust setting; by default rate limits are conservative for proxy traffic.
- [ ] Export and restore production data into a separate restore-test database and compare representative table counts.

Record actual outcomes in DEPLOY.md/BUILD_STATUS.md. Until these pass, the project is prepared for hosting, not verified online.

## Backup and compatible rollback

Use an owner-controlled PostgreSQL client with the production direct connection supplied through environment variables; pg_dump --format=custom --file=passing-notes.backup uses standard PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD/PGSSLMODE settings. Obtain those settings yourself from Neon and keep them out of command history/chat. Keep the backup outside the Git repository and restrict file access.

Restore with pg_restore --no-owner --no-acl --dbname=passing_notes_restore passing-notes.backup against a separately provisioned restore-test server/database, using its separate environment settings. Confirm the target name and endpoint before restoration; never run restore or clean commands against production. Compare accounts/groups/rounds/answers/guesses/round_scores counts with the export source. This backup is private data and must not be committed.

A failed frontend deployment can leave a new backend serving an old frontend. Keep schema and API changes backward-compatible. Repair the app or redeploy previously tested compatible code; do not automatically reverse database migrations. A schema migration that already succeeded is still applied even if a later host step fails.

## Official references

- [Render Free behavior](https://render.com/docs/free)
- [Render deploy hooks and exact commits](https://render.com/docs/deploy-hooks)
- [Render commit environment variable](https://render.com/docs/environment-variables)
- [Vercel rewrites](https://vercel.com/docs/routing/rewrites)
- [Disable independent Vercel Git deployments](https://vercel.com/docs/project-configuration/git-configuration)
- [Vercel repository/account eligibility](https://vercel.com/docs/git)
- [Neon plans](https://neon.com/pricing)
