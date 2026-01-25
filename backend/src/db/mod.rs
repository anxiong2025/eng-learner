use anyhow::Result;
use rusqlite::{Connection, params};
use std::sync::{Arc, Mutex};
use chrono::Utc;

pub type DbPool = Arc<Mutex<Connection>>;

/// Initialize database and create tables
pub fn init_db() -> Result<DbPool> {
    let conn = Connection::open("eng_learner.db")?;

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
    conn.execute(
        "CREATE TABLE IF NOT EXISTS user_vocabulary (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL DEFAULT 'default',
            vocabulary_id INTEGER NOT NULL REFERENCES vocabulary(id),
            ease_factor REAL DEFAULT 2.5,
            interval_days INTEGER DEFAULT 0,
            due_date TEXT,
            review_count INTEGER DEFAULT 0,
            lapses INTEGER DEFAULT 0,
            source_video_id TEXT,
            source_sentence TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            last_reviewed_at TEXT,
            UNIQUE(user_id, vocabulary_id)
        )",
        [],
    )?;

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

    // Initialize default user progress if not exists
    conn.execute(
        "INSERT OR IGNORE INTO user_progress (user_id) VALUES ('default')",
        [],
    )?;

    tracing::info!("Database initialized successfully");
    Ok(Arc::new(Mutex::new(conn)))
}

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
    pub due_date: Option<String>,
    pub review_count: i32,
    pub source_video_id: Option<String>,
    pub source_sentence: Option<String>,
    pub created_at: String,
}

/// Save a vocabulary word (upsert)
pub fn save_vocabulary(
    pool: &DbPool,
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

    // Insert user vocabulary record
    let today = Utc::now().format("%Y-%m-%d").to_string();
    conn.execute(
        "INSERT OR REPLACE INTO user_vocabulary
         (user_id, vocabulary_id, due_date, source_video_id, source_sentence, created_at)
         VALUES ('default', ?1, ?2, ?3, ?4, CURRENT_TIMESTAMP)",
        params![vocab_id, today, source_video_id, source_sentence],
    )?;

    Ok(vocab_id)
}

/// Get all saved vocabulary for review
pub fn get_vocabulary_list(pool: &DbPool, due_only: bool) -> Result<Vec<SavedVocabulary>> {
    let conn = pool.lock().unwrap();

    let today = Utc::now().format("%Y-%m-%d").to_string();

    let mut results = Vec::new();

    if due_only {
        let mut stmt = conn.prepare(
            "SELECT v.id, v.word, v.meaning, v.level, v.example,
                    uv.ease_factor, uv.interval_days, uv.due_date, uv.review_count,
                    uv.source_video_id, uv.source_sentence, uv.created_at
             FROM vocabulary v
             JOIN user_vocabulary uv ON v.id = uv.vocabulary_id
             WHERE uv.user_id = 'default' AND (uv.due_date IS NULL OR uv.due_date <= ?1)
             ORDER BY uv.due_date ASC"
        )?;
        let rows = stmt.query_map(params![today], |row| {
            Ok(SavedVocabulary {
                id: row.get(0)?,
                word: row.get(1)?,
                meaning: row.get(2)?,
                level: row.get(3)?,
                example: row.get(4)?,
                ease_factor: row.get(5)?,
                interval_days: row.get(6)?,
                due_date: row.get(7)?,
                review_count: row.get(8)?,
                source_video_id: row.get(9)?,
                source_sentence: row.get(10)?,
                created_at: row.get(11)?,
            })
        })?;
        for row in rows {
            results.push(row?);
        }
    } else {
        let mut stmt = conn.prepare(
            "SELECT v.id, v.word, v.meaning, v.level, v.example,
                    uv.ease_factor, uv.interval_days, uv.due_date, uv.review_count,
                    uv.source_video_id, uv.source_sentence, uv.created_at
             FROM vocabulary v
             JOIN user_vocabulary uv ON v.id = uv.vocabulary_id
             WHERE uv.user_id = 'default'
             ORDER BY uv.created_at DESC"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(SavedVocabulary {
                id: row.get(0)?,
                word: row.get(1)?,
                meaning: row.get(2)?,
                level: row.get(3)?,
                example: row.get(4)?,
                ease_factor: row.get(5)?,
                interval_days: row.get(6)?,
                due_date: row.get(7)?,
                review_count: row.get(8)?,
                source_video_id: row.get(9)?,
                source_sentence: row.get(10)?,
                created_at: row.get(11)?,
            })
        })?;
        for row in rows {
            results.push(row?);
        }
    }

    Ok(results)
}

/// Update vocabulary after review (SM-2 algorithm simplified)
pub fn review_vocabulary(pool: &DbPool, vocab_id: i64, quality: i32) -> Result<()> {
    let conn = pool.lock().unwrap();

    // Get current values
    let (ease_factor, interval_days): (f64, i32) = conn.query_row(
        "SELECT ease_factor, interval_days FROM user_vocabulary
         WHERE vocabulary_id = ?1 AND user_id = 'default'",
        params![vocab_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;

    // SM-2 algorithm (simplified)
    // quality: 0 = forgot, 1 = hard, 2 = good, 3 = easy
    let (new_interval, new_ease) = match quality {
        0 => (1, (ease_factor - 0.2).max(1.3)),  // Reset, decrease ease
        1 => ((interval_days as f64 * 1.2) as i32, ease_factor),  // Slight increase
        2 => ((interval_days as f64 * ease_factor) as i32, ease_factor),  // Normal
        3 => ((interval_days as f64 * ease_factor * 1.3) as i32, (ease_factor + 0.1).min(3.0)),  // Easy
        _ => (interval_days, ease_factor),
    };

    let new_interval = new_interval.max(1);  // Minimum 1 day
    let due_date = Utc::now()
        .checked_add_signed(chrono::Duration::days(new_interval as i64))
        .unwrap()
        .format("%Y-%m-%d")
        .to_string();

    conn.execute(
        "UPDATE user_vocabulary
         SET ease_factor = ?1, interval_days = ?2, due_date = ?3,
             review_count = review_count + 1, last_reviewed_at = CURRENT_TIMESTAMP
         WHERE vocabulary_id = ?4 AND user_id = 'default'",
        params![new_ease, new_interval, due_date, vocab_id],
    )?;

    Ok(())
}

/// Delete vocabulary from user's list
pub fn delete_vocabulary(pool: &DbPool, vocab_id: i64) -> Result<()> {
    let conn = pool.lock().unwrap();
    conn.execute(
        "DELETE FROM user_vocabulary WHERE vocabulary_id = ?1 AND user_id = 'default'",
        params![vocab_id],
    )?;
    Ok(())
}

/// Check if vocabulary is already saved
pub fn is_vocabulary_saved(pool: &DbPool, word: &str) -> Result<bool> {
    let conn = pool.lock().unwrap();
    let count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM vocabulary v
         JOIN user_vocabulary uv ON v.id = uv.vocabulary_id
         WHERE v.word = ?1 AND uv.user_id = 'default'",
        params![word],
        |row| row.get(0),
    )?;
    Ok(count > 0)
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
pub fn record_word_learned(pool: &DbPool) -> Result<()> {
    let conn = pool.lock().unwrap();
    let today = Utc::now().format("%Y-%m-%d").to_string();

    // Update or insert daily stats
    conn.execute(
        "INSERT INTO learning_stats (user_id, date, words_learned)
         VALUES ('default', ?1, 1)
         ON CONFLICT(user_id, date) DO UPDATE SET words_learned = words_learned + 1",
        params![today],
    )?;

    // Update user progress
    conn.execute(
        "UPDATE user_progress SET total_words_learned = total_words_learned + 1 WHERE user_id = 'default'",
        [],
    )?;

    // Update streak
    update_streak(&conn, &today)?;

    Ok(())
}

/// Record a review result
pub fn record_review(pool: &DbPool, is_correct: bool) -> Result<()> {
    let conn = pool.lock().unwrap();
    let today = Utc::now().format("%Y-%m-%d").to_string();

    // Update or insert daily stats
    if is_correct {
        conn.execute(
            "INSERT INTO learning_stats (user_id, date, words_reviewed, correct_count)
             VALUES ('default', ?1, 1, 1)
             ON CONFLICT(user_id, date) DO UPDATE SET
                words_reviewed = words_reviewed + 1,
                correct_count = correct_count + 1",
            params![today],
        )?;
    } else {
        conn.execute(
            "INSERT INTO learning_stats (user_id, date, words_reviewed, incorrect_count)
             VALUES ('default', ?1, 1, 1)
             ON CONFLICT(user_id, date) DO UPDATE SET
                words_reviewed = words_reviewed + 1,
                incorrect_count = incorrect_count + 1",
            params![today],
        )?;
    }

    // Update total reviews
    conn.execute(
        "UPDATE user_progress SET total_reviews = total_reviews + 1 WHERE user_id = 'default'",
        [],
    )?;

    // Update streak
    update_streak(&conn, &today)?;

    Ok(())
}

/// Update streak based on study date
fn update_streak(conn: &Connection, today: &str) -> Result<()> {
    let yesterday = (Utc::now() - chrono::Duration::days(1))
        .format("%Y-%m-%d")
        .to_string();

    let last_study_date: Option<String> = conn.query_row(
        "SELECT last_study_date FROM user_progress WHERE user_id = 'default'",
        [],
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
                 WHERE user_id = 'default'",
                params![today],
            )?;
        }
        _ => {
            // Streak broken or first time, reset to 1
            conn.execute(
                "UPDATE user_progress SET
                    current_streak = 1,
                    longest_streak = MAX(longest_streak, 1),
                    last_study_date = ?1
                 WHERE user_id = 'default'",
                params![today],
            )?;
        }
    }

    Ok(())
}

/// Get daily statistics for a date range
pub fn get_daily_stats(pool: &DbPool, days: i32) -> Result<Vec<DailyStats>> {
    let conn = pool.lock().unwrap();
    let start_date = (Utc::now() - chrono::Duration::days(days as i64))
        .format("%Y-%m-%d")
        .to_string();

    let mut stmt = conn.prepare(
        "SELECT date, words_learned, words_reviewed, correct_count, incorrect_count, study_time_minutes
         FROM learning_stats
         WHERE user_id = 'default' AND date >= ?1
         ORDER BY date DESC"
    )?;

    let rows = stmt.query_map(params![start_date], |row| {
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
pub fn get_user_progress(pool: &DbPool) -> Result<UserProgress> {
    let conn = pool.lock().unwrap();

    Ok(conn.query_row(
        "SELECT total_words_learned, total_reviews, current_streak, longest_streak, last_study_date
         FROM user_progress WHERE user_id = 'default'",
        [],
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
pub fn get_today_stats(pool: &DbPool) -> Result<DailyStats> {
    let conn = pool.lock().unwrap();
    let today = Utc::now().format("%Y-%m-%d").to_string();

    conn.query_row(
        "SELECT date, words_learned, words_reviewed, correct_count, incorrect_count, study_time_minutes
         FROM learning_stats
         WHERE user_id = 'default' AND date = ?1",
        params![today],
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
