import { create } from 'zustand';
import type { VideoInfo, Subtitle, SubtitleMode, PlayerState, VocabWord, VocabularyItem, Slide, Chapter } from '../types';
import { parseVideo, getSubtitles, analyzeHighlights, translateSubtitles, extractVocabulary, saveVocabulary, checkVocabularySaved, generateChapters } from '../api/client';
import { DEMO_VIDEO_INFO, DEMO_SUBTITLES } from '../data/demoVideo';

// ============ Cache Utilities ============
const CACHE_PREFIX = 'eng_learner_';
const CACHE_EXPIRY_HOURS = 24 * 7; // 7 days

interface VideoCache {
  videoInfo: VideoInfo;
  subtitlesEn: Subtitle[];
  translations: Record<number, string>;
  chapters: Chapter[];
  timestamp: number;
}

function getCacheKey(videoId: string): string {
  return `${CACHE_PREFIX}video_${videoId}`;
}

function getVideoCache(videoId: string): VideoCache | null {
  try {
    const cached = localStorage.getItem(getCacheKey(videoId));
    if (!cached) return null;

    const data: VideoCache = JSON.parse(cached);
    const now = Date.now();
    const expiryMs = CACHE_EXPIRY_HOURS * 60 * 60 * 1000;

    if (now - data.timestamp > expiryMs) {
      localStorage.removeItem(getCacheKey(videoId));
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

function setVideoCache(videoId: string, data: Omit<VideoCache, 'timestamp'>): void {
  try {
    const cache: VideoCache = {
      ...data,
      timestamp: Date.now(),
    };
    localStorage.setItem(getCacheKey(videoId), JSON.stringify(cache));
  } catch (e) {
    console.warn('Failed to cache video data:', e);
  }
}

// Clear all video caches
export function clearAllVideoCache(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(CACHE_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
  console.log('Cleared', keysToRemove.length, 'video caches');
}

// Expose to window for easy debugging
if (typeof window !== 'undefined') {
  (window as any).clearVideoCache = clearAllVideoCache;
}

// Translation batch size - translate this many subtitles at a time
const TRANSLATION_BATCH_SIZE = 15;
// Look-ahead - start translating when we're this close to untranslated content
const TRANSLATION_LOOK_AHEAD = 5;
// Vocabulary batch size - process this many subtitles per batch
const VOCAB_BATCH_SIZE = 30;

interface VideoState {
  // Video info
  videoInfo: VideoInfo | null;
  isLoading: boolean;
  isTranslating: boolean;
  error: string | null;
  rateLimitExceeded: boolean; // True when daily limit reached

  // Player state
  currentTime: number;
  playerState: PlayerState;

  // Seek control - when this changes, player should seek
  seekToTime: number | null;

  // Play control - toggle play/pause request
  togglePlayRequest: number; // Changes to trigger toggle

  // Subtitles
  subtitlesEn: Subtitle[];
  subtitleMode: SubtitleMode;
  activeSubtitleIndex: number;

  // Translations (sparse - only translated indices have values)
  translations: Map<number, string>;
  translatedUpTo: number; // Highest index we've requested translation for
  maxPlayedIndex: number; // Highest index that has been played (for masking)

  // AI highlights
  highlightedIndices: number[];

  // Vocabulary
  vocabulary: VocabWord[];
  isExtractingVocab: boolean;
  vocabProgress: { current: number; total: number };
  vocabError: string | null;
  vocabSeenWords: Set<string>;

  // Mind Map
  mindMapContent: string | null;

  // Slides
  slidesContent: Slide[] | null;
  isGeneratingSlides: boolean;

  // Subtitle visibility
  showSubtitle: boolean;

  // Chapters / Table of Contents
  chapters: Chapter[];
  isGeneratingChapters: boolean;

  // Actions
  loadVideo: (url: string, cachedVideoId?: string) => Promise<void>;
  loadDemoVideo: () => void;
  setCurrentTime: (time: number) => void;
  setPlayerState: (state: PlayerState) => void;
  setSubtitleMode: (mode: SubtitleMode) => void;
  setHighlights: (indices: number[]) => void;
  seekTo: (time: number) => void;
  clearSeek: () => void;
  togglePlay: () => void;
  reset: () => void;
  getTranslation: (index: number) => string | undefined;
  isUnlocked: (index: number) => boolean;

  // Vocabulary actions
  extractVocabulary: () => Promise<void>;
  saveWord: (index: number) => Promise<void>;
  saveAllWords: () => Promise<void>;

  // Mind Map actions
  setMindMapContent: (content: string | null) => void;

  // Slides actions
  setSlidesContent: (slides: Slide[] | null) => void;
  setIsGeneratingSlides: (isGenerating: boolean) => void;

  // Subtitle visibility actions
  toggleSubtitle: () => void;

  // Retry translation for specific indices
  retryTranslation: (indices: number[]) => Promise<void>;

  // Clear rate limit error
  clearRateLimitError: () => void;
}

const initialState = {
  videoInfo: null,
  isLoading: false,
  isTranslating: false,
  error: null,
  rateLimitExceeded: false,
  currentTime: 0,
  playerState: 'unstarted' as PlayerState,
  seekToTime: null as number | null,
  togglePlayRequest: 0,
  subtitlesEn: [] as Subtitle[],
  subtitleMode: 'both' as SubtitleMode,
  activeSubtitleIndex: -1,
  translations: new Map<number, string>(),
  translatedUpTo: -1,
  maxPlayedIndex: -1,
  highlightedIndices: [] as number[],
  // Vocabulary
  vocabulary: [] as VocabWord[],
  isExtractingVocab: false,
  vocabProgress: { current: 0, total: 0 },
  vocabError: null as string | null,
  vocabSeenWords: new Set<string>(),
  // Mind Map
  mindMapContent: null as string | null,
  // Slides
  slidesContent: null as Slide[] | null,
  isGeneratingSlides: false,
  // Subtitle visibility
  showSubtitle: false,
  // Chapters
  chapters: [] as Chapter[],
  isGeneratingChapters: false,
};

// Track pending translation to avoid duplicate requests
let pendingTranslation = false;

export const useVideoStore = create<VideoState>((set, get) => ({
  ...initialState,

  loadVideo: async (url: string, cachedVideoId?: string) => {
    set({
      isLoading: true,
      error: null,
      translations: new Map(),
      translatedUpTo: -1,
      maxPlayedIndex: -1,
    });
    pendingTranslation = false;

    try {
      // If we have a cached video ID, check cache first before making any API calls
      if (cachedVideoId) {
        const cached = getVideoCache(cachedVideoId);
        if (cached && cached.subtitlesEn.length > 0) {
          console.log('Loading from cache (fast path):', cachedVideoId);
          const translationMap = new Map<number, string>(
            Object.entries(cached.translations).map(([k, v]) => [parseInt(k), v])
          );
          set({
            videoInfo: cached.videoInfo,
            subtitlesEn: cached.subtitlesEn,
            translations: translationMap,
            translatedUpTo: translationMap.size > 0 ? Math.max(...translationMap.keys()) : -1,
            maxPlayedIndex: translationMap.size > 0 ? Math.max(...translationMap.keys()) : -1,
            chapters: cached.chapters || [],
            isLoading: false,
          });

          // Still extract vocabulary in background if needed
          setTimeout(() => {
            useVideoStore.getState().extractVocabulary();
          }, 100);
          return;
        }
      }

      // Parse video info first to get video ID
      const videoInfo = await parseVideo(url);
      set({ videoInfo });

      // Check cache (fallback path)
      const cached = getVideoCache(videoInfo.video_id);
      if (cached && cached.subtitlesEn.length > 0) {
        console.log('Loading from cache:', videoInfo.video_id);
        const translationMap = new Map<number, string>(
          Object.entries(cached.translations).map(([k, v]) => [parseInt(k), v])
        );
        set({
          subtitlesEn: cached.subtitlesEn,
          translations: translationMap,
          translatedUpTo: translationMap.size > 0 ? Math.max(...translationMap.keys()) : -1,
          maxPlayedIndex: translationMap.size > 0 ? Math.max(...translationMap.keys()) : -1,
          chapters: cached.chapters || [],
          isLoading: false,
        });

        // Still extract vocabulary in background if needed
        setTimeout(() => {
          useVideoStore.getState().extractVocabulary();
        }, 100);
        return;
      }

      // Fetch English subtitles only (Chinese translation via AI)
      try {
        const enSubs = await getSubtitles(videoInfo.video_id, 'en');
        set({ subtitlesEn: enSubs.subtitles, isLoading: false });

        // Start AI translation in background
        requestTranslationBatch(0);

        // Analyze highlights with AI (non-blocking)
        analyzeHighlights(enSubs.subtitles)
          .then((result) => {
            set({ highlightedIndices: result.highlights });
          })
          .catch((e) => {
            console.warn('Failed to analyze highlights:', e);
          });

        // Generate chapters/TOC (non-blocking)
        set({ isGeneratingChapters: true });
        generateChapters(enSubs.subtitles)
          .then((result) => {
            set({ chapters: result.chapters, isGeneratingChapters: false });
            // Update cache with chapters
            const state = useVideoStore.getState();
            if (state.videoInfo) {
              const transObj: Record<number, string> = {};
              state.translations.forEach((v, k) => { transObj[k] = v; });
              setVideoCache(state.videoInfo.video_id, {
                videoInfo: state.videoInfo,
                subtitlesEn: state.subtitlesEn,
                translations: transObj,
                chapters: result.chapters,
              });
            }
          })
          .catch((e) => {
            console.warn('Failed to generate chapters:', e);
            set({ isGeneratingChapters: false });
          });

        // Extract vocabulary in background (non-blocking)
        setTimeout(() => {
          useVideoStore.getState().extractVocabulary();
        }, 100);
      } catch (e) {
        console.warn('Failed to fetch English subtitles:', e);
        set({ isLoading: false });
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to load video';
      const isRateLimit = errorMessage.includes('Daily limit reached') ||
                          errorMessage.includes('limit exceeded');
      set({
        isLoading: false,
        error: errorMessage,
        rateLimitExceeded: isRateLimit,
      });
    }
  },

  // Load demo video with pre-loaded data (no network request)
  loadDemoVideo: () => {
    set({
      videoInfo: DEMO_VIDEO_INFO,
      subtitlesEn: DEMO_SUBTITLES,
      isLoading: false,
      error: null,
      translations: new Map(),
      translatedUpTo: -1,
      maxPlayedIndex: -1,
    });
    pendingTranslation = false;

    // Start translating first batch
    requestTranslationBatch(0);

    // Analyze highlights (non-blocking)
    analyzeHighlights(DEMO_SUBTITLES)
      .then((result) => {
        useVideoStore.setState({ highlightedIndices: result.highlights });
      })
      .catch((e) => {
        console.warn('Failed to analyze highlights:', e);
      });

    // Generate chapters/TOC (non-blocking)
    useVideoStore.setState({ isGeneratingChapters: true });
    generateChapters(DEMO_SUBTITLES)
      .then((result) => {
        useVideoStore.setState({ chapters: result.chapters, isGeneratingChapters: false });
      })
      .catch((e) => {
        console.warn('Failed to generate chapters:', e);
        useVideoStore.setState({ isGeneratingChapters: false });
      });

    // Extract vocabulary in background (non-blocking)
    setTimeout(() => {
      useVideoStore.getState().extractVocabulary();
    }, 100);
  },

  setCurrentTime: (time: number) => {
    const { subtitlesEn, maxPlayedIndex, translatedUpTo } = get();
    const activeIndex = subtitlesEn.findIndex(
      (s) => time >= s.start && time < s.end
    );

    // Update max played index (high water mark)
    const newMaxPlayed = Math.max(maxPlayedIndex, activeIndex);

    set({
      currentTime: time,
      activeSubtitleIndex: activeIndex,
      maxPlayedIndex: newMaxPlayed,
    });

    // Check if we need more translations (look ahead)
    if (activeIndex >= 0 && activeIndex + TRANSLATION_LOOK_AHEAD > translatedUpTo) {
      requestTranslationBatch(translatedUpTo + 1);
    }
  },

  setPlayerState: (state: PlayerState) => {
    set({ playerState: state });
  },

  setSubtitleMode: (mode: SubtitleMode) => {
    set({ subtitleMode: mode });
  },

  setHighlights: (indices: number[]) => {
    set({ highlightedIndices: indices });
  },

  seekTo: (time: number) => {
    set({ seekToTime: time });
  },

  clearSeek: () => {
    set({ seekToTime: null });
  },

  togglePlay: () => {
    set(state => ({ togglePlayRequest: state.togglePlayRequest + 1 }));
  },

  reset: () => {
    pendingTranslation = false;
    set({ ...initialState, translations: new Map(), vocabSeenWords: new Set() });
  },

  clearRateLimitError: () => {
    set({ rateLimitExceeded: false, error: null });
  },

  // Get translation for a specific index
  getTranslation: (index: number) => {
    return get().translations.get(index);
  },

  // Check if a subtitle is unlocked (has been played through)
  isUnlocked: (index: number) => {
    return index <= get().maxPlayedIndex;
  },

  // Extract vocabulary from all subtitles
  extractVocabulary: async () => {
    const { subtitlesEn, videoInfo, vocabulary } = get();
    if (!videoInfo || subtitlesEn.length === 0) return;

    // If already extracted, don't re-extract
    if (vocabulary.length > 0) return;

    set({ isExtractingVocab: true, vocabError: null });

    // Split into batches
    const batches: string[][] = [];
    for (let i = 0; i < subtitlesEn.length; i += VOCAB_BATCH_SIZE) {
      const batch = subtitlesEn.slice(i, i + VOCAB_BATCH_SIZE).map(s => s.text);
      batches.push(batch);
    }

    set({ vocabProgress: { current: 0, total: batches.length } });

    const addNewWords = async (newWords: VocabularyItem[]) => {
      const currentSeenWords = get().vocabSeenWords;
      // Filter out duplicates
      const uniqueNew = newWords.filter(item => {
        const lower = item.word.toLowerCase();
        if (currentSeenWords.has(lower)) return false;
        currentSeenWords.add(lower);
        return true;
      });

      if (uniqueNew.length === 0) return;

      // Check saved status in parallel
      const savedChecks = await Promise.all(
        uniqueNew.map(async (w) => {
          try {
            return await checkVocabularySaved(w.word);
          } catch {
            return false;
          }
        })
      );

      const wordsWithStatus: VocabWord[] = uniqueNew.map((w, i) => ({
        ...w,
        saved: savedChecks[i],
        saving: false,
      }));

      set(state => ({
        vocabulary: [...state.vocabulary, ...wordsWithStatus],
        vocabSeenWords: currentSeenWords,
      }));
    };

    try {
      // Process first batch immediately for quick display
      if (batches.length > 0) {
        const firstResult = await extractVocabulary(batches[0].join(' '));
        await addNewWords(firstResult.vocabulary);
        set({ vocabProgress: { current: 1, total: batches.length } });
      }

      // Process remaining batches in background with delay
      for (let i = 1; i < batches.length; i++) {
        // Add delay between batches (2 seconds) to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 2000));

        try {
          const result = await extractVocabulary(batches[i].join(' '));
          await addNewWords(result.vocabulary);
          set({ vocabProgress: { current: i + 1, total: batches.length } });
        } catch (e) {
          console.error(`Batch ${i + 1} failed:`, e);
          // Continue with next batch even if one fails
        }
      }
    } catch (e) {
      set({ vocabError: e instanceof Error ? e.message : 'Failed to extract vocabulary' });
    } finally {
      set({ isExtractingVocab: false });
    }
  },

  // Save a single word
  saveWord: async (index: number) => {
    const { vocabulary, videoInfo } = get();
    const word = vocabulary[index];
    if (!word || word.saved || word.saving) return;

    set(state => ({
      vocabulary: state.vocabulary.map((w, i) =>
        i === index ? { ...w, saving: true } : w
      ),
      vocabError: null,
    }));

    try {
      await saveVocabulary({
        word: word.word,
        meaning: word.meaning,
        level: word.level,
        example: word.example,
        source_video_id: videoInfo?.video_id,
      });

      set(state => ({
        vocabulary: state.vocabulary.map((w, i) =>
          i === index ? { ...w, saved: true, saving: false } : w
        ),
      }));
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Failed to save word. Please try again.';
      console.error('Save word error:', e);
      set(state => ({
        vocabulary: state.vocabulary.map((w, i) =>
          i === index ? { ...w, saving: false } : w
        ),
        vocabError: errorMsg,
      }));
    }
  },

  // Save all unsaved words
  saveAllWords: async () => {
    const { vocabulary, videoInfo } = get();
    const unsavedIndices = vocabulary
      .map((w, i) => (!w.saved && !w.saving ? i : -1))
      .filter(i => i >= 0);

    if (unsavedIndices.length === 0) return;

    // Mark all as saving
    set(state => ({
      vocabulary: state.vocabulary.map(w =>
        !w.saved ? { ...w, saving: true } : w
      ),
    }));

    // Save each word
    for (const index of unsavedIndices) {
      const word = get().vocabulary[index];
      if (!word) continue;

      try {
        await saveVocabulary({
          word: word.word,
          meaning: word.meaning,
          level: word.level,
          example: word.example,
          source_video_id: videoInfo?.video_id,
        });

        set(state => ({
          vocabulary: state.vocabulary.map((w, i) =>
            i === index ? { ...w, saved: true, saving: false } : w
          ),
        }));
      } catch {
        set(state => ({
          vocabulary: state.vocabulary.map((w, i) =>
            i === index ? { ...w, saving: false } : w
          ),
        }));
      }
    }
  },

  // Set mind map content
  setMindMapContent: (content: string | null) => {
    set({ mindMapContent: content });
  },

  // Set slides content
  setSlidesContent: (slides: Slide[] | null) => {
    set({ slidesContent: slides });
  },

  // Set slides generating state
  setIsGeneratingSlides: (isGenerating: boolean) => {
    set({ isGeneratingSlides: isGenerating });
  },

  // Toggle subtitle visibility
  toggleSubtitle: () => {
    set(state => ({ showSubtitle: !state.showSubtitle }));
  },

  // Retry translation for specific indices
  retryTranslation: async (indices: number[]) => {
    const { subtitlesEn, translations, videoInfo } = get();
    if (indices.length === 0 || !videoInfo) return;

    // Get subtitles for the specified indices
    const batch = indices.map(i => subtitlesEn[i]).filter(Boolean);
    if (batch.length === 0) return;

    set({ isTranslating: true });

    try {
      const result = await translateSubtitles(batch);

      // Update translations map
      const newTranslations = new Map(translations);
      result.translations.forEach((text, i) => {
        if (text && !text.includes('Translation failed')) {
          newTranslations.set(indices[i], text);
        }
      });

      set({ translations: newTranslations, isTranslating: false });

      // Update cache
      const transObj: Record<number, string> = {};
      newTranslations.forEach((v, k) => { transObj[k] = v; });
      setVideoCache(videoInfo.video_id, {
        videoInfo,
        subtitlesEn,
        translations: transObj,
        chapters: get().chapters,
      });
    } catch (e) {
      console.error('Retry translation failed:', e);
      set({ isTranslating: false });
    }
  },
}));

// Helper function to request translation for a batch
async function requestTranslationBatch(startIndex: number) {
  if (pendingTranslation) return;

  const state = useVideoStore.getState();
  const { subtitlesEn } = state;

  if (startIndex >= subtitlesEn.length) return;

  const endIndex = Math.min(startIndex + TRANSLATION_BATCH_SIZE, subtitlesEn.length);
  const batch = subtitlesEn.slice(startIndex, endIndex);

  if (batch.length === 0) return;

  pendingTranslation = true;
  useVideoStore.setState({ isTranslating: true });

  try {
    const result = await translateSubtitles(batch);

    // Merge new translations into existing map
    const currentState = useVideoStore.getState();
    const newTranslations = new Map(currentState.translations);

    result.translations.forEach((text, i) => {
      newTranslations.set(startIndex + i, text);
    });

    useVideoStore.setState({
      translations: newTranslations,
      translatedUpTo: endIndex - 1,
      isTranslating: false,
    });

    // Update cache with new translations
    const updatedState = useVideoStore.getState();
    if (updatedState.videoInfo) {
      const transObj: Record<number, string> = {};
      newTranslations.forEach((v, k) => { transObj[k] = v; });
      setVideoCache(updatedState.videoInfo.video_id, {
        videoInfo: updatedState.videoInfo,
        subtitlesEn: updatedState.subtitlesEn,
        translations: transObj,
        chapters: updatedState.chapters,
      });
    }
  } catch (e) {
    console.error('Translation batch failed:', e);
    useVideoStore.setState({ isTranslating: false });
  } finally {
    pendingTranslation = false;
  }

  // Check if we need another batch (if user has progressed)
  // Add a small delay to avoid overwhelming the API
  setTimeout(() => {
    const { activeSubtitleIndex, translatedUpTo, subtitlesEn } = useVideoStore.getState();
    if (activeSubtitleIndex + TRANSLATION_LOOK_AHEAD > translatedUpTo && translatedUpTo < subtitlesEn.length - 1) {
      requestTranslationBatch(translatedUpTo + 1);
    }
  }, 1000);
}
