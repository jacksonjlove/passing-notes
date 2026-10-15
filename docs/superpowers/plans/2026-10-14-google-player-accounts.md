# Google player accounts implementation plan

> Execute inline using executing-plans; no subagents per user preference.

Goal: Google authentication and explicit account linking alongside existing passwords.
Architecture: Express OAuth routes, PostgreSQL attempts and identities, existing sessions, React account controls.
Tech stack: Node24, Express4, pg, Google official google-auth-library, React18.
Spec: ../specs/2026-10-14-google-player-accounts-design.md

## Constraints
- Preserve existing account IDs and data; append migrations only.
- Never link by email; require recent local password verification and exact session for linking.
- No provider tokens persisted; backend-only secrets; openid/profile only.
- Fixed origin callbacks, ten-minute single-use attempts, state/browser binding, PKCE and nonce.
- Maintain basic rollout mode until Google is ready; no live weakening before approved release.

## Tasks
1. Add security integration tests for Google login, replay/browser binding, identity collisions, linking and password compatibility. Run to confirm missing implementation.
2. Add migration003, Google provider adapter and routes. Update explicit account inserts, nullable password guard and schema requirements. Run targeted tests; review transactions, cookies and failure handling.
3. Add runtime mode validation and account/config endpoints, then Continue with Google and account-link UI. Test runtime modes and UI behavior; preserve invitations through redirect.
4. Run full PostgreSQL suite, formatting/build and diff checks. Document Google owner registration, separate local/live callbacks, secrets and authorization table. Create reviewable PR.
5. After owner credentials and merge approval, release through existing gated workflow. Verify real browser Google flow, linking and 401/403; report any remaining blocked checks.

## Verification

Implementation steps 1–4 complete: 86 tests in 21 files, formatting, build and diff checks pass against isolated PostgreSQL 17. Provider failures and security cases are simulated; a real Google round trip remains pending. Initial missing-module test failed as expected before implementation; an older migration test assumed two migrations and was corrected to copy current migrations. Separate upgrade coverage proves existing password hashes and IDs survive migration003.
