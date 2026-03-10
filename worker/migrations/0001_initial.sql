-- Migration: 0001_initial
-- Create all tables for eng-learner

-- ─── Users ───
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  avatar        TEXT,
  provider      TEXT NOT NULL,
  tier          TEXT DEFAULT 'free',
  invite_code   TEXT UNIQUE,
  bonus_quota   INTEGER DEFAULT 0,
  invited_by    TEXT,
  created_at    TEXT DEFAULT (datetime('now')),
  last_login_at TEXT
);

-- ─── Vocabulary ───
CREATE TABLE IF NOT EXISTS vocabulary (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  word       TEXT UNIQUE NOT NULL,
  meaning    TEXT NOT NULL,
  level      TEXT NOT NULL,
  example    TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ─── User Vocabulary ───
CREATE TABLE IF NOT EXISTS user_vocabulary (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          TEXT NOT NULL DEFAULT 'default',
  vocabulary_id    INTEGER NOT NULL REFERENCES vocabulary(id),
  ease_factor      REAL DEFAULT 2.5,
  interval_days    INTEGER DEFAULT 0,
  interval_minutes INTEGER DEFAULT 0,
  due_date         TEXT,
  due_at           TEXT,
  review_count     INTEGER DEFAULT 0,
  learning_step    INTEGER DEFAULT 0,
  lapses           INTEGER DEFAULT 0,
  source_video_id  TEXT,
  source_sentence  TEXT,
  created_at       TEXT DEFAULT (datetime('now')),
  last_reviewed_at TEXT,
  UNIQUE(user_id, vocabulary_id)
);

-- ─── Learning Statistics ───
CREATE TABLE IF NOT EXISTS learning_stats (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id            TEXT NOT NULL DEFAULT 'default',
  date               TEXT NOT NULL,
  words_learned      INTEGER DEFAULT 0,
  words_reviewed     INTEGER DEFAULT 0,
  correct_count      INTEGER DEFAULT 0,
  incorrect_count    INTEGER DEFAULT 0,
  study_time_minutes INTEGER DEFAULT 0,
  UNIQUE(user_id, date)
);

-- ─── User Progress ───
CREATE TABLE IF NOT EXISTS user_progress (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id              TEXT NOT NULL UNIQUE,
  total_words_learned  INTEGER DEFAULT 0,
  total_reviews        INTEGER DEFAULT 0,
  current_streak       INTEGER DEFAULT 0,
  longest_streak       INTEGER DEFAULT 0,
  last_study_date      TEXT,
  created_at           TEXT DEFAULT (datetime('now'))
);

-- ─── Notes ───
CREATE TABLE IF NOT EXISTS notes (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  video_id   TEXT NOT NULL,
  timestamp  REAL NOT NULL,
  english    TEXT,
  chinese    TEXT,
  note_text  TEXT,
  images     TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notes_user_video ON notes(user_id, video_id);

-- ─── Watch History ───
CREATE TABLE IF NOT EXISTS watch_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL,
  video_id   TEXT NOT NULL,
  title      TEXT NOT NULL,
  thumbnail  TEXT NOT NULL,
  watched_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_watch_history_user ON watch_history(user_id, watched_at);

-- ─── Daily Usage (Rate Limiting) ───
CREATE TABLE IF NOT EXISTS daily_usage (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           TEXT NOT NULL,
  date              TEXT NOT NULL,
  video_parse_count INTEGER DEFAULT 0,
  ai_chat_count     INTEGER DEFAULT 0,
  created_at        TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_usage_user_date ON daily_usage(user_id, date);

-- ─── Video Mindmap Cache ───
CREATE TABLE IF NOT EXISTS video_mindmaps (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id   TEXT UNIQUE NOT NULL,
  markdown   TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ─── Video Slides Cache ───
CREATE TABLE IF NOT EXISTS video_slides (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id   TEXT UNIQUE NOT NULL,
  slides_json TEXT NOT NULL,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- ─── Default user progress ───
INSERT OR IGNORE INTO user_progress (user_id) VALUES ('default');
