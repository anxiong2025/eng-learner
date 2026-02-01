import axios from 'axios';
import type { ApiResponse, VideoInfo, SubtitleResponse, Subtitle, AnalyzeResponse, AskResponse, TranslateResponse, VocabularyResponse, SlidesResponse, ChaptersResponse } from '../types';
import { useAuthStore } from '../store/authStore';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid - logout user
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);

export async function parseVideo(url: string): Promise<VideoInfo> {
  const response = await api.post<ApiResponse<VideoInfo>>('/video/parse', { url }, {
    timeout: 120000, // 2 minutes for video parsing (YouTube API can be slow)
  });
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error || 'Failed to parse video');
  }
  return response.data.data;
}

export async function getSubtitles(videoId: string, lang: string = 'en'): Promise<SubtitleResponse> {
  const response = await api.get<ApiResponse<SubtitleResponse>>(`/video/${videoId}/subtitles`, {
    params: { lang },
    timeout: 90000, // 1.5 minutes for subtitle fetching
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

// Mind Map generation
export interface MindMapResponse {
  markdown: string;
}

export async function generateMindMap(title: string, content: string): Promise<MindMapResponse> {
  const response = await api.post<ApiResponse<MindMapResponse>>('/ai/mindmap', {
    title,
    content,
  }, {
    timeout: 120000, // 2 minutes for complex analysis
  });
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error || 'Failed to generate mind map');
  }
  return response.data.data;
}

// Slides generation
export async function generateSlides(title: string, content: string): Promise<SlidesResponse> {
  const response = await api.post<ApiResponse<SlidesResponse>>('/ai/slides', {
    title,
    content,
  }, {
    timeout: 180000, // 3 minutes for slide generation
  });
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error || 'Failed to generate slides');
  }
  return response.data.data;
}

// Chapters/TOC generation
export async function generateChapters(subtitles: Subtitle[]): Promise<ChaptersResponse> {
  const response = await api.post<ApiResponse<ChaptersResponse>>('/ai/chapters', {
    subtitles,
  }, {
    timeout: 60000, // 1 minute for chapter generation
  });
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error || 'Failed to generate chapters');
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
  interval_minutes: number;  // Ebbinghaus-based interval in minutes
  due_date?: string;
  due_at?: string;           // Precise datetime (ISO 8601)
  review_count: number;
  learning_step: number;     // 0-3: learning phase, 4+: review phase
  source_video_id?: string;
  source_sentence?: string;
  created_at: string;
  last_reviewed_at?: string;
  memory_strength: number;   // 0.0-1.0, based on forgetting curve
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

// AI Review APIs
export interface ReviewQuestion {
  vocab_id: number;
  word: string;
  meaning: string;
  source_sentence?: string;
  question_type: 'context' | 'meaning' | 'usage' | 'spelling';
  question: string;
}

export interface ReviewEvaluation {
  is_correct: boolean;
  feedback: string;
  follow_up?: string;
  quality: number; // 0-3
}

export interface StartAIReviewResponse {
  session_id: string;
  questions: ReviewQuestion[];
}

export async function startAIReview(vocabIds: number[]): Promise<StartAIReviewResponse> {
  const response = await api.post<ApiResponse<StartAIReviewResponse>>('/vocabulary/ai-review', {
    vocab_ids: vocabIds,
  }, {
    timeout: 60000, // 1 minute for AI generation
  });
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error || 'Failed to start AI review');
  }
  return response.data.data;
}

// Generate a single review question (for progressive loading)
export interface GenerateQuestionRequest {
  vocab_id: number;
  word: string;
  meaning: string;
  source_sentence?: string;
  question_type?: 'meaning' | 'usage' | 'context' | 'spelling';
}

export async function generateReviewQuestion(request: GenerateQuestionRequest): Promise<ReviewQuestion> {
  const response = await api.post<ApiResponse<{ question: ReviewQuestion }>>('/vocabulary/ai-review/question', request, {
    timeout: 15000, // 15 seconds for single question
  });
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error || 'Failed to generate question');
  }
  return response.data.data.question;
}

export interface SubmitAnswerRequest {
  vocab_id: number;
  word: string;
  meaning: string;
  question: string;
  user_answer: string;
}

export async function submitAIReviewAnswer(request: SubmitAnswerRequest): Promise<ReviewEvaluation> {
  const response = await api.post<ApiResponse<{ evaluation: ReviewEvaluation }>>('/vocabulary/ai-review/answer', request, {
    timeout: 30000, // 30 seconds for AI evaluation
  });
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error || 'Failed to submit answer');
  }
  return response.data.data.evaluation;
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

// Memory distribution for dashboard
export interface MemoryDistribution {
  strong: number;    // >= 70%
  good: number;      // 40-69%
  weak: number;      // 20-39%
  critical: number;  // < 20%
  total: number;
}

export async function getMemoryDistribution(): Promise<MemoryDistribution> {
  const response = await api.get<ApiResponse<MemoryDistribution>>('/stats/memory-distribution');
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error || 'Failed to get memory distribution');
  }
  return response.data.data;
}

// AI Memory Card APIs
export interface GenerateMemoryCardRequest {
  word: string;
  meaning: string;
  source_sentence?: string;
}

export interface AIMemoryCard {
  word: string;
  phonetic?: string;
  part_of_speech?: string;
  meaning: string;
  etymology?: string;
  mnemonic?: string;
  memory_story?: string;
  example_sentence?: string;
  visual_hint?: string;
}

export async function generateMemoryCard(request: GenerateMemoryCardRequest): Promise<AIMemoryCard> {
  const response = await api.post<ApiResponse<{ card: AIMemoryCard }>>('/vocabulary/memory-card', request, {
    timeout: 30000, // 30 seconds for AI generation
  });
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error || 'Failed to generate memory card');
  }
  return response.data.data.card;
}

// Notes APIs
export interface NoteData {
  id?: string;
  video_id: string;
  timestamp: number;
  english?: string;
  chinese?: string;
  note_text?: string;
}

export interface NoteResponse {
  id: string;
  video_id: string;
  timestamp: number;
  english?: string;
  chinese?: string;
  note_text?: string;
  created_at: string;
}

export async function getNotes(videoId?: string): Promise<NoteResponse[]> {
  const params = videoId ? { video_id: videoId } : {};
  const response = await api.get<NoteResponse[]>('/notes', { params });
  return response.data;
}

export async function saveNote(note: NoteData): Promise<NoteResponse> {
  const response = await api.post<NoteResponse>('/notes', note);
  return response.data;
}

export async function deleteNote(noteId: string): Promise<void> {
  await api.delete(`/notes/${noteId}`);
}

// Watch History APIs
export interface WatchHistoryItem {
  video_id: string;
  title: string;
  thumbnail: string;
  watched_at: string;
}

export async function getWatchHistory(): Promise<WatchHistoryItem[]> {
  const response = await api.get<{ history: WatchHistoryItem[] }>('/history');
  return response.data.history;
}

export async function addWatchHistory(item: { video_id: string; title: string; thumbnail: string }): Promise<void> {
  await api.post('/history', {
    video_id: item.video_id,
    title: item.title,
    thumbnail: item.thumbnail,
  });
}

export async function deleteWatchHistoryItem(videoId: string): Promise<void> {
  await api.post('/history/delete', { video_id: videoId });
}

export async function clearWatchHistory(): Promise<void> {
  await api.post('/history/clear');
}

export default api;
