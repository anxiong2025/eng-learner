-- Migration: 0002_subtitle_cache
-- Cache YouTube subtitles to reduce third-party API calls

CREATE TABLE IF NOT EXISTS video_subtitles (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id       TEXT NOT NULL,
  lang           TEXT NOT NULL DEFAULT 'en',
  subtitles_json TEXT NOT NULL,
  created_at     TEXT DEFAULT (datetime('now')),
  UNIQUE(video_id, lang)
);
