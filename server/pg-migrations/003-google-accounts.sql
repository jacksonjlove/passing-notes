ALTER TABLE accounts ALTER COLUMN password_hash DROP NOT NULL;
CREATE TABLE google_identities (
  subject TEXT PRIMARY KEY,
  account_id TEXT UNIQUE NOT NULL REFERENCES accounts(id)
);
CREATE TABLE oauth_attempts (
  state_hash TEXT PRIMARY KEY,
  browser_hash TEXT NOT NULL,
  nonce TEXT NOT NULL,
  verifier TEXT NOT NULL,
  account_id TEXT REFERENCES accounts(id),
  session_hash TEXT,
  invite TEXT,
  expires_at BIGINT NOT NULL
);
CREATE INDEX oauth_attempts_expiry ON oauth_attempts(expires_at);
