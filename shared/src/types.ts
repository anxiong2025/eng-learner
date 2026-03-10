// ============ Video & Subtitle ============

export interface VideoInfo {
  video_id: string
  title: string
  duration: number
  thumbnail: string
}

export interface Subtitle {
  index: number
  start: number
  end: number
  text: string
  translation?: string
}

export interface SubtitleResponse {
  video_id: string
  subtitles: Subtitle[]
  language: string
}

// ============ User ============

export interface UserInfo {
  id: string
  name: string
  email: string
  avatar?: string
  provider: string
  tier: string
}

// ============ Notes ============

export interface Note {
  id: string
  video_id: string
  timestamp: number
  english?: string
  chinese?: string
  note_text?: string
  images?: string[]
  created_at: string
}

// ============ Vocabulary ============

export interface SavedVocabulary {
  id: number
  word: string
  meaning: string
  level: string
  example?: string
  ease_factor: number
  interval_days: number
  interval_minutes: number
  due_date?: string
  due_at?: string
  review_count: number
  learning_step: number
  source_video_id?: string
  source_sentence?: string
  created_at: string
  last_reviewed_at?: string
  memory_strength: number
}

export interface VocabularyItem {
  word: string
  meaning: string
  level: string
  example: string
}

// ============ Learning Stats ============

export interface DailyStats {
  date: string
  words_learned: number
  words_reviewed: number
  correct_count: number
  incorrect_count: number
  study_time_minutes: number
}

export interface UserProgress {
  total_words_learned: number
  total_reviews: number
  current_streak: number
  longest_streak: number
  last_study_date?: string
}

export interface LearningOverview {
  today: DailyStats
  progress: UserProgress
  weekly_stats: DailyStats[]
  accuracy_rate: number
}

// ============ Watch History ============

export interface WatchHistoryItem {
  video_id: string
  title: string
  thumbnail: string
  watched_at: string
}

// ============ Usage / Rate Limiting ============

export interface UsageStatus {
  used: number
  limit: number
  remaining: number
  bonus_quota: number
}

export interface AiChatUsageStatus {
  used: number
  limit: number
  remaining: number
}

export interface DailyUsageStatus {
  video_parse: UsageStatus
  ai_chat: AiChatUsageStatus
}

// ============ AI ============

export interface Chapter {
  title: string
  start_time: number
}

export interface Slide {
  slide_type: string
  title: string
  subtitle?: string
  bullets: string[]
  notes?: string
}

export interface ReviewQuestion {
  vocab_id: number
  word: string
  meaning: string
  source_sentence?: string
  question_type: string
  question: string
}

export interface ReviewEvaluation {
  is_correct: boolean
  feedback: string
  follow_up?: string
  quality: number
}

export interface MemoryCard {
  word: string
  phonetic?: string
  part_of_speech?: string
  meaning: string
  etymology?: string
  mnemonic?: string
  memory_story?: string
  example_sentence?: string
  visual_hint?: string
}

// ============ API Response ============

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  code?: string
}

// ============ Invite ============

export interface InviteCodeResponse {
  invite_code: string
  invite_link: string
}

export interface InviteStatsResponse {
  invite_count: number
  bonus_quota: number
  bonus_per_invite: number
}
