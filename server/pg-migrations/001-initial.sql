CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  expires_at BIGINT NOT NULL
);

CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  creator_id TEXT NOT NULL REFERENCES accounts(id),
  time_zone TEXT NOT NULL,
  answer_time TEXT NOT NULL,
  reveal_time TEXT NOT NULL,
  pending TEXT,
  activation_date TEXT
);

CREATE TABLE memberships (
  group_id TEXT REFERENCES groups(id),
  account_id TEXT REFERENCES accounts(id),
  joined_at BIGINT NOT NULL,
  PRIMARY KEY(group_id, account_id)
);

CREATE TABLE invitations (
  id TEXT PRIMARY KEY,
  group_id TEXT REFERENCES groups(id),
  code_hash TEXT UNIQUE NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE custom_prompts (
  id TEXT PRIMARY KEY,
  group_id TEXT REFERENCES groups(id),
  text TEXT NOT NULL
);

CREATE TABLE prompt_usage (
  group_id TEXT REFERENCES groups(id),
  prompt_id TEXT,
  used_at BIGINT NOT NULL,
  PRIMARY KEY(group_id, prompt_id)
);

CREATE TABLE rounds (
  id TEXT PRIMARY KEY,
  group_id TEXT REFERENCES groups(id),
  local_date TEXT NOT NULL,
  prompt_id TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  opens_at BIGINT NOT NULL,
  answer_deadline BIGINT NOT NULL,
  reveal_at BIGINT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'answering',
  scored INTEGER NOT NULL DEFAULT 0,
  finalized INTEGER NOT NULL DEFAULT 0,
  is_test INTEGER NOT NULL DEFAULT 0,
  UNIQUE(group_id, local_date)
);

CREATE TABLE round_participants (
  round_id TEXT REFERENCES rounds(id),
  account_id TEXT REFERENCES accounts(id),
  PRIMARY KEY(round_id, account_id)
);

CREATE TABLE answers (
  id TEXT PRIMARY KEY,
  round_id TEXT REFERENCES rounds(id),
  account_id TEXT REFERENCES accounts(id),
  text TEXT NOT NULL,
  UNIQUE(round_id, account_id)
);

CREATE TABLE round_boards (
  round_id TEXT REFERENCES rounds(id),
  account_id TEXT REFERENCES accounts(id),
  answer_order TEXT NOT NULL,
  PRIMARY KEY(round_id, account_id)
);

CREATE TABLE guesses (
  round_id TEXT REFERENCES rounds(id),
  guesser_id TEXT REFERENCES accounts(id),
  answer_id TEXT REFERENCES answers(id),
  person_id TEXT REFERENCES accounts(id),
  PRIMARY KEY(round_id, guesser_id, answer_id),
  UNIQUE(round_id, guesser_id, person_id)
);

CREATE TABLE round_scores (
  round_id TEXT REFERENCES rounds(id),
  account_id TEXT REFERENCES accounts(id),
  score INTEGER NOT NULL,
  PRIMARY KEY(round_id, account_id)
);
