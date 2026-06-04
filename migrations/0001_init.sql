-- Community platform schema (accounts, calendar/events, threads, moderation).
-- Applied with: wrangler d1 migrations apply DB

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT,
  role          TEXT NOT NULL DEFAULT 'member',   -- member | leader
  dm_opt_in     INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  banned_at     TEXT,
  banned_by     TEXT
);

CREATE TABLE IF NOT EXISTS login_tokens (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  token_hash  TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'login',       -- login | invite
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  used_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_login_tokens_hash ON login_tokens(token_hash);

CREATE TABLE IF NOT EXISTS invites (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  invited_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  used_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_invites_email ON invites(email);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS events (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  description TEXT,
  location    TEXT,
  url         TEXT,
  starts_at   TEXT NOT NULL,        -- ISO 8601
  ends_at     TEXT,
  all_day     INTEGER NOT NULL DEFAULT 0,
  created_by  TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_starts ON events(starts_at);

CREATE TABLE IF NOT EXISTS threads (
  id          TEXT PRIMARY KEY,
  event_id    TEXT NOT NULL UNIQUE,    -- one thread per event
  started_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id            TEXT PRIMARY KEY,
  thread_id     TEXT NOT NULL,
  author_id     TEXT NOT NULL,
  body          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'published',  -- published | pending
  flagged_terms TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_thread ON posts(thread_id);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);

CREATE TABLE IF NOT EXISTS banned_terms (
  id          TEXT PRIMARY KEY,
  term        TEXT NOT NULL UNIQUE,
  created_by  TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS moderation_log (
  id           TEXT PRIMARY KEY,
  target_type  TEXT NOT NULL,
  target_id    TEXT NOT NULL,
  action       TEXT NOT NULL,           -- approve | reject | ban | term_add | term_remove
  moderator_id TEXT,
  reason       TEXT,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS archived_content (
  id            TEXT PRIMARY KEY,
  original_type TEXT NOT NULL,
  original_id   TEXT NOT NULL,
  author_id     TEXT,
  body          TEXT,
  flagged_terms TEXT,
  rejected_by   TEXT,
  rejected_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
  id           TEXT PRIMARY KEY,
  reporter_id  TEXT NOT NULL,
  target_type  TEXT NOT NULL,
  target_id    TEXT NOT NULL,
  reason       TEXT,
  created_at   TEXT NOT NULL,
  resolved_at  TEXT,
  resolved_by  TEXT
);
