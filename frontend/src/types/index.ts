export interface VideoInfo {
  video_id: string;
  title: string;
  duration: number;
  thumbnail: string;
}

export interface Subtitle {
  index: number;
  start: number;
  end: number;
  text: string;
  translation?: string;
}

export interface SubtitleResponse {
  video_id: string;
  subtitles: Subtitle[];
  language: string;
}

export interface NoteReply {
  id: string;
  content: string;
  created_at: string;
}

export interface Note {
  id: string;
  video_id: string;
  timestamp: number;
  english?: string;
  chinese?: string;
  note_text?: string;
  images?: string[];  // Base64 encoded images
  created_at: string;
  replies?: NoteReply[];
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export type SubtitleMode = 'en' | 'zh' | 'both';

export type PlayerState = 'unstarted' | 'playing' | 'paused' | 'ended' | 'buffering';

export interface AnalyzeRequest {
  subtitles: Subtitle[];
}

export interface AnalyzeResponse {
  highlights: number[];
}

export interface AskRequest {
  context: string;
  question: string;
}

export interface AskResponse {
  answer: string;
}

export interface TranslateResponse {
  translations: string[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface VocabularyItem {
  word: string;
  meaning: string;
  level: string;
  example: string;
}

export interface VocabularyResponse {
  vocabulary: VocabularyItem[];
}

export interface VocabWord extends VocabularyItem {
  saved: boolean;
  saving: boolean;
}

export interface Slide {
  slide_type: 'title' | 'content' | 'summary' | 'quote';
  title: string;
  subtitle?: string;
  bullets: string[];
  notes?: string;
  quote?: string;
}

export interface SlidesResponse {
  slides: Slide[];
}

export interface Chapter {
  title: string;
  start_time: number;
}

export interface ChaptersResponse {
  chapters: Chapter[];
}

// AI Memory Card for vocabulary learning
export interface AIMemoryCard {
  word: string;
  phonetic?: string;           // 音标
  part_of_speech?: string;     // 词性
  meaning: string;             // 中文释义
  etymology?: string;          // 词根词缀拆解
  mnemonic?: string;           // 联想记忆法
  memory_story?: string;       // 记忆故事
  example_sentence?: string;   // AI生成例句
  source_sentence?: string;    // 视频原句
  visual_hint?: string;        // 视觉联想描述
}
