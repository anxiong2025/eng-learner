-- Migration: 0003_email_auth
-- Add support for email/password authentication

-- Add password_hash and email_verified columns to users table
ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0;

-- Email verification codes table
CREATE TABLE IF NOT EXISTS email_verification_codes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL,
  code       TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'verify',  -- 'verify' or 'reset'
  expires_at TEXT NOT NULL,
  used       INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_verification_email ON email_verification_codes(email, code, type);
