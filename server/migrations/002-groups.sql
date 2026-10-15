CREATE TABLE groups(id TEXT PRIMARY KEY, name TEXT NOT NULL, creator_id TEXT NOT NULL REFERENCES accounts(id), time_zone TEXT NOT NULL, answer_time TEXT NOT NULL, reveal_time TEXT NOT NULL, pending TEXT, activation_date TEXT);
CREATE TABLE memberships(group_id TEXT REFERENCES groups(id), account_id TEXT REFERENCES accounts(id), joined_at INTEGER NOT NULL, PRIMARY KEY(group_id,account_id));
CREATE TABLE invitations(id TEXT PRIMARY KEY, group_id TEXT REFERENCES groups(id), code_hash TEXT UNIQUE NOT NULL, revoked INTEGER NOT NULL DEFAULT 0);
CREATE TABLE custom_prompts(id TEXT PRIMARY KEY, group_id TEXT REFERENCES groups(id), text TEXT NOT NULL);
CREATE TABLE prompt_usage(group_id TEXT REFERENCES groups(id), prompt_id TEXT, used_at INTEGER NOT NULL, PRIMARY KEY(group_id,prompt_id));
