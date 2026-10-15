# Google sign-in for player accounts

## Approved product direction

Anyone with a Google account may create a player account or sign in. Google is another way into the existing player account system; username/password login remains. Existing accounts, memberships, answers and scores remain intact. Group invitations remain required. The shared Basic Auth gate is retired when Google is configured and the release is verified.

## Approach

Extend the existing Express authentication routes and PostgreSQL account model with Google OpenID Connect authorization-code login, using a maintained library for token verification. Keep the existing first-party session cookies. Alternatives were migrating all authentication to a hosted identity service, or keeping a second Google gate before player login; both introduce extra account/session complexity and the latter requires two sign-ins.

## Player experience

The existing sign-in/create-profile screen gains Continue with Google. A first Google sign-in creates a player account with a unique generated username and a display name from Google's basic profile, falling back to a neutral player name. Returning Google users reach the same account. Invitations survive the redirect so joining remains an explicit action in the app.

Signed-in players get an Account control with Link Google. Linking requires a recent local-password check for password accounts (or a recent Google authentication for an already linked account), the current session, and a fresh Google authorization. Explain which Passing Notes account will receive the link before redirect. Confirm successful linking after return. A Google identity already linked to another player cannot be moved or silently merged. No automatic email-based linking. Unlinking and account merging are outside this release.

## OAuth and account security

Server generates random state, nonce and PKCE verifier for each attempt. Store short-lived, single-use attempt records in PostgreSQL, binding each to a random HTTP-only, SameSite=Lax browser cookie; only hashes of browser/state identifiers are stored. Expire after ten minutes; atomically consume before exchanging the code. For linking, also bind the initiating player and exact session, recheck that session on callback and reject changed/expired sessions. Initiation uses a same-origin JSON POST to prevent unwanted link/login initiation; then navigate to Google's authorization URL.

Backend exchanges the code using the client secret and validates ID token signature, issuer, audience, expiry and nonce. Use Google's stable subject identifier as identity, never email as a primary key. Request only openid and profile; email is unnecessary because account linking is explicit and there are no email features. Do not store provider access/refresh tokens or request offline access. OAuth-only accounts have a nullable password hash and password login safely rejects them. No changes to existing password hashes.

External redirects are fixed to the configured app origin. Preserve only a validated invitation token in the attempt record, never an arbitrary return URL. Show generic actionable failures; do not include authorization codes, tokens, secrets or provider error detail in logs/URLs shown to the user. Clear the attempt cookie and use a clean post-callback redirect. Apply no-store and no-referrer headers to auth responses. Bound provider requests with timeouts; failed/canceled attempts require an explicit new attempt.

## Data changes

Append a migration that allows accounts.password_hash to be null, creates google_identities with unique Google subject and unique account_id referencing accounts, and creates expiring oauth_attempts. Resolve/create accounts and identities transactionally with uniqueness constraints handling concurrent callbacks. Existing rows and account IDs stay unchanged. Update registration to name insert columns explicitly. Attempt cleanup runs with existing maintenance and is bounded.

## Authorization

| Level | Server-enforced access |
| --- | --- |
| Visitor | Public frontend, provider configuration, registration/login and version only; /api/groups returns 401 |
| Signed-in player | Own account; create groups; join with invitations; only read groups they belong to and submit their own eligible answers/guesses |
| Group creator | Player access plus settings, invitations and prompt management for groups they created |

Authentication provider never changes membership or creator privileges. Extend tests proving 401 without sessions, and 403 for member attempts at creator-only actions.

## Configuration and registration

The owner registers Google web application clients in Google Cloud and enters GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET directly in Render. Production callback: https://passing-notes.vercel.app/api/auth/google/callback. Local callback: http://localhost:5174/api/auth/google/callback, through Vite's existing API proxy. Prefer separate development/production clients under Google's current production-readiness guidance; never commit credentials. Runtime derives callback solely from APP_ORIGIN, not incoming host headers.

Google audience is External, unrestricted to a Workspace domain, using the publishing status appropriate for public use. The owner completes any required branding/privacy/verification steps. Configure client identifiers on the backend only. Tests inject a fake provider and never call Google or the live production database.

Use an explicit authentication mode for a safe rollout: retain Basic mode until the Google credentials are ready; Google/player mode requires complete provider config and bypasses the Basic gate even while old credentials remain configured. Local development can use password login without Google. Never silently fall back to unprotected production when credentials are missing. Remove obsolete shared-credential settings after live checks. Keep production version access public in both modes.

## Validation and delivery

Test valid and returning Google users, name collisions, explicit linking, conflicting identities, missing/expired/replayed state, browser/session mismatch, invalid token claims, nonce mismatch, canceled consent, provider failures, malicious return paths, and password-account compatibility. Verify local unit/integration tests, formatting and build before a PR; deployment remains gated by GitHub checks and forward-only migrations.

Owner approval is required before merging the reviewable PR. After registration/configuration, verify the actual Google round trip in a normal supported browser, existing password login, account linking preserving data, invite preservation, logout, 401 and 403 responses, and matching version SHAs. Simulated OAuth tests alone do not establish live Google success. Record settings and authorization levels in DEPLOY.md. The existing 15-minute wake and backup-restore checks remain separate outstanding acceptance checks.

## References

- https://developers.google.com/identity/openid-connect/openid-connect
- https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance
