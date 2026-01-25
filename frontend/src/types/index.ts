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

export interface Note {
  id: string;
  video_id: string;
  text: string;
  translation?: string;
  timestamp: number;
  created_at: string;
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
