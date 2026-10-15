# Google player sign-in setup

Google is an additional way to sign into the same player accounts. Password accounts remain supported. Existing players should sign in with their player password, open Account, and choose Link Google. A first Google sign-in without linking creates a new account; accounts are never automatically merged by name or email. Google-only players do not have a password. Groups still require invitations.

## Owner registration

You register the application in Google Cloud's Google Auth Platform. Create a project or select your existing project; configure Branding and Audience for External users, without restricting access to your organization. Follow Google's current publishing/verification requirements for a public app. Use your contact details and the actual app identity; no agent should invent a legal privacy policy or consent to terms for you.

Create a Web application OAuth client. Production authorized redirect URI, exactly:

    https://passing-notes.vercel.app/api/auth/google/callback

For local development create a separate development client with:

    http://localhost:5174/api/auth/google/callback

This is the frontend/Vite address, which proxies the callback to Express, allowing the browser binding and player cookies to stay on the frontend host. Do not register a Render callback or a branch-preview URL. The server derives the redirect from APP_ORIGIN; never change production APP_ORIGIN to test locally. This server authorization-code flow does not require frontend client secrets or the JavaScript widget.

Ask Google only for openid and profile. These identify the Google account and supply its display name. Email, contacts, Drive, Gmail, offline access and refresh tokens are not requested. There is no Google email/domain allowlist in the app.

## Backend settings

Add these in Render Environment, entering values yourself:

| Setting | Purpose |
| --- | --- |
| GOOGLE_CLIENT_ID | Production web OAuth client identifier |
| GOOGLE_CLIENT_SECRET | Production client secret; backend only |
| AUTH_MODE | basic during preparation; google for the approved Google release |
| APP_ORIGIN | Existing https://passing-notes.vercel.app origin, unchanged |
| SECURE_COOKIES | Existing 1, unchanged |
| DATABASE_URL | Existing pooled Neon database connection, unchanged |

Choose Save only when first adding Google credentials. Keep AUTH_MODE=basic (the default) until the Google implementation is approved for release. Google mode ignores the shared gate and requires both Google settings, HTTPS and secure cookies. After successful verification remove both BASIC_AUTH_USERNAME and BASIC_AUTH_PASSWORD together. No provider secret belongs in Vercel, source control, the PR, chat, or GitHub variables. Local secrets can be placed in ignored .env.local; do not reuse the production database for tests.

## Release checks

The migration adds identity/attempt tables and permits a null password only for Google-created accounts. It does not change existing account IDs, passwords, groups, answers or scores. GitHub applies it before deploying, as with existing migrations. The old basic-mode backend remains compatible with the added schema during deployment.

Before switching modes, the release must pass PostgreSQL tests, formatting and production build. After release, use a normal supported browser for the actual Google round trip. Google may reject sign-in within embedded browsers; open the public app in your regular browser if needed.

Verify first sign-in, returning sign-in, a linked existing player retaining data, an invitation surviving Google redirects, password login, logout, a 401 on /api/groups without a session, and a 403 when a group member tries a creator action. Confirm /api/version reports latest main on both hosts. Simulated-provider tests are not proof of a real Google login.

## References

- https://developers.google.com/identity/openid-connect/openid-connect
- https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance
- https://docs.cloud.google.com/nodejs/docs/reference/google-auth-library/latest
