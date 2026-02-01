use anyhow::Result;
use rusqlite::{Connection, params};
use std::sync::{Arc, Mutex};
use chrono::Utc;

pub type DbPool = Arc<Mutex<Connection>>;

/// Initialize database and create tables
pub fn init_db() -> Result<DbPool> {
    let conn = Connection::open("eng_learner.db")?;

    // Create users table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            avatar TEXT,
            provider TEXT NOT NULL,
            tier TEXT DEFAULT 'free',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            last_login_at TEXT
        )",
        [],
    )?;

    // Create vocabulary table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS vocabulary (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            word TEXT UNIQUE NOT NULL,
            meaning TEXT NOT NULL,
            level TEXT NOT NULL,
            example TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // Create user vocabulary learning record table
    // interval_minutes: time until next review in minutes (supports same-day reviews)
    // due_at: precise datetime for next review (ISO 8601)
    // learning_step: 0-3 for learning phase, 4+ for review phase
    conn.execute(
        "CREATE TABLE IF NOT EXISTS user_vocabulary (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL DEFAULT 'default',
            vocabulary_id INTEGER NOT NULL REFERENCES vocabulary(id),
            ease_factor REAL DEFAULT 2.5,
            interval_days INTEGER DEFAULT 0,
            interval_minutes INTEGER DEFAULT 0,
            due_date TEXT,
            due_at TEXT,
            review_count INTEGER DEFAULT 0,
            learning_step INTEGER DEFAULT 0,
            lapses INTEGER DEFAULT 0,
            source_video_id TEXT,
            source_sentence TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            last_reviewed_at TEXT,
            UNIQUE(user_id, vocabulary_id)
        )",
        [],
    )?;

    // Add new columns if they don't exist (for existing databases)
    let _ = conn.execute("ALTER TABLE user_vocabulary ADD COLUMN interval_minutes INTEGER DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE user_vocabulary ADD COLUMN due_at TEXT", []);
    let _ = conn.execute("ALTER TABLE user_vocabulary ADD COLUMN learning_step INTEGER DEFAULT 0", []);

    // Create learning statistics table (daily stats)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS learning_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL DEFAULT 'default',
            date TEXT NOT NULL,
            words_learned INTEGER DEFAULT 0,
            words_reviewed INTEGER DEFAULT 0,
            correct_count INTEGER DEFAULT 0,
            incorrect_count INTEGER DEFAULT 0,
            study_time_minutes INTEGER DEFAULT 0,
            UNIQUE(user_id, date)
        )",
        [],
    )?;

    // Create user progress table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS user_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL DEFAULT 'default' UNIQUE,
            total_words_learned INTEGER DEFAULT 0,
            total_reviews INTEGER DEFAULT 0,
            current_streak INTEGER DEFAULT 0,
            longest_streak INTEGER DEFAULT 0,
            last_study_date TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // Create notes table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            video_id TEXT NOT NULL,
            timestamp REAL NOT NULL,
            english TEXT NOT NULL,
            chinese TEXT,
            note_text TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // Create index on notes for faster lookups
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_notes_user_video ON notes(user_id, video_id)",
        [],
    )?;

    // Create watch history table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS watch_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            video_id TEXT NOT NULL,
            title TEXT NOT NULL,
            thumbnail TEXT NOT NULL,
            watched_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, video_id)
        )",
        [],
    )?;

    // Create index on watch history
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_watch_history_user ON watch_history(user_id, watched_at DESC)",
        [],
    )?;

    // Initialize default user progress if not exists
    conn.execute(
        "INSERT OR IGNORE INTO user_progress (user_id) VALUES ('default')",
        [],
    )?;

    tracing::info!("Database initialized successfully");
    Ok(Arc::new(Mutex::new(conn)))
}

// ============ User Functions ============

/// User data structure
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct User {
    pub id: String,
    pub email: String,
    pub name: String,
    pub avatar: Option<String>,
    pub provider: String,
    pub tier: String,
    pub created_at: Option<String>,
    pub last_login_at: Option<String>,
}

/// Create or update user on login
pub fn upsert_user(pool: &DbPool, user: &User) -> Result<()> {
    let conn = pool.lock().unwrap();
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    conn.execute(
        "INSERT INTO users (id, email, name, avatar, provider, tier, created_at, last_login_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'free', ?6, ?6)
         ON CONFLICT(id) DO UPDATE SET
            name = ?3,
            avatar = ?4,
            last_login_at = ?6",
        params![user.id, user.email, user.name, user.avatar, user.provider, now],
    )?;

    // Initialize user progress if not exists
    conn.execute(
        "INSERT OR IGNORE INTO user_progress (user_id) VALUES (?1)",
        params![user.id],
    )?;

    Ok(())
}

/// Get user by ID
pub fn get_user(pool: &DbPool, user_id: &str) -> Result<Option<User>> {
    let conn = pool.lock().unwrap();

    let result = conn.query_row(
        "SELECT id, email, name, avatar, provider, tier, created_at, last_login_at
         FROM users WHERE id = ?1",
        params![user_id],
        |row| {
            Ok(User {
                id: row.get(0)?,
                email: row.get(1)?,
                name: row.get(2)?,
                avatar: row.get(3)?,
                provider: row.get(4)?,
                tier: row.get(5)?,
                created_at: row.get(6)?,
                last_login_at: row.get(7)?,
            })
        },
    );

    match result {
        Ok(user) => Ok(Some(user)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

// ============ Vocabulary Functions ============

/// Saved vocabulary item with learning data
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SavedVocabulary {
    pub id: i64,
    pub word: String,
    pub meaning: String,
    pub level: String,
    pub example: Option<String>,
    pub ease_factor: f64,
    pub interval_days: i32,
    pub interval_minutes: i32,
    pub due_date: Option<String>,
    pub due_at: Option<String>,  // Precise datetime (ISO 8601)
    pub review_count: i32,
    pub learning_step: i32,  // 0-3: learning phase, 4+: review phase
    pub source_video_id: Option<String>,
    pub source_sentence: Option<String>,
    pub created_at: String,
    pub last_reviewed_at: Option<String>,
    pub memory_strength: f64,  // 0.0-1.0, based on forgetting curve
}

/// Ebbinghaus-based learning intervals in minutes
/// Learning phase (step 0-3): 20min, 60min, 540min (9h), 1440min (1 day)
/// Review phase (step 4+): SM-2 style with days
const LEARNING_INTERVALS: [i32; 4] = [20, 60, 540, 1440];

/// Calculate memory strength based on forgetting curve
/// Formula: strength = e^(-t/half_life)
/// Half-life is approximately 50% of the scheduled interval
fn calculate_memory_strength(
    last_reviewed_at: Option<&str>,
    interval_minutes: i32,
    learning_step: i32,
    created_at: &str,
) -> f64 {
    let now = Utc::now();

    // Get last activity time (review or creation)
    let last_time = if let Some(reviewed) = last_reviewed_at {
        chrono::NaiveDateTime::parse_from_str(reviewed, "%Y-%m-%d %H:%M:%S")
            .or_else(|_| chrono::NaiveDateTime::parse_from_str(reviewed, "%Y-%m-%dT%H:%M:%S"))
            .ok()
    } else {
        None
    };

    let last_time = last_time.unwrap_or_else(|| {
        // Fall back to created_at
        chrono::NaiveDateTime::parse_from_str(created_at, "%Y-%m-%d %H:%M:%S")
            .or_else(|_| chrono::NaiveDateTime::parse_from_str(created_at, "%Y-%m-%dT%H:%M:%S"))
            .unwrap_or_else(|_| now.naive_utc())
    });

    let elapsed_minutes = (now.naive_utc() - last_time).num_minutes() as f64;

    // Calculate half-life based on interval
    // For new words (step 0), use a shorter half-life
    let half_life = if learning_step == 0 && interval_minutes <= 20 {
        15.0  // New word: half-life of 15 minutes
    } else {
        // Half-life is approximately 40% of the interval for better prediction
        (interval_minutes as f64 * 0.4).max(10.0)
    };

    // Calculate memory strength using forgetting curve
    // strength = e^(-t/half_life)
    let strength = (-elapsed_minutes / half_life).exp();

    // Clamp to 0.0 - 1.0
    strength.clamp(0.0, 1.0)
}

/// Save a vocabulary word (upsert)
pub fn save_vocabulary(
    pool: &DbPool,
    user_id: &str,
    word: &str,
    meaning: &str,
    level: &str,
    example: Option<&str>,
    source_video_id: Option<&str>,
    source_sentence: Option<&str>,
) -> Result<i64> {
    let conn = pool.lock().unwrap();

    // Insert or get vocabulary
    conn.execute(
        "INSERT OR IGNORE INTO vocabulary (word, meaning, level, example) VALUES (?1, ?2, ?3, ?4)",
        params![word, meaning, level, example],
    )?;

    let vocab_id: i64 = conn.query_row(
        "SELECT id FROM vocabulary WHERE word = ?1",
        params![word],
        |row| row.get(0),
    )?;

    // Set first review to 20 minutes from now (Ebbinghaus first interval)
    let now = Utc::now();
    let today = now.format("%Y-%m-%d").to_string();
    let due_at = now
        .checked_add_signed(chrono::Duration::minutes(LEARNING_INTERVALS[0] as i64))
        .unwrap()
        .format("%Y-%m-%dT%H:%M:%S")
        .to_string();

    // Insert user vocabulary record with initial Ebbinghaus interval
    conn.execute(
        "INSERT OR REPLACE INTO user_vocabulary
         (user_id, vocabulary_id, due_date, due_at, interval_minutes, learning_step, source_video_id, source_sentence, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7, CURRENT_TIMESTAMP)",
        params![user_id, vocab_id, today, due_at, LEARNING_INTERVALS[0], source_video_id, source_sentence],
    )?;

    Ok(vocab_id)
}

/// Raw vocabulary row from database (before memory strength calculation)
struct VocabularyRow {
    id: i64,
    word: String,
    meaning: String,
    level: String,
    example: Option<String>,
    ease_factor: f64,
    interval_days: i32,
    interval_minutes: i32,
    due_date: Option<String>,
    due_at: Option<String>,
    review_count: i32,
    learning_step: i32,
    source_video_id: Option<String>,
    source_sentence: Option<String>,
    created_at: String,
    last_reviewed_at: Option<String>,
}

/// Get all saved vocabulary for review
pub fn get_vocabulary_list(pool: &DbPool, user_id: &str, due_only: bool) -> Result<Vec<SavedVocabulary>> {
    let conn = pool.lock().unwrap();

    // Use precise datetime for due_only check
    let now = Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();

    let mut raw_results: Vec<VocabularyRow> = Vec::new();

    if due_only {
        // Check both due_at (precise) and due_date (legacy) for backwards compatibility
        let mut stmt = conn.prepare(
            "SELECT v.id, v.word, v.meaning, v.level, v.example,
                    uv.ease_factor, uv.interval_days, COALESCE(uv.interval_minutes, 0),
                    uv.due_date, uv.due_at, uv.review_count, COALESCE(uv.learning_step, 0),
                    uv.source_video_id, uv.source_sentence, uv.created_at, uv.last_reviewed_at
             FROM vocabulary v
             JOIN user_vocabulary uv ON v.id = uv.vocabulary_id
             WHERE uv.user_id = ?1 AND (
                 uv.due_at IS NULL OR uv.due_at <= ?2
                 OR (uv.due_at IS NULL AND (uv.due_date IS NULL OR uv.due_date <= date(?2)))
             )
             ORDER BY COALESCE(uv.due_at, uv.due_date) ASC"
        )?;
        let rows = stmt.query_map(params![user_id, now], |row| {
            Ok(VocabularyRow {
                id: row.get(0)?,
                word: row.get(1)?,
                meaning: row.get(2)?,
                level: row.get(3)?,
                example: row.get(4)?,
                ease_factor: row.get(5)?,
                interval_days: row.get(6)?,
                interval_minutes: row.get(7)?,
                due_date: row.get(8)?,
                due_at: row.get(9)?,
                review_count: row.get(10)?,
                learning_step: row.get(11)?,
                source_video_id: row.get(12)?,
                source_sentence: row.get(13)?,
                created_at: row.get(14)?,
                last_reviewed_at: row.get(15)?,
            })
        })?;
        for row in rows {
            raw_results.push(row?);
        }
    } else {
        let mut stmt = conn.prepare(
            "SELECT v.id, v.word, v.meaning, v.level, v.example,
                    uv.ease_factor, uv.interval_days, COALESCE(uv.interval_minutes, 0),
                    uv.due_date, uv.due_at, uv.review_count, COALESCE(uv.learning_step, 0),
                    uv.source_video_id, uv.source_sentence, uv.created_at, uv.last_reviewed_at
             FROM vocabulary v
             JOIN user_vocabulary uv ON v.id = uv.vocabulary_id
             WHERE uv.user_id = ?1
             ORDER BY uv.created_at DESC"
        )?;
        let rows = stmt.query_map(params![user_id], |row| {
            Ok(VocabularyRow {
                id: row.get(0)?,
                word: row.get(1)?,
                meaning: row.get(2)?,
                level: row.get(3)?,
                example: row.get(4)?,
                ease_factor: row.get(5)?,
                interval_days: row.get(6)?,
                interval_minutes: row.get(7)?,
                due_date: row.get(8)?,
                due_at: row.get(9)?,
                review_count: row.get(10)?,
                learning_step: row.get(11)?,
                source_video_id: row.get(12)?,
                source_sentence: row.get(13)?,
                created_at: row.get(14)?,
                last_reviewed_at: row.get(15)?,
            })
        })?;
        for row in rows {
            raw_results.push(row?);
        }
    }

    // Convert to SavedVocabulary with calculated memory_strength
    let results: Vec<SavedVocabulary> = raw_results
        .into_iter()
        .map(|row| {
            let memory_strength = calculate_memory_strength(
                row.last_reviewed_at.as_deref(),
                row.interval_minutes,
                row.learning_step,
                &row.created_at,
            );
            SavedVocabulary {
                id: row.id,
                word: row.word,
                meaning: row.meaning,
                level: row.level,
                example: row.example,
                ease_factor: row.ease_factor,
                interval_days: row.interval_days,
                interval_minutes: row.interval_minutes,
                due_date: row.due_date,
                due_at: row.due_at,
                review_count: row.review_count,
                learning_step: row.learning_step,
                source_video_id: row.source_video_id,
                source_sentence: row.source_sentence,
                created_at: row.created_at,
                last_reviewed_at: row.last_reviewed_at,
                memory_strength,
            }
        })
        .collect();

    Ok(results)
}

/// Update vocabulary after review using Ebbinghaus-based intervals
/// Learning phase (step 0-3): 20min → 1h → 9h → 1day
/// Review phase (step 4+): SM-2 style with increasing days
pub fn review_vocabulary(pool: &DbPool, user_id: &str, vocab_id: i64, quality: i32) -> Result<()> {
    let conn = pool.lock().unwrap();

    // Get current values
    let (ease_factor, learning_step, interval_days): (f64, i32, i32) = conn.query_row(
        "SELECT ease_factor, COALESCE(learning_step, 0), interval_days FROM user_vocabulary
         WHERE vocabulary_id = ?1 AND user_id = ?2",
        params![vocab_id, user_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )?;

    let now = Utc::now();

    // quality: 0 = forgot, 1 = hard, 2 = good, 3 = easy
    let (new_interval_minutes, new_learning_step, new_ease, new_interval_days) = if quality < 2 {
        // Wrong answer - reset to beginning of learning phase
        (LEARNING_INTERVALS[0], 0, (ease_factor - 0.2).max(1.3), 0)
    } else if learning_step < 4 {
        // Still in learning phase - advance to next step
        let next_step = (learning_step + 1).min(4);
        if next_step < 4 {
            // Still learning
            (LEARNING_INTERVALS[next_step as usize], next_step, ease_factor, 0)
        } else {
            // Graduate to review phase - first review interval is 2 days
            (2 * 24 * 60, 4, ease_factor, 2)
        }
    } else {
        // Review phase - use SM-2 style intervals
        let new_interval_days = match quality {
            2 => ((interval_days as f64 * ease_factor) as i32).max(2),  // Good
            3 => ((interval_days as f64 * ease_factor * 1.3) as i32).max(3),  // Easy
            _ => interval_days.max(2),
        };
        let new_ease = if quality == 3 {
            (ease_factor + 0.1).min(3.0)
        } else {
            ease_factor
        };
        (new_interval_days * 24 * 60, learning_step + 1, new_ease, new_interval_days)
    };

    // Calculate next due datetime
    let due_at = now
        .checked_add_signed(chrono::Duration::minutes(new_interval_minutes as i64))
        .unwrap()
        .format("%Y-%m-%dT%H:%M:%S")
        .to_string();

    let due_date = now
        .checked_add_signed(chrono::Duration::minutes(new_interval_minutes as i64))
        .unwrap()
        .format("%Y-%m-%d")
        .to_string();

    conn.execute(
        "UPDATE user_vocabulary
         SET ease_factor = ?1, interval_days = ?2, interval_minutes = ?3,
             due_date = ?4, due_at = ?5, learning_step = ?6,
             review_count = review_count + 1, last_reviewed_at = CURRENT_TIMESTAMP
         WHERE vocabulary_id = ?7 AND user_id = ?8",
        params![new_ease, new_interval_days, new_interval_minutes, due_date, due_at, new_learning_step, vocab_id, user_id],
    )?;

    Ok(())
}

/// Delete vocabulary from user's list
pub fn delete_vocabulary(pool: &DbPool, user_id: &str, vocab_id: i64) -> Result<()> {
    let conn = pool.lock().unwrap();
    conn.execute(
        "DELETE FROM user_vocabulary WHERE vocabulary_id = ?1 AND user_id = ?2",
        params![vocab_id, user_id],
    )?;
    Ok(())
}

/// Check if vocabulary is already saved
pub fn is_vocabulary_saved(pool: &DbPool, user_id: &str, word: &str) -> Result<bool> {
    let conn = pool.lock().unwrap();
    let count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM vocabulary v
         JOIN user_vocabulary uv ON v.id = uv.vocabulary_id
         WHERE v.word = ?1 AND uv.user_id = ?2",
        params![word, user_id],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

// ============ Notes Functions ============

/// Note data structure
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Note {
    pub id: String,
    pub user_id: String,
    pub video_id: String,
    pub timestamp: f64,
    pub english: String,
    pub chinese: Option<String>,
    pub note_text: Option<String>,
    pub created_at: String,
}

/// Save a note
pub fn save_note(pool: &DbPool, note: &Note) -> Result<()> {
    let conn = pool.lock().unwrap();
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    conn.execute(
        "INSERT OR REPLACE INTO notes (id, user_id, video_id, timestamp, english, chinese, note_text, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![note.id, note.user_id, note.video_id, note.timestamp, note.english, note.chinese, note.note_text, now],
    )?;

    Ok(())
}

/// Get all notes for a user
pub fn get_notes(pool: &DbPool, user_id: &str) -> Result<Vec<Note>> {
    let conn = pool.lock().unwrap();

    let mut stmt = conn.prepare(
        "SELECT id, user_id, video_id, timestamp, english, chinese, note_text, created_at
         FROM notes WHERE user_id = ?1 ORDER BY created_at DESC"
    )?;

    let rows = stmt.query_map(params![user_id], |row| {
        Ok(Note {
            id: row.get(0)?,
            user_id: row.get(1)?,
            video_id: row.get(2)?,
            timestamp: row.get(3)?,
            english: row.get(4)?,
            chinese: row.get(5)?,
            note_text: row.get(6)?,
            created_at: row.get(7)?,
        })
    })?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row?);
    }

    Ok(results)
}

/// Get notes for a specific video
pub fn get_notes_by_video(pool: &DbPool, user_id: &str, video_id: &str) -> Result<Vec<Note>> {
    let conn = pool.lock().unwrap();

    let mut stmt = conn.prepare(
        "SELECT id, user_id, video_id, timestamp, english, chinese, note_text, created_at
         FROM notes WHERE user_id = ?1 AND video_id = ?2 ORDER BY timestamp ASC"
    )?;

    let rows = stmt.query_map(params![user_id, video_id], |row| {
        Ok(Note {
            id: row.get(0)?,
            user_id: row.get(1)?,
            video_id: row.get(2)?,
            timestamp: row.get(3)?,
            english: row.get(4)?,
            chinese: row.get(5)?,
            note_text: row.get(6)?,
            created_at: row.get(7)?,
        })
    })?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row?);
    }

    Ok(results)
}

/// Delete a note
pub fn delete_note(pool: &DbPool, user_id: &str, note_id: &str) -> Result<()> {
    let conn = pool.lock().unwrap();
    conn.execute(
        "DELETE FROM notes WHERE id = ?1 AND user_id = ?2",
        params![note_id, user_id],
    )?;
    Ok(())
}

// ============ Learning Statistics Functions ============

/// Daily learning statistics
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DailyStats {
    pub date: String,
    pub words_learned: i32,
    pub words_reviewed: i32,
    pub correct_count: i32,
    pub incorrect_count: i32,
    pub study_time_minutes: i32,
}

/// User progress data
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct UserProgress {
    pub total_words_learned: i32,
    pub total_reviews: i32,
    pub current_streak: i32,
    pub longest_streak: i32,
    pub last_study_date: Option<String>,
}

/// Record a word learned (new vocabulary saved)
pub fn record_word_learned(pool: &DbPool, user_id: &str) -> Result<()> {
    let conn = pool.lock().unwrap();
    let today = Utc::now().format("%Y-%m-%d").to_string();

    // Update or insert daily stats
    conn.execute(
        "INSERT INTO learning_stats (user_id, date, words_learned)
         VALUES (?1, ?2, 1)
         ON CONFLICT(user_id, date) DO UPDATE SET words_learned = words_learned + 1",
        params![user_id, today],
    )?;

    // Update user progress
    conn.execute(
        "UPDATE user_progress SET total_words_learned = total_words_learned + 1 WHERE user_id = ?1",
        params![user_id],
    )?;

    // Update streak
    update_streak(&conn, user_id, &today)?;

    Ok(())
}

/// Record a review result
pub fn record_review(pool: &DbPool, user_id: &str, is_correct: bool) -> Result<()> {
    let conn = pool.lock().unwrap();
    let today = Utc::now().format("%Y-%m-%d").to_string();

    // Update or insert daily stats
    if is_correct {
        conn.execute(
            "INSERT INTO learning_stats (user_id, date, words_reviewed, correct_count)
             VALUES (?1, ?2, 1, 1)
             ON CONFLICT(user_id, date) DO UPDATE SET
                words_reviewed = words_reviewed + 1,
                correct_count = correct_count + 1",
            params![user_id, today],
        )?;
    } else {
        conn.execute(
            "INSERT INTO learning_stats (user_id, date, words_reviewed, incorrect_count)
             VALUES (?1, ?2, 1, 1)
             ON CONFLICT(user_id, date) DO UPDATE SET
                words_reviewed = words_reviewed + 1,
                incorrect_count = incorrect_count + 1",
            params![user_id, today],
        )?;
    }

    // Update total reviews
    conn.execute(
        "UPDATE user_progress SET total_reviews = total_reviews + 1 WHERE user_id = ?1",
        params![user_id],
    )?;

    // Update streak
    update_streak(&conn, user_id, &today)?;

    Ok(())
}

/// Update streak based on study date
fn update_streak(conn: &Connection, user_id: &str, today: &str) -> Result<()> {
    let yesterday = (Utc::now() - chrono::Duration::days(1))
        .format("%Y-%m-%d")
        .to_string();

    let last_study_date: Option<String> = conn.query_row(
        "SELECT last_study_date FROM user_progress WHERE user_id = ?1",
        params![user_id],
        |row| row.get(0),
    ).ok();

    match last_study_date {
        Some(ref date) if date == today => {
            // Already studied today, no update needed
        }
        Some(ref date) if date == &yesterday => {
            // Studied yesterday, increment streak
            conn.execute(
                "UPDATE user_progress SET
                    current_streak = current_streak + 1,
                    longest_streak = MAX(longest_streak, current_streak + 1),
                    last_study_date = ?1
                 WHERE user_id = ?2",
                params![today, user_id],
            )?;
        }
        _ => {
            // Streak broken or first time, reset to 1
            conn.execute(
                "UPDATE user_progress SET
                    current_streak = 1,
                    longest_streak = MAX(longest_streak, 1),
                    last_study_date = ?1
                 WHERE user_id = ?2",
                params![today, user_id],
            )?;
        }
    }

    Ok(())
}

/// Get daily statistics for a date range
pub fn get_daily_stats(pool: &DbPool, user_id: &str, days: i32) -> Result<Vec<DailyStats>> {
    let conn = pool.lock().unwrap();
    let start_date = (Utc::now() - chrono::Duration::days(days as i64))
        .format("%Y-%m-%d")
        .to_string();

    let mut stmt = conn.prepare(
        "SELECT date, words_learned, words_reviewed, correct_count, incorrect_count, study_time_minutes
         FROM learning_stats
         WHERE user_id = ?1 AND date >= ?2
         ORDER BY date DESC"
    )?;

    let rows = stmt.query_map(params![user_id, start_date], |row| {
        Ok(DailyStats {
            date: row.get(0)?,
            words_learned: row.get(1)?,
            words_reviewed: row.get(2)?,
            correct_count: row.get(3)?,
            incorrect_count: row.get(4)?,
            study_time_minutes: row.get(5)?,
        })
    })?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row?);
    }

    Ok(results)
}

/// Get user progress
pub fn get_user_progress(pool: &DbPool, user_id: &str) -> Result<UserProgress> {
    let conn = pool.lock().unwrap();

    // Ensure user progress exists
    conn.execute(
        "INSERT OR IGNORE INTO user_progress (user_id) VALUES (?1)",
        params![user_id],
    )?;

    Ok(conn.query_row(
        "SELECT total_words_learned, total_reviews, current_streak, longest_streak, last_study_date
         FROM user_progress WHERE user_id = ?1",
        params![user_id],
        |row| {
            Ok(UserProgress {
                total_words_learned: row.get(0)?,
                total_reviews: row.get(1)?,
                current_streak: row.get(2)?,
                longest_streak: row.get(3)?,
                last_study_date: row.get(4)?,
            })
        },
    )?)
}

/// Get today's statistics
pub fn get_today_stats(pool: &DbPool, user_id: &str) -> Result<DailyStats> {
    let conn = pool.lock().unwrap();
    let today = Utc::now().format("%Y-%m-%d").to_string();

    conn.query_row(
        "SELECT date, words_learned, words_reviewed, correct_count, incorrect_count, study_time_minutes
         FROM learning_stats
         WHERE user_id = ?1 AND date = ?2",
        params![user_id, today],
        |row| {
            Ok(DailyStats {
                date: row.get(0)?,
                words_learned: row.get(1)?,
                words_reviewed: row.get(2)?,
                correct_count: row.get(3)?,
                incorrect_count: row.get(4)?,
                study_time_minutes: row.get(5)?,
            })
        },
    ).or_else(|_| {
        // Return empty stats for today if not exists
        Ok(DailyStats {
            date: today,
            words_learned: 0,
            words_reviewed: 0,
            correct_count: 0,
            incorrect_count: 0,
            study_time_minutes: 0,
        })
    })
}

// ============ Watch History Functions ============

/// Watch history item
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct WatchHistoryItem {
    pub video_id: String,
    pub title: String,
    pub thumbnail: String,
    pub watched_at: String,
}

/// Add to watch history (upsert)
pub fn add_watch_history(pool: &DbPool, user_id: &str, video_id: &str, title: &str, thumbnail: &str) -> Result<()> {
    let conn = pool.lock().unwrap();
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    conn.execute(
        "INSERT INTO watch_history (user_id, video_id, title, thumbnail, watched_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(user_id, video_id) DO UPDATE SET
            title = ?3,
            thumbnail = ?4,
            watched_at = ?5",
        params![user_id, video_id, title, thumbnail, now],
    )?;

    Ok(())
}

/// Get watch history for user
pub fn get_watch_history(pool: &DbPool, user_id: &str, limit: i32) -> Result<Vec<WatchHistoryItem>> {
    let conn = pool.lock().unwrap();

    let mut stmt = conn.prepare(
        "SELECT video_id, title, thumbnail, watched_at
         FROM watch_history
         WHERE user_id = ?1
         ORDER BY watched_at DESC
         LIMIT ?2"
    )?;

    let rows = stmt.query_map(params![user_id, limit], |row| {
        Ok(WatchHistoryItem {
            video_id: row.get(0)?,
            title: row.get(1)?,
            thumbnail: row.get(2)?,
            watched_at: row.get(3)?,
        })
    })?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row?);
    }

    Ok(results)
}

/// Delete from watch history
pub fn delete_watch_history(pool: &DbPool, user_id: &str, video_id: &str) -> Result<()> {
    let conn = pool.lock().unwrap();
    conn.execute(
        "DELETE FROM watch_history WHERE user_id = ?1 AND video_id = ?2",
        params![user_id, video_id],
    )?;
    Ok(())
}

/// Clear all watch history for user
pub fn clear_watch_history(pool: &DbPool, user_id: &str) -> Result<()> {
    let conn = pool.lock().unwrap();
    conn.execute(
        "DELETE FROM watch_history WHERE user_id = ?1",
        params![user_id],
    )?;
    Ok(())
}
