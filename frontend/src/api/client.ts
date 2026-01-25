import axios from 'axios';
import type { ApiResponse, VideoInfo, SubtitleResponse, Subtitle, AnalyzeResponse, AskResponse, TranslateResponse, VocabularyResponse } from '../types';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

export async function parseVideo(url: string): Promise<VideoInfo> {
  const response = await api.post<ApiResponse<VideoInfo>>('/video/parse', { url });
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error || 'Failed to parse video');
  }
  return response.data.data;
}

export async function getSubtitles(videoId: string, lang: string = 'en'): Promise<SubtitleResponse> {
  const response = await api.get<ApiResponse<SubtitleResponse>>(`/video/${videoId}/subtitles`, {
    params: { lang },
    timeout: lang === 'zh' ? 120000 : 30000, // 2 minutes for Chinese (translation needed)
  });
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error || 'Failed to fetch subtitles');
  }
  return response.data.data;
}

export async function analyzeHighlights(subtitles: Subtitle[]): Promise<AnalyzeResponse> {
  const response = await api.post<ApiResponse<AnalyzeResponse>>('/ai/analyze', { subtitles });
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error || 'Failed to analyze subtitles');
  }
  return response.data.data;
}

export async function askAI(context: string, question: string): Promise<AskResponse> {
  const response = await api.post<ApiResponse<AskResponse>>('/ai/ask', { context, question });
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error || 'Failed to get AI response');
  }
  return response.data.data;
}

export async function translateSubtitles(subtitles: Subtitle[]): Promise<TranslateResponse> {
  const response = await api.post<ApiResponse<TranslateResponse>>('/ai/translate', { subtitles }, {
    timeout: 120000, // 2 minutes for translation
  });
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error || 'Failed to translate subtitles');
  }
  return response.data.data;
}

export async function extractVocabulary(text: string): Promise<VocabularyResponse> {
  const response = await api.post<ApiResponse<VocabularyResponse>>('/ai/vocabulary', { text }, {
    timeout: 30000,
  });
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error || 'Failed to extract vocabulary');
  }
  return response.data.data;
}

// Vocabulary persistence APIs
export interface SaveVocabularyRequest {
  word: string;
  meaning: string;
  level: string;
  example?: string;
  source_video_id?: string;
  source_sentence?: string;
}

export interface SavedVocabulary {
  id: number;
  word: string;
  meaning: string;
  level: string;
  example?: string;
  ease_factor: number;
  interval_days: number;
  due_date?: string;
  review_count: number;
  source_video_id?: string;
  source_sentence?: string;
  created_at: string;
}

export async function saveVocabulary(data: SaveVocabularyRequest): Promise<{ id: number }> {
  const response = await api.post<ApiResponse<{ id: number }>>('/vocabulary/save', data);
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error || 'Failed to save vocabulary');
  }
  return response.data.data;
}

export async function getVocabularyList(dueOnly = false): Promise<{ vocabulary: SavedVocabulary[]; total: number }> {
  const response = await api.get<ApiResponse<{ vocabulary: SavedVocabulary[]; total: number }>>('/vocabulary/list', {
    params: { due_only: dueOnly },
  });
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error || 'Failed to get vocabulary list');
  }
  return response.data.data;
}

export async function reviewVocabulary(vocabId: number, quality: number): Promise<void> {
  const response = await api.post<ApiResponse<null>>('/vocabulary/review', {
    vocab_id: vocabId,
    quality,
  });
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to review vocabulary');
  }
}

export async function deleteVocabulary(vocabId: number): Promise<void> {
  const response = await api.delete<ApiResponse<null>>(`/vocabulary/delete/${vocabId}`);
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to delete vocabulary');
  }
}

export async function checkVocabularySaved(word: string): Promise<boolean> {
  const response = await api.get<ApiResponse<{ saved: boolean }>>(`/vocabulary/check/${encodeURIComponent(word)}`);
  if (!response.data.success || !response.data.data) {
    return false;
  }
  return response.data.data.saved;
}

// Learning Statistics APIs
export interface DailyStats {
  date: string;
  words_learned: number;
  words_reviewed: number;
  correct_count: number;
  incorrect_count: number;
  study_time_minutes: number;
}

export interface UserProgress {
  total_words_learned: number;
  total_reviews: number;
  current_streak: number;
  longest_streak: number;
  last_study_date?: string;
}

export interface LearningOverview {
  today: DailyStats;
  progress: UserProgress;
  weekly_stats: DailyStats[];
  accuracy_rate: number;
}

export async function getTodayStats(): Promise<DailyStats> {
  const response = await api.get<ApiResponse<DailyStats>>('/stats/today');
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error || 'Failed to get today stats');
  }
  return response.data.data;
}

export async function getDailyStats(days = 7): Promise<DailyStats[]> {
  const response = await api.get<ApiResponse<DailyStats[]>>('/stats/daily', {
    params: { days },
  });
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error || 'Failed to get daily stats');
  }
  return response.data.data;
}

export async function getUserProgress(): Promise<UserProgress> {
  const response = await api.get<ApiResponse<UserProgress>>('/stats/progress');
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error || 'Failed to get user progress');
  }
  return response.data.data;
}

export async function getLearningOverview(): Promise<LearningOverview> {
  const response = await api.get<ApiResponse<LearningOverview>>('/stats/overview');
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error || 'Failed to get learning overview');
  }
  return response.data.data;
}

export default api;
