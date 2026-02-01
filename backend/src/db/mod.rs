use anyhow::Result;
use sqlx::{PgPool, postgres::PgPoolOptions, Row};
use chrono::Utc;

pub type DbPool = PgPool;

/// Initialize database and create tables
pub async fn init_db() -> Result<DbPool> {
    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set");

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await?;

    // Create users table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            avatar TEXT,
            provider TEXT NOT NULL,
            tier TEXT DEFAULT 'free',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            last_login_at TIMESTAMPTZ
        )"
    ).execute(&pool).await?;

    // Create vocabulary table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS vocabulary (
            id SERIAL PRIMARY KEY,
            word TEXT UNIQUE NOT NULL,
            meaning TEXT NOT NULL,
            level TEXT NOT NULL,
            example TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )"
    ).execute(&pool).await?;

    // Create user vocabulary learning record table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS user_vocabulary (
            id SERIAL PRIMARY KEY,
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
            created_at TIMESTAMPTZ DEFAULT NOW(),
            last_reviewed_at TIMESTAMPTZ,
            UNIQUE(user_id, vocabulary_id)
        )"
    ).execute(&pool).await?;

    // Create learning statistics table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS learning_stats (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL DEFAULT 'default',
            date TEXT NOT NULL,
            words_learned INTEGER DEFAULT 0,
            words_reviewed INTEGER DEFAULT 0,
            correct_count INTEGER DEFAULT 0,
            incorrect_count INTEGER DEFAULT 0,
            study_time_minutes INTEGER DEFAULT 0,
            UNIQUE(user_id, date)
        )"
    ).execute(&pool).await?;

    // Create user progress table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS user_progress (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL UNIQUE,
            total_words_learned INTEGER DEFAULT 0,
            total_reviews INTEGER DEFAULT 0,
            current_streak INTEGER DEFAULT 0,
            longest_streak INTEGER DEFAULT 0,
            last_study_date TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )"
    ).execute(&pool).await?;

    // Create notes table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            video_id TEXT NOT NULL,
            timestamp REAL NOT NULL,
            english TEXT NOT NULL,
            chinese TEXT,
            note_text TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )"
    ).execute(&pool).await?;

    // Create index on notes
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_notes_user_video ON notes(user_id, video_id)"
    ).execute(&pool).await?;

    // Create watch history table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS watch_history (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            video_id TEXT NOT NULL,
            title TEXT NOT NULL,
            thumbnail TEXT NOT NULL,
            watched_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(user_id, video_id)
        )"
    ).execute(&pool).await?;

    // Create index on watch history
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_watch_history_user ON watch_history(user_id, watched_at DESC)"
    ).execute(&pool).await?;

    // Initialize default user progress
    sqlx::query(
        "INSERT INTO user_progress (user_id) VALUES ('default') ON CONFLICT DO NOTHING"
    ).execute(&pool).await?;

    tracing::info!("Database initialized successfully");
    Ok(pool)
}

// ============ User Functions ============

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

pub async fn upsert_user(pool: &DbPool, user: &User) -> Result<()> {
    let now = Utc::now();

    sqlx::query(
        "INSERT INTO users (id, email, name, avatar, provider, tier, created_at, last_login_at)
         VALUES ($1, $2, $3, $4, $5, 'free', $6, $6)
         ON CONFLICT(id) DO UPDATE SET
            name = $3,
            avatar = $4,
            last_login_at = $6"
    )
    .bind(&user.id)
    .bind(&user.email)
    .bind(&user.name)
    .bind(&user.avatar)
    .bind(&user.provider)
    .bind(now)
    .execute(pool).await?;

    // Initialize user progress
    sqlx::query(
        "INSERT INTO user_progress (user_id) VALUES ($1) ON CONFLICT DO NOTHING"
    )
    .bind(&user.id)
    .execute(pool).await?;

    Ok(())
}

pub async fn get_user(pool: &DbPool, user_id: &str) -> Result<Option<User>> {
    let result = sqlx::query(
        "SELECT id, email, name, avatar, provider, tier,
                to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at,
                to_char(last_login_at, 'YYYY-MM-DD HH24:MI:SS') as last_login_at
         FROM users WHERE id = $1"
    )
    .bind(user_id)
    .fetch_optional(pool).await?;

    Ok(result.map(|row| User {
        id: row.get("id"),
        email: row.get("email"),
        name: row.get("name"),
        avatar: row.get("avatar"),
        provider: row.get("provider"),
        tier: row.get("tier"),
        created_at: row.get("created_at"),
        last_login_at: row.get("last_login_at"),
    }))
}

// ============ Vocabulary Functions ============

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
    pub due_at: Option<String>,
    pub review_count: i32,
    pub learning_step: i32,
    pub source_video_id: Option<String>,
    pub source_sentence: Option<String>,
    pub created_at: String,
    pub last_reviewed_at: Option<String>,
    pub memory_strength: f64,
}

const LEARNING_INTERVALS: [i32; 4] = [20, 60, 540, 1440];

fn calculate_memory_strength(
    last_reviewed_at: Option<&str>,
    interval_minutes: i32,
    learning_step: i32,
    created_at: &str,
) -> f64 {
    let now = Utc::now();

    let last_time = if let Some(reviewed) = last_reviewed_at {
        chrono::NaiveDateTime::parse_from_str(reviewed, "%Y-%m-%d %H:%M:%S")
            .or_else(|_| chrono::NaiveDateTime::parse_from_str(reviewed, "%Y-%m-%dT%H:%M:%S"))
            .ok()
    } else {
        None
    };

    let last_time = last_time.unwrap_or_else(|| {
        chrono::NaiveDateTime::parse_from_str(created_at, "%Y-%m-%d %H:%M:%S")
            .or_else(|_| chrono::NaiveDateTime::parse_from_str(created_at, "%Y-%m-%dT%H:%M:%S"))
            .unwrap_or_else(|_| now.naive_utc())
    });

    let elapsed_minutes = (now.naive_utc() - last_time).num_minutes() as f64;

    let half_life = if learning_step == 0 && interval_minutes <= 20 {
        15.0
    } else {
        (interval_minutes as f64 * 0.4).max(10.0)
    };

    let strength = (-elapsed_minutes / half_life).exp();
    strength.clamp(0.0, 1.0)
}

pub async fn save_vocabulary(
    pool: &DbPool,
    user_id: &str,
    word: &str,
    meaning: &str,
    level: &str,
    example: Option<&str>,
    source_video_id: Option<&str>,
    source_sentence: Option<&str>,
) -> Result<i64> {
    // Insert or get vocabulary
    sqlx::query(
        "INSERT INTO vocabulary (word, meaning, level, example) VALUES ($1, $2, $3, $4)
         ON CONFLICT (word) DO NOTHING"
    )
    .bind(word)
    .bind(meaning)
    .bind(level)
    .bind(example)
    .execute(pool).await?;

    let vocab_id: i64 = sqlx::query("SELECT id FROM vocabulary WHERE word = $1")
        .bind(word)
        .fetch_one(pool).await?
        .get("id");

    let now = Utc::now();
    let today = now.format("%Y-%m-%d").to_string();
    let due_at = now
        .checked_add_signed(chrono::Duration::minutes(LEARNING_INTERVALS[0] as i64))
        .unwrap()
        .format("%Y-%m-%dT%H:%M:%S")
        .to_string();

    sqlx::query(
        "INSERT INTO user_vocabulary
         (user_id, vocabulary_id, due_date, due_at, interval_minutes, learning_step, source_video_id, source_sentence)
         VALUES ($1, $2, $3, $4, $5, 0, $6, $7)
         ON CONFLICT (user_id, vocabulary_id) DO UPDATE SET
            due_date = $3, due_at = $4, interval_minutes = $5"
    )
    .bind(user_id)
    .bind(vocab_id)
    .bind(&today)
    .bind(&due_at)
    .bind(LEARNING_INTERVALS[0])
    .bind(source_video_id)
    .bind(source_sentence)
    .execute(pool).await?;

    Ok(vocab_id)
}

pub async fn get_vocabulary_list(pool: &DbPool, user_id: &str, due_only: bool) -> Result<Vec<SavedVocabulary>> {
    let now = Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();

    let rows = if due_only {
        sqlx::query(
            "SELECT v.id, v.word, v.meaning, v.level, v.example,
                    uv.ease_factor, uv.interval_days, COALESCE(uv.interval_minutes, 0) as interval_minutes,
                    uv.due_date, uv.due_at, uv.review_count, COALESCE(uv.learning_step, 0) as learning_step,
                    uv.source_video_id, uv.source_sentence,
                    to_char(uv.created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at,
                    to_char(uv.last_reviewed_at, 'YYYY-MM-DD HH24:MI:SS') as last_reviewed_at
             FROM vocabulary v
             JOIN user_vocabulary uv ON v.id = uv.vocabulary_id
             WHERE uv.user_id = $1 AND (
                 uv.due_at IS NULL OR uv.due_at <= $2
                 OR (uv.due_at IS NULL AND (uv.due_date IS NULL OR uv.due_date <= $2))
             )
             ORDER BY COALESCE(uv.due_at, uv.due_date) ASC"
        )
        .bind(user_id)
        .bind(&now)
        .fetch_all(pool).await?
    } else {
        sqlx::query(
            "SELECT v.id, v.word, v.meaning, v.level, v.example,
                    uv.ease_factor, uv.interval_days, COALESCE(uv.interval_minutes, 0) as interval_minutes,
                    uv.due_date, uv.due_at, uv.review_count, COALESCE(uv.learning_step, 0) as learning_step,
                    uv.source_video_id, uv.source_sentence,
                    to_char(uv.created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at,
                    to_char(uv.last_reviewed_at, 'YYYY-MM-DD HH24:MI:SS') as last_reviewed_at
             FROM vocabulary v
             JOIN user_vocabulary uv ON v.id = uv.vocabulary_id
             WHERE uv.user_id = $1
             ORDER BY uv.created_at DESC"
        )
        .bind(user_id)
        .fetch_all(pool).await?
    };

    let results: Vec<SavedVocabulary> = rows.into_iter().map(|row| {
        let created_at: String = row.get("created_at");
        let last_reviewed_at: Option<String> = row.get("last_reviewed_at");
        let interval_minutes: i32 = row.get("interval_minutes");
        let learning_step: i32 = row.get("learning_step");

        let memory_strength = calculate_memory_strength(
            last_reviewed_at.as_deref(),
            interval_minutes,
            learning_step,
            &created_at,
        );

        SavedVocabulary {
            id: row.get("id"),
            word: row.get("word"),
            meaning: row.get("meaning"),
            level: row.get("level"),
            example: row.get("example"),
            ease_factor: row.get("ease_factor"),
            interval_days: row.get("interval_days"),
            interval_minutes,
            due_date: row.get("due_date"),
            due_at: row.get("due_at"),
            review_count: row.get("review_count"),
            learning_step,
            source_video_id: row.get("source_video_id"),
            source_sentence: row.get("source_sentence"),
            created_at,
            last_reviewed_at,
            memory_strength,
        }
    }).collect();

    Ok(results)
}

pub async fn review_vocabulary(pool: &DbPool, user_id: &str, vocab_id: i64, quality: i32) -> Result<()> {
    let row = sqlx::query(
        "SELECT ease_factor, COALESCE(learning_step, 0) as learning_step, interval_days
         FROM user_vocabulary WHERE vocabulary_id = $1 AND user_id = $2"
    )
    .bind(vocab_id)
    .bind(user_id)
    .fetch_one(pool).await?;

    let ease_factor: f64 = row.get("ease_factor");
    let learning_step: i32 = row.get("learning_step");
    let interval_days: i32 = row.get("interval_days");

    let now = Utc::now();

    let (new_interval_minutes, new_learning_step, new_ease, new_interval_days) = if quality < 2 {
        (LEARNING_INTERVALS[0], 0, (ease_factor - 0.2).max(1.3), 0)
    } else if learning_step < 4 {
        let next_step = (learning_step + 1).min(4);
        if next_step < 4 {
            (LEARNING_INTERVALS[next_step as usize], next_step, ease_factor, 0)
        } else {
            (2 * 24 * 60, 4, ease_factor, 2)
        }
    } else {
        let new_interval_days = match quality {
            2 => ((interval_days as f64 * ease_factor) as i32).max(2),
            3 => ((interval_days as f64 * ease_factor * 1.3) as i32).max(3),
            _ => interval_days.max(2),
        };
        let new_ease = if quality == 3 {
            (ease_factor + 0.1).min(3.0)
        } else {
            ease_factor
        };
        (new_interval_days * 24 * 60, learning_step + 1, new_ease, new_interval_days)
    };

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

    sqlx::query(
        "UPDATE user_vocabulary
         SET ease_factor = $1, interval_days = $2, interval_minutes = $3,
             due_date = $4, due_at = $5, learning_step = $6,
             review_count = review_count + 1, last_reviewed_at = NOW()
         WHERE vocabulary_id = $7 AND user_id = $8"
    )
    .bind(new_ease)
    .bind(new_interval_days)
    .bind(new_interval_minutes)
    .bind(&due_date)
    .bind(&due_at)
    .bind(new_learning_step)
    .bind(vocab_id)
    .bind(user_id)
    .execute(pool).await?;

    Ok(())
}

pub async fn delete_vocabulary(pool: &DbPool, user_id: &str, vocab_id: i64) -> Result<()> {
    sqlx::query("DELETE FROM user_vocabulary WHERE vocabulary_id = $1 AND user_id = $2")
        .bind(vocab_id)
        .bind(user_id)
        .execute(pool).await?;
    Ok(())
}

pub async fn is_vocabulary_saved(pool: &DbPool, user_id: &str, word: &str) -> Result<bool> {
    let count: i64 = sqlx::query(
        "SELECT COUNT(*) as count FROM vocabulary v
         JOIN user_vocabulary uv ON v.id = uv.vocabulary_id
         WHERE v.word = $1 AND uv.user_id = $2"
    )
    .bind(word)
    .bind(user_id)
    .fetch_one(pool).await?
    .get("count");

    Ok(count > 0)
}

// ============ Notes Functions ============

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

pub async fn save_note(pool: &DbPool, note: &Note) -> Result<()> {
    sqlx::query(
        "INSERT INTO notes (id, user_id, video_id, timestamp, english, chinese, note_text, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (id) DO UPDATE SET
            english = $5, chinese = $6, note_text = $7"
    )
    .bind(&note.id)
    .bind(&note.user_id)
    .bind(&note.video_id)
    .bind(note.timestamp)
    .bind(&note.english)
    .bind(&note.chinese)
    .bind(&note.note_text)
    .execute(pool).await?;

    Ok(())
}

pub async fn get_notes(pool: &DbPool, user_id: &str) -> Result<Vec<Note>> {
    let rows = sqlx::query(
        "SELECT id, user_id, video_id, timestamp, english, chinese, note_text,
                to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at
         FROM notes WHERE user_id = $1 ORDER BY created_at DESC"
    )
    .bind(user_id)
    .fetch_all(pool).await?;

    Ok(rows.into_iter().map(|row| Note {
        id: row.get("id"),
        user_id: row.get("user_id"),
        video_id: row.get("video_id"),
        timestamp: row.get("timestamp"),
        english: row.get("english"),
        chinese: row.get("chinese"),
        note_text: row.get("note_text"),
        created_at: row.get("created_at"),
    }).collect())
}

pub async fn get_notes_by_video(pool: &DbPool, user_id: &str, video_id: &str) -> Result<Vec<Note>> {
    let rows = sqlx::query(
        "SELECT id, user_id, video_id, timestamp, english, chinese, note_text,
                to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at
         FROM notes WHERE user_id = $1 AND video_id = $2 ORDER BY timestamp ASC"
    )
    .bind(user_id)
    .bind(video_id)
    .fetch_all(pool).await?;

    Ok(rows.into_iter().map(|row| Note {
        id: row.get("id"),
        user_id: row.get("user_id"),
        video_id: row.get("video_id"),
        timestamp: row.get("timestamp"),
        english: row.get("english"),
        chinese: row.get("chinese"),
        note_text: row.get("note_text"),
        created_at: row.get("created_at"),
    }).collect())
}

pub async fn delete_note(pool: &DbPool, user_id: &str, note_id: &str) -> Result<()> {
    sqlx::query("DELETE FROM notes WHERE id = $1 AND user_id = $2")
        .bind(note_id)
        .bind(user_id)
        .execute(pool).await?;
    Ok(())
}

// ============ Learning Statistics Functions ============

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DailyStats {
    pub date: String,
    pub words_learned: i32,
    pub words_reviewed: i32,
    pub correct_count: i32,
    pub incorrect_count: i32,
    pub study_time_minutes: i32,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct UserProgress {
    pub total_words_learned: i32,
    pub total_reviews: i32,
    pub current_streak: i32,
    pub longest_streak: i32,
    pub last_study_date: Option<String>,
}

pub async fn record_word_learned(pool: &DbPool, user_id: &str) -> Result<()> {
    let today = Utc::now().format("%Y-%m-%d").to_string();

    sqlx::query(
        "INSERT INTO learning_stats (user_id, date, words_learned)
         VALUES ($1, $2, 1)
         ON CONFLICT(user_id, date) DO UPDATE SET words_learned = learning_stats.words_learned + 1"
    )
    .bind(user_id)
    .bind(&today)
    .execute(pool).await?;

    sqlx::query(
        "UPDATE user_progress SET total_words_learned = total_words_learned + 1 WHERE user_id = $1"
    )
    .bind(user_id)
    .execute(pool).await?;

    update_streak(pool, user_id, &today).await?;
    Ok(())
}

pub async fn record_review(pool: &DbPool, user_id: &str, is_correct: bool) -> Result<()> {
    let today = Utc::now().format("%Y-%m-%d").to_string();

    if is_correct {
        sqlx::query(
            "INSERT INTO learning_stats (user_id, date, words_reviewed, correct_count)
             VALUES ($1, $2, 1, 1)
             ON CONFLICT(user_id, date) DO UPDATE SET
                words_reviewed = learning_stats.words_reviewed + 1,
                correct_count = learning_stats.correct_count + 1"
        )
        .bind(user_id)
        .bind(&today)
        .execute(pool).await?;
    } else {
        sqlx::query(
            "INSERT INTO learning_stats (user_id, date, words_reviewed, incorrect_count)
             VALUES ($1, $2, 1, 1)
             ON CONFLICT(user_id, date) DO UPDATE SET
                words_reviewed = learning_stats.words_reviewed + 1,
                incorrect_count = learning_stats.incorrect_count + 1"
        )
        .bind(user_id)
        .bind(&today)
        .execute(pool).await?;
    }

    sqlx::query(
        "UPDATE user_progress SET total_reviews = total_reviews + 1 WHERE user_id = $1"
    )
    .bind(user_id)
    .execute(pool).await?;

    update_streak(pool, user_id, &today).await?;
    Ok(())
}

async fn update_streak(pool: &DbPool, user_id: &str, today: &str) -> Result<()> {
    let yesterday = (Utc::now() - chrono::Duration::days(1))
        .format("%Y-%m-%d")
        .to_string();

    let last_study_date: Option<String> = sqlx::query(
        "SELECT last_study_date FROM user_progress WHERE user_id = $1"
    )
    .bind(user_id)
    .fetch_optional(pool).await?
    .and_then(|row| row.get("last_study_date"));

    match last_study_date {
        Some(ref date) if date == today => {
            // Already studied today
        }
        Some(ref date) if date == &yesterday => {
            sqlx::query(
                "UPDATE user_progress SET
                    current_streak = current_streak + 1,
                    longest_streak = GREATEST(longest_streak, current_streak + 1),
                    last_study_date = $1
                 WHERE user_id = $2"
            )
            .bind(today)
            .bind(user_id)
            .execute(pool).await?;
        }
        _ => {
            sqlx::query(
                "UPDATE user_progress SET
                    current_streak = 1,
                    longest_streak = GREATEST(longest_streak, 1),
                    last_study_date = $1
                 WHERE user_id = $2"
            )
            .bind(today)
            .bind(user_id)
            .execute(pool).await?;
        }
    }

    Ok(())
}

pub async fn get_daily_stats(pool: &DbPool, user_id: &str, days: i32) -> Result<Vec<DailyStats>> {
    let start_date = (Utc::now() - chrono::Duration::days(days as i64))
        .format("%Y-%m-%d")
        .to_string();

    let rows = sqlx::query(
        "SELECT date, words_learned, words_reviewed, correct_count, incorrect_count, study_time_minutes
         FROM learning_stats
         WHERE user_id = $1 AND date >= $2
         ORDER BY date DESC"
    )
    .bind(user_id)
    .bind(&start_date)
    .fetch_all(pool).await?;

    Ok(rows.into_iter().map(|row| DailyStats {
        date: row.get("date"),
        words_learned: row.get("words_learned"),
        words_reviewed: row.get("words_reviewed"),
        correct_count: row.get("correct_count"),
        incorrect_count: row.get("incorrect_count"),
        study_time_minutes: row.get("study_time_minutes"),
    }).collect())
}

pub async fn get_user_progress(pool: &DbPool, user_id: &str) -> Result<UserProgress> {
    sqlx::query(
        "INSERT INTO user_progress (user_id) VALUES ($1) ON CONFLICT DO NOTHING"
    )
    .bind(user_id)
    .execute(pool).await?;

    let row = sqlx::query(
        "SELECT total_words_learned, total_reviews, current_streak, longest_streak, last_study_date
         FROM user_progress WHERE user_id = $1"
    )
    .bind(user_id)
    .fetch_one(pool).await?;

    Ok(UserProgress {
        total_words_learned: row.get("total_words_learned"),
        total_reviews: row.get("total_reviews"),
        current_streak: row.get("current_streak"),
        longest_streak: row.get("longest_streak"),
        last_study_date: row.get("last_study_date"),
    })
}

pub async fn get_today_stats(pool: &DbPool, user_id: &str) -> Result<DailyStats> {
    let today = Utc::now().format("%Y-%m-%d").to_string();

    let result = sqlx::query(
        "SELECT date, words_learned, words_reviewed, correct_count, incorrect_count, study_time_minutes
         FROM learning_stats
         WHERE user_id = $1 AND date = $2"
    )
    .bind(user_id)
    .bind(&today)
    .fetch_optional(pool).await?;

    Ok(result.map(|row| DailyStats {
        date: row.get("date"),
        words_learned: row.get("words_learned"),
        words_reviewed: row.get("words_reviewed"),
        correct_count: row.get("correct_count"),
        incorrect_count: row.get("incorrect_count"),
        study_time_minutes: row.get("study_time_minutes"),
    }).unwrap_or(DailyStats {
        date: today,
        words_learned: 0,
        words_reviewed: 0,
        correct_count: 0,
        incorrect_count: 0,
        study_time_minutes: 0,
    }))
}

// ============ Watch History Functions ============

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct WatchHistoryItem {
    pub video_id: String,
    pub title: String,
    pub thumbnail: String,
    pub watched_at: String,
}

pub async fn add_watch_history(pool: &DbPool, user_id: &str, video_id: &str, title: &str, thumbnail: &str) -> Result<()> {
    sqlx::query(
        "INSERT INTO watch_history (user_id, video_id, title, thumbnail, watched_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT(user_id, video_id) DO UPDATE SET
            title = $3,
            thumbnail = $4,
            watched_at = NOW()"
    )
    .bind(user_id)
    .bind(video_id)
    .bind(title)
    .bind(thumbnail)
    .execute(pool).await?;

    Ok(())
}

pub async fn get_watch_history(pool: &DbPool, user_id: &str, limit: i32) -> Result<Vec<WatchHistoryItem>> {
    let rows = sqlx::query(
        "SELECT video_id, title, thumbnail,
                to_char(watched_at, 'YYYY-MM-DD HH24:MI:SS') as watched_at
         FROM watch_history
         WHERE user_id = $1
         ORDER BY watched_at DESC
         LIMIT $2"
    )
    .bind(user_id)
    .bind(limit)
    .fetch_all(pool).await?;

    Ok(rows.into_iter().map(|row| WatchHistoryItem {
        video_id: row.get("video_id"),
        title: row.get("title"),
        thumbnail: row.get("thumbnail"),
        watched_at: row.get("watched_at"),
    }).collect())
}

pub async fn delete_watch_history(pool: &DbPool, user_id: &str, video_id: &str) -> Result<()> {
    sqlx::query("DELETE FROM watch_history WHERE user_id = $1 AND video_id = $2")
        .bind(user_id)
        .bind(video_id)
        .execute(pool).await?;
    Ok(())
}

pub async fn clear_watch_history(pool: &DbPool, user_id: &str) -> Result<()> {
    sqlx::query("DELETE FROM watch_history WHERE user_id = $1")
        .bind(user_id)
        .execute(pool).await?;
    Ok(())
}
