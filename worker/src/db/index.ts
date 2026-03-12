// ─── Constants ───
export const FREE_DAILY_BASE_LIMIT = 5
export const INVITE_BONUS_QUOTA = 3
export const AI_CHAT_DAILY_LIMIT = 20
const LEARNING_INTERVALS = [20, 60, 540, 1440] // minutes

// ─── Helper: generate invite code ───
function generateInviteCode(): string {
  const chars = '0123456789ABCDEF'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

// ─── Helper: today string ───
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

// ─── Helper: now ISO string ───
function now(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

// ─── Helper: calculate memory strength ───
function calculateMemoryStrength(
  lastReviewedAt: string | null,
  intervalMinutes: number,
  learningStep: number,
  createdAt: string,
): number {
  const nowMs = Date.now()
  let lastTime: number

  if (lastReviewedAt) {
    lastTime = new Date(lastReviewedAt).getTime()
  } else {
    lastTime = new Date(createdAt).getTime()
  }

  if (isNaN(lastTime)) lastTime = nowMs

  const elapsedMinutes = (nowMs - lastTime) / 60000
  const halfLife =
    learningStep === 0 && intervalMinutes <= 20 ? 15.0 : Math.max(intervalMinutes * 0.4, 10.0)
  const strength = Math.exp(-elapsedMinutes / halfLife)
  return Math.max(0, Math.min(1, strength))
}

// ════════════════════════════════════════════════════════════
// User Functions
// ════════════════════════════════════════════════════════════

export interface DbUser {
  id: string
  email: string
  name: string
  avatar: string | null
  provider: string
  tier: string
  invite_code: string | null
  bonus_quota: number
  invited_by: string | null
  created_at: string | null
  last_login_at: string | null
}

export async function upsertUser(
  db: D1Database,
  user: DbUser,
  refCode?: string | null,
): Promise<void> {
  const n = now()
  const inviteCode = generateInviteCode()

  const existing = await db
    .prepare('SELECT id FROM users WHERE id = ?')
    .bind(user.id)
    .first<{ id: string }>()

  if (existing) {
    await db
      .prepare('UPDATE users SET name = ?, avatar = ?, last_login_at = ? WHERE id = ?')
      .bind(user.name, user.avatar, n, user.id)
      .run()
  } else {
    await db
      .prepare(
        `INSERT INTO users (id, email, name, avatar, provider, tier, invite_code, bonus_quota, invited_by, created_at, last_login_at)
         VALUES (?, ?, ?, ?, ?, 'free', ?, 0, ?, ?, ?)`,
      )
      .bind(user.id, user.email, user.name, user.avatar, user.provider, inviteCode, refCode ?? null, n, n)
      .run()

    if (refCode) {
      await addBonusQuotaByInviteCode(db, refCode, INVITE_BONUS_QUOTA)
    }
  }

  await db
    .prepare('INSERT OR IGNORE INTO user_progress (user_id) VALUES (?)')
    .bind(user.id)
    .run()
}

export async function getUser(db: D1Database, userId: string): Promise<DbUser | null> {
  return db
    .prepare(
      `SELECT id, email, name, avatar, provider, tier, invite_code,
              COALESCE(bonus_quota, 0) as bonus_quota, invited_by, created_at, last_login_at
       FROM users WHERE id = ?`,
    )
    .bind(userId)
    .first<DbUser>()
}

export async function addBonusQuotaByInviteCode(
  db: D1Database,
  inviteCode: string,
  amount: number,
): Promise<void> {
  await db
    .prepare('UPDATE users SET bonus_quota = COALESCE(bonus_quota, 0) + ? WHERE invite_code = ?')
    .bind(amount, inviteCode)
    .run()
}

export async function getOrCreateInviteCode(db: D1Database, userId: string): Promise<string> {
  const row = await db
    .prepare('SELECT invite_code FROM users WHERE id = ?')
    .bind(userId)
    .first<{ invite_code: string | null }>()

  if (row?.invite_code) return row.invite_code

  const newCode = generateInviteCode()
  await db.prepare('UPDATE users SET invite_code = ? WHERE id = ?').bind(newCode, userId).run()
  return newCode
}

export async function getInviteCount(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare('SELECT invite_code FROM users WHERE id = ?')
    .bind(userId)
    .first<{ invite_code: string | null }>()

  if (!row?.invite_code) return 0

  const count = await db
    .prepare('SELECT COUNT(*) as count FROM users WHERE invited_by = ?')
    .bind(row.invite_code)
    .first<{ count: number }>()

  return count?.count ?? 0
}

export async function getBonusQuota(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare('SELECT COALESCE(bonus_quota, 0) as bonus_quota FROM users WHERE id = ?')
    .bind(userId)
    .first<{ bonus_quota: number }>()

  return row?.bonus_quota ?? 0
}

// ════════════════════════════════════════════════════════════
// Vocabulary Functions
// ════════════════════════════════════════════════════════════

export interface DbSavedVocabulary {
  id: number
  word: string
  meaning: string
  level: string
  example: string | null
  ease_factor: number
  interval_days: number
  interval_minutes: number
  due_date: string | null
  due_at: string | null
  review_count: number
  learning_step: number
  source_video_id: string | null
  source_sentence: string | null
  created_at: string
  last_reviewed_at: string | null
}

export async function saveVocabulary(
  db: D1Database,
  userId: string,
  word: string,
  meaning: string,
  level: string,
  example?: string,
  sourceVideoId?: string,
  sourceSentence?: string,
): Promise<number> {
  await db
    .prepare(
      'INSERT OR IGNORE INTO vocabulary (word, meaning, level, example) VALUES (?, ?, ?, ?)',
    )
    .bind(word, meaning, level, example ?? null)
    .run()

  const vocab = await db
    .prepare('SELECT id FROM vocabulary WHERE word = ?')
    .bind(word)
    .first<{ id: number }>()

  const vocabId = vocab!.id
  const n = new Date()
  const todayStr = n.toISOString().slice(0, 10)
  const dueAt = new Date(n.getTime() + LEARNING_INTERVALS[0] * 60000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19)

  await db
    .prepare(
      `INSERT INTO user_vocabulary (user_id, vocabulary_id, due_date, due_at, interval_minutes, learning_step, source_video_id, source_sentence)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)
       ON CONFLICT(user_id, vocabulary_id) DO UPDATE SET due_date = ?, due_at = ?, interval_minutes = ?`,
    )
    .bind(
      userId, vocabId, todayStr, dueAt, LEARNING_INTERVALS[0],
      sourceVideoId ?? null, sourceSentence ?? null,
      todayStr, dueAt, LEARNING_INTERVALS[0],
    )
    .run()

  return vocabId
}

export async function getVocabularyList(
  db: D1Database,
  userId: string,
  dueOnly: boolean,
): Promise<(DbSavedVocabulary & { memory_strength: number })[]> {
  const n = now()
  const query = dueOnly
    ? `SELECT v.id, v.word, v.meaning, v.level, v.example,
              uv.ease_factor, uv.interval_days, COALESCE(uv.interval_minutes, 0) as interval_minutes,
              uv.due_date, uv.due_at, uv.review_count, COALESCE(uv.learning_step, 0) as learning_step,
              uv.source_video_id, uv.source_sentence, uv.created_at, uv.last_reviewed_at
       FROM vocabulary v
       JOIN user_vocabulary uv ON v.id = uv.vocabulary_id
       WHERE uv.user_id = ? AND (uv.due_at IS NULL OR uv.due_at <= ?)
       ORDER BY COALESCE(uv.due_at, uv.due_date) ASC`
    : `SELECT v.id, v.word, v.meaning, v.level, v.example,
              uv.ease_factor, uv.interval_days, COALESCE(uv.interval_minutes, 0) as interval_minutes,
              uv.due_date, uv.due_at, uv.review_count, COALESCE(uv.learning_step, 0) as learning_step,
              uv.source_video_id, uv.source_sentence, uv.created_at, uv.last_reviewed_at
       FROM vocabulary v
       JOIN user_vocabulary uv ON v.id = uv.vocabulary_id
       WHERE uv.user_id = ?
       ORDER BY uv.created_at DESC`

  const { results } = dueOnly
    ? await db.prepare(query).bind(userId, n).all<DbSavedVocabulary>()
    : await db.prepare(query).bind(userId).all<DbSavedVocabulary>()

  return (results ?? []).map((row) => ({
    ...row,
    memory_strength: calculateMemoryStrength(
      row.last_reviewed_at,
      row.interval_minutes,
      row.learning_step,
      row.created_at,
    ),
  }))
}

export async function reviewVocabulary(
  db: D1Database,
  userId: string,
  vocabId: number,
  quality: number,
): Promise<void> {
  const row = await db
    .prepare(
      `SELECT ease_factor, COALESCE(learning_step, 0) as learning_step, interval_days
       FROM user_vocabulary WHERE vocabulary_id = ? AND user_id = ?`,
    )
    .bind(vocabId, userId)
    .first<{ ease_factor: number; learning_step: number; interval_days: number }>()

  if (!row) return

  const { ease_factor, learning_step, interval_days } = row
  const n = new Date()

  let newIntervalMinutes: number
  let newLearningStep: number
  let newEase: number
  let newIntervalDays: number

  if (quality < 2) {
    newIntervalMinutes = LEARNING_INTERVALS[0]
    newLearningStep = 0
    newEase = Math.max(ease_factor - 0.2, 1.3)
    newIntervalDays = 0
  } else if (learning_step < 4) {
    const nextStep = Math.min(learning_step + 1, 4)
    if (nextStep < 4) {
      newIntervalMinutes = LEARNING_INTERVALS[nextStep]
      newLearningStep = nextStep
      newEase = ease_factor
      newIntervalDays = 0
    } else {
      newIntervalMinutes = 2 * 24 * 60
      newLearningStep = 4
      newEase = ease_factor
      newIntervalDays = 2
    }
  } else {
    newIntervalDays =
      quality === 2
        ? Math.max(Math.floor(interval_days * ease_factor), 2)
        : quality === 3
          ? Math.max(Math.floor(interval_days * ease_factor * 1.3), 3)
          : Math.max(interval_days, 2)
    newEase = quality === 3 ? Math.min(ease_factor + 0.1, 3.0) : ease_factor
    newIntervalMinutes = newIntervalDays * 24 * 60
    newLearningStep = learning_step + 1
  }

  const dueAt = new Date(n.getTime() + newIntervalMinutes * 60000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19)
  const dueDate = new Date(n.getTime() + newIntervalMinutes * 60000).toISOString().slice(0, 10)

  await db
    .prepare(
      `UPDATE user_vocabulary
       SET ease_factor = ?, interval_days = ?, interval_minutes = ?,
           due_date = ?, due_at = ?, learning_step = ?,
           review_count = review_count + 1, last_reviewed_at = ?
       WHERE vocabulary_id = ? AND user_id = ?`,
    )
    .bind(newEase, newIntervalDays, newIntervalMinutes, dueDate, dueAt, newLearningStep, now(), vocabId, userId)
    .run()
}

export async function deleteVocabulary(
  db: D1Database,
  userId: string,
  vocabId: number,
): Promise<void> {
  await db
    .prepare('DELETE FROM user_vocabulary WHERE vocabulary_id = ? AND user_id = ?')
    .bind(vocabId, userId)
    .run()
}

export async function isVocabularySaved(
  db: D1Database,
  userId: string,
  word: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) as count FROM vocabulary v
       JOIN user_vocabulary uv ON v.id = uv.vocabulary_id
       WHERE v.word = ? AND uv.user_id = ?`,
    )
    .bind(word, userId)
    .first<{ count: number }>()

  return (row?.count ?? 0) > 0
}

// ════════════════════════════════════════════════════════════
// Notes Functions
// ════════════════════════════════════════════════════════════

export interface DbNote {
  id: string
  user_id: string
  video_id: string
  timestamp: number | null
  english: string | null
  chinese: string | null
  note_text: string | null
  images: string | null
  created_at: string
}

export async function saveNote(db: D1Database, note: DbNote): Promise<void> {
  await db
    .prepare(
      `INSERT INTO notes (id, user_id, video_id, timestamp, english, chinese, note_text, images, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET english = ?, chinese = ?, note_text = ?, images = ?`,
    )
    .bind(
      note.id, note.user_id, note.video_id, note.timestamp,
      note.english, note.chinese, note.note_text, note.images, now(),
      note.english, note.chinese, note.note_text, note.images,
    )
    .run()
}

export async function getNotes(db: D1Database, userId: string): Promise<DbNote[]> {
  const { results } = await db
    .prepare('SELECT * FROM notes WHERE user_id = ? ORDER BY created_at DESC')
    .bind(userId)
    .all<DbNote>()
  return results ?? []
}

export async function getNotesByVideo(
  db: D1Database,
  userId: string,
  videoId: string,
): Promise<DbNote[]> {
  const { results } = await db
    .prepare(
      'SELECT * FROM notes WHERE user_id = ? AND video_id = ? ORDER BY timestamp ASC',
    )
    .bind(userId, videoId)
    .all<DbNote>()
  return results ?? []
}

export async function deleteNote(
  db: D1Database,
  userId: string,
  noteId: string,
): Promise<void> {
  await db
    .prepare('DELETE FROM notes WHERE id = ? AND user_id = ?')
    .bind(noteId, userId)
    .run()
}

// ════════════════════════════════════════════════════════════
// Learning Statistics Functions
// ════════════════════════════════════════════════════════════

export interface DbDailyStats {
  date: string
  words_learned: number
  words_reviewed: number
  correct_count: number
  incorrect_count: number
  study_time_minutes: number
}

export interface DbUserProgress {
  total_words_learned: number
  total_reviews: number
  current_streak: number
  longest_streak: number
  last_study_date: string | null
}

export async function recordWordLearned(db: D1Database, userId: string): Promise<void> {
  const t = today()
  await db
    .prepare(
      `INSERT INTO learning_stats (user_id, date, words_learned)
       VALUES (?, ?, 1)
       ON CONFLICT(user_id, date) DO UPDATE SET words_learned = words_learned + 1`,
    )
    .bind(userId, t)
    .run()

  await db
    .prepare('UPDATE user_progress SET total_words_learned = total_words_learned + 1 WHERE user_id = ?')
    .bind(userId)
    .run()

  await updateStreak(db, userId, t)
}

export async function recordReview(
  db: D1Database,
  userId: string,
  isCorrect: boolean,
): Promise<void> {
  const t = today()
  if (isCorrect) {
    await db
      .prepare(
        `INSERT INTO learning_stats (user_id, date, words_reviewed, correct_count)
         VALUES (?, ?, 1, 1)
         ON CONFLICT(user_id, date) DO UPDATE SET words_reviewed = words_reviewed + 1, correct_count = correct_count + 1`,
      )
      .bind(userId, t)
      .run()
  } else {
    await db
      .prepare(
        `INSERT INTO learning_stats (user_id, date, words_reviewed, incorrect_count)
         VALUES (?, ?, 1, 1)
         ON CONFLICT(user_id, date) DO UPDATE SET words_reviewed = words_reviewed + 1, incorrect_count = incorrect_count + 1`,
      )
      .bind(userId, t)
      .run()
  }

  await db
    .prepare('UPDATE user_progress SET total_reviews = total_reviews + 1 WHERE user_id = ?')
    .bind(userId)
    .run()

  await updateStreak(db, userId, t)
}

async function updateStreak(db: D1Database, userId: string, todayStr: string): Promise<void> {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

  const row = await db
    .prepare('SELECT last_study_date FROM user_progress WHERE user_id = ?')
    .bind(userId)
    .first<{ last_study_date: string | null }>()

  const lastDate = row?.last_study_date

  if (lastDate === todayStr) {
    return // Already studied today
  } else if (lastDate === yesterday) {
    await db
      .prepare(
        `UPDATE user_progress SET
          current_streak = current_streak + 1,
          longest_streak = MAX(longest_streak, current_streak + 1),
          last_study_date = ?
         WHERE user_id = ?`,
      )
      .bind(todayStr, userId)
      .run()
  } else {
    await db
      .prepare(
        `UPDATE user_progress SET
          current_streak = 1,
          longest_streak = MAX(longest_streak, 1),
          last_study_date = ?
         WHERE user_id = ?`,
      )
      .bind(todayStr, userId)
      .run()
  }
}

export async function getDailyStats(
  db: D1Database,
  userId: string,
  days: number,
): Promise<DbDailyStats[]> {
  const startDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
  const { results } = await db
    .prepare(
      `SELECT date, words_learned, words_reviewed, correct_count, incorrect_count, study_time_minutes
       FROM learning_stats WHERE user_id = ? AND date >= ? ORDER BY date DESC`,
    )
    .bind(userId, startDate)
    .all<DbDailyStats>()
  return results ?? []
}

export async function getUserProgress(db: D1Database, userId: string): Promise<DbUserProgress> {
  await db
    .prepare('INSERT OR IGNORE INTO user_progress (user_id) VALUES (?)')
    .bind(userId)
    .run()

  const row = await db
    .prepare(
      'SELECT total_words_learned, total_reviews, current_streak, longest_streak, last_study_date FROM user_progress WHERE user_id = ?',
    )
    .bind(userId)
    .first<DbUserProgress>()

  return (
    row ?? {
      total_words_learned: 0,
      total_reviews: 0,
      current_streak: 0,
      longest_streak: 0,
      last_study_date: null,
    }
  )
}

export async function getTodayStats(db: D1Database, userId: string): Promise<DbDailyStats> {
  const t = today()
  const row = await db
    .prepare(
      'SELECT date, words_learned, words_reviewed, correct_count, incorrect_count, study_time_minutes FROM learning_stats WHERE user_id = ? AND date = ?',
    )
    .bind(userId, t)
    .first<DbDailyStats>()

  return (
    row ?? {
      date: t,
      words_learned: 0,
      words_reviewed: 0,
      correct_count: 0,
      incorrect_count: 0,
      study_time_minutes: 0,
    }
  )
}

export async function getOverviewStats(
  db: D1Database,
  userId: string,
): Promise<{
  total_words: number
  mastered_words: number
  total_notes: number
  total_videos_watched: number
  total_study_days: number
}> {
  const totalWords = await db
    .prepare(
      'SELECT COUNT(*) as c FROM user_vocabulary WHERE user_id = ?',
    )
    .bind(userId)
    .first<{ c: number }>()

  const masteredWords = await db
    .prepare(
      'SELECT COUNT(*) as c FROM user_vocabulary WHERE user_id = ? AND memory_level >= 4',
    )
    .bind(userId)
    .first<{ c: number }>()

  const totalNotes = await db
    .prepare('SELECT COUNT(*) as c FROM notes WHERE user_id = ?')
    .bind(userId)
    .first<{ c: number }>()

  const totalVideos = await db
    .prepare('SELECT COUNT(*) as c FROM watch_history WHERE user_id = ?')
    .bind(userId)
    .first<{ c: number }>()

  const studyDays = await db
    .prepare('SELECT COUNT(*) as c FROM learning_stats WHERE user_id = ?')
    .bind(userId)
    .first<{ c: number }>()

  return {
    total_words: totalWords?.c ?? 0,
    mastered_words: masteredWords?.c ?? 0,
    total_notes: totalNotes?.c ?? 0,
    total_videos_watched: totalVideos?.c ?? 0,
    total_study_days: studyDays?.c ?? 0,
  }
}

export async function getMemoryDistribution(
  db: D1Database,
  userId: string,
): Promise<{ level: number; count: number }[]> {
  const { results } = await db
    .prepare(
      `SELECT memory_level as level, COUNT(*) as count
       FROM user_vocabulary WHERE user_id = ?
       GROUP BY memory_level ORDER BY memory_level`,
    )
    .bind(userId)
    .all<{ level: number; count: number }>()
  return results ?? []
}

// ════════════════════════════════════════════════════════════
// Watch History Functions
// ════════════════════════════════════════════════════════════

export interface DbWatchHistoryItem {
  video_id: string
  title: string
  thumbnail: string
  watched_at: string
}

export async function addWatchHistory(
  db: D1Database,
  userId: string,
  videoId: string,
  title: string,
  thumbnail: string,
): Promise<void> {
  const n = now()
  await db
    .prepare(
      `INSERT INTO watch_history (user_id, video_id, title, thumbnail, watched_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, video_id) DO UPDATE SET title = ?, thumbnail = ?, watched_at = ?`,
    )
    .bind(userId, videoId, title, thumbnail, n, title, thumbnail, n)
    .run()
}

export async function getWatchHistory(
  db: D1Database,
  userId: string,
  limit: number,
): Promise<DbWatchHistoryItem[]> {
  const { results } = await db
    .prepare(
      'SELECT video_id, title, thumbnail, watched_at FROM watch_history WHERE user_id = ? ORDER BY watched_at DESC LIMIT ?',
    )
    .bind(userId, limit)
    .all<DbWatchHistoryItem>()
  return results ?? []
}

export async function deleteWatchHistory(
  db: D1Database,
  userId: string,
  videoId: string,
): Promise<void> {
  await db
    .prepare('DELETE FROM watch_history WHERE user_id = ? AND video_id = ?')
    .bind(userId, videoId)
    .run()
}

export async function clearWatchHistory(db: D1Database, userId: string): Promise<void> {
  await db.prepare('DELETE FROM watch_history WHERE user_id = ?').bind(userId).run()
}

// ════════════════════════════════════════════════════════════
// Daily Usage / Rate Limiting
// ════════════════════════════════════════════════════════════

export interface DbDailyUsageStatus {
  video_parse: { used: number; limit: number; remaining: number; bonus_quota: number }
  ai_chat: { used: number; limit: number; remaining: number }
}

export async function getDailyUsage(
  db: D1Database,
  userId: string,
): Promise<DbDailyUsageStatus> {
  const t = today()
  const usage = await db
    .prepare('SELECT video_parse_count, ai_chat_count FROM daily_usage WHERE user_id = ? AND date = ?')
    .bind(userId, t)
    .first<{ video_parse_count: number; ai_chat_count: number }>()

  const videoUsed = usage?.video_parse_count ?? 0
  const aiChatUsed = usage?.ai_chat_count ?? 0
  const bonusQuota = await getBonusQuota(db, userId)
  const totalLimit = FREE_DAILY_BASE_LIMIT + bonusQuota

  return {
    video_parse: {
      used: videoUsed,
      limit: totalLimit,
      remaining: Math.max(totalLimit - videoUsed, 0),
      bonus_quota: bonusQuota,
    },
    ai_chat: {
      used: aiChatUsed,
      limit: AI_CHAT_DAILY_LIMIT,
      remaining: Math.max(AI_CHAT_DAILY_LIMIT - aiChatUsed, 0),
    },
  }
}

export async function checkCanParseVideo(
  db: D1Database,
  userId: string,
  tier: string,
): Promise<{ allowed: boolean; remaining: number }> {
  if (tier === 'pro') return { allowed: true, remaining: -1 }

  const t = today()
  const usage = await db
    .prepare('SELECT video_parse_count FROM daily_usage WHERE user_id = ? AND date = ?')
    .bind(userId, t)
    .first<{ video_parse_count: number }>()

  const used = usage?.video_parse_count ?? 0
  const bonusQuota = await getBonusQuota(db, userId)
  const totalLimit = FREE_DAILY_BASE_LIMIT + bonusQuota
  const remaining = totalLimit - used

  return { allowed: remaining > 0, remaining: remaining - 1 }
}

export async function incrementVideoParseCount(
  db: D1Database,
  userId: string,
): Promise<number> {
  const t = today()
  await db
    .prepare(
      `INSERT INTO daily_usage (user_id, date, video_parse_count)
       VALUES (?, ?, 1)
       ON CONFLICT(user_id, date) DO UPDATE SET video_parse_count = video_parse_count + 1`,
    )
    .bind(userId, t)
    .run()

  const row = await db
    .prepare('SELECT video_parse_count FROM daily_usage WHERE user_id = ? AND date = ?')
    .bind(userId, t)
    .first<{ video_parse_count: number }>()

  return row?.video_parse_count ?? 1
}

export async function checkCanAiChat(
  db: D1Database,
  userId: string,
  tier: string,
): Promise<{ allowed: boolean; remaining: number }> {
  if (tier === 'pro') return { allowed: true, remaining: -1 }

  const t = today()
  const usage = await db
    .prepare('SELECT ai_chat_count FROM daily_usage WHERE user_id = ? AND date = ?')
    .bind(userId, t)
    .first<{ ai_chat_count: number }>()

  const used = usage?.ai_chat_count ?? 0
  const remaining = AI_CHAT_DAILY_LIMIT - used
  return { allowed: remaining > 0, remaining: remaining - 1 }
}

export async function incrementAiChatCount(db: D1Database, userId: string): Promise<number> {
  const t = today()
  await db
    .prepare(
      `INSERT INTO daily_usage (user_id, date, ai_chat_count)
       VALUES (?, ?, 1)
       ON CONFLICT(user_id, date) DO UPDATE SET ai_chat_count = ai_chat_count + 1`,
    )
    .bind(userId, t)
    .run()

  const row = await db
    .prepare('SELECT ai_chat_count FROM daily_usage WHERE user_id = ? AND date = ?')
    .bind(userId, t)
    .first<{ ai_chat_count: number }>()

  return row?.ai_chat_count ?? 1
}

// ════════════════════════════════════════════════════════════
// AI Content Cache
// ════════════════════════════════════════════════════════════

export async function getCachedMindmap(
  db: D1Database,
  videoId: string,
): Promise<string | null> {
  const row = await db
    .prepare('SELECT markdown FROM video_mindmaps WHERE video_id = ?')
    .bind(videoId)
    .first<{ markdown: string }>()
  return row?.markdown ?? null
}

export async function saveMindmapCache(
  db: D1Database,
  videoId: string,
  markdown: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO video_mindmaps (video_id, markdown, created_at)
       VALUES (?, ?, ?)
       ON CONFLICT(video_id) DO UPDATE SET markdown = ?, created_at = ?`,
    )
    .bind(videoId, markdown, now(), markdown, now())
    .run()
}

export async function getCachedSlides(
  db: D1Database,
  videoId: string,
): Promise<string | null> {
  const row = await db
    .prepare('SELECT slides_json FROM video_slides WHERE video_id = ?')
    .bind(videoId)
    .first<{ slides_json: string }>()
  return row?.slides_json ?? null
}

export async function saveSlidesCache(
  db: D1Database,
  videoId: string,
  slidesJson: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO video_slides (video_id, slides_json, created_at)
       VALUES (?, ?, ?)
       ON CONFLICT(video_id) DO UPDATE SET slides_json = ?, created_at = ?`,
    )
    .bind(videoId, slidesJson, now(), slidesJson, now())
    .run()
}

// ════════════════════════════════════════════════════════════
// Subtitle Cache
// ════════════════════════════════════════════════════════════

export async function getCachedSubtitles(
  db: D1Database,
  videoId: string,
  lang: string,
): Promise<string | null> {
  const row = await db
    .prepare('SELECT subtitles_json FROM video_subtitles WHERE video_id = ? AND lang = ?')
    .bind(videoId, lang)
    .first<{ subtitles_json: string }>()
  return row?.subtitles_json ?? null
}

export async function saveSubtitlesCache(
  db: D1Database,
  videoId: string,
  lang: string,
  subtitlesJson: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO video_subtitles (video_id, lang, subtitles_json, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(video_id, lang) DO UPDATE SET subtitles_json = ?, created_at = ?`,
    )
    .bind(videoId, lang, subtitlesJson, now(), subtitlesJson, now())
    .run()
}

// ════════════════════════════════════════════════════════════
// Cache Cleanup
// ════════════════════════════════════════════════════════════

export async function cleanExpiredCache(db: D1Database, days: number = 30): Promise<{ subtitles: number; mindmaps: number; slides: number }> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const [s, m, sl] = await Promise.all([
    db.prepare('DELETE FROM video_subtitles WHERE created_at < ?').bind(cutoff).run(),
    db.prepare('DELETE FROM video_mindmaps WHERE created_at < ?').bind(cutoff).run(),
    db.prepare('DELETE FROM video_slides WHERE created_at < ?').bind(cutoff).run(),
  ])

  return {
    subtitles: s.meta.changes ?? 0,
    mindmaps: m.meta.changes ?? 0,
    slides: sl.meta.changes ?? 0,
  }
}
