import { create } from 'zustand';
import type { VideoInfo, Subtitle, SubtitleMode, PlayerState } from '../types';
import { parseVideo, getSubtitles, analyzeHighlights, translateSubtitles } from '../api/client';

// Translation batch size - translate this many subtitles at a time
const TRANSLATION_BATCH_SIZE = 15;
// Look-ahead - start translating when we're this close to untranslated content
const TRANSLATION_LOOK_AHEAD = 5;

interface VideoState {
  // Video info
  videoInfo: VideoInfo | null;
  isLoading: boolean;
  isTranslating: boolean;
  error: string | null;

  // Player state
  currentTime: number;
  playerState: PlayerState;

  // Seek control - when this changes, player should seek
  seekToTime: number | null;

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

  // Actions
  loadVideo: (url: string) => Promise<void>;
  setCurrentTime: (time: number) => void;
  setPlayerState: (state: PlayerState) => void;
  setSubtitleMode: (mode: SubtitleMode) => void;
  setHighlights: (indices: number[]) => void;
  seekTo: (time: number) => void;
  clearSeek: () => void;
  reset: () => void;
  getTranslation: (index: number) => string | undefined;
  isUnlocked: (index: number) => boolean;
}

const initialState = {
  videoInfo: null,
  isLoading: false,
  isTranslating: false,
  error: null,
  currentTime: 0,
  playerState: 'unstarted' as PlayerState,
  seekToTime: null as number | null,
  subtitlesEn: [] as Subtitle[],
  subtitleMode: 'both' as SubtitleMode,
  activeSubtitleIndex: -1,
  translations: new Map<number, string>(),
  translatedUpTo: -1,
  maxPlayedIndex: -1,
  highlightedIndices: [] as number[],
};

// Track pending translation to avoid duplicate requests
let pendingTranslation = false;

export const useVideoStore = create<VideoState>((set, get) => ({
  ...initialState,

  loadVideo: async (url: string) => {
    set({
      isLoading: true,
      error: null,
      translations: new Map(),
      translatedUpTo: -1,
      maxPlayedIndex: -1,
    });
    pendingTranslation = false;

    try {
      // Parse video info
      const videoInfo = await parseVideo(url);
      set({ videoInfo });

      // Fetch English subtitles
      try {
        const enSubs = await getSubtitles(videoInfo.video_id, 'en');
        set({ subtitlesEn: enSubs.subtitles, isLoading: false });

        // First, try to get existing Chinese subtitles from YouTube
        try {
          const zhSubs = await getSubtitles(videoInfo.video_id, 'zh');
          // YouTube has Chinese subtitles - load them all
          const translationMap = new Map<number, string>();
          zhSubs.subtitles.forEach((sub, index) => {
            translationMap.set(index, sub.text);
          });
          set({
            translations: translationMap,
            translatedUpTo: zhSubs.subtitles.length - 1,
            maxPlayedIndex: zhSubs.subtitles.length - 1, // Unlock all if YouTube has Chinese
          });
        } catch {
          // No Chinese subtitles from YouTube - use on-demand AI translation
          console.log('No Chinese subtitles from YouTube, will use on-demand AI translation');
          // Translate first batch immediately
          requestTranslationBatch(0);
        }

        // Analyze highlights with AI (non-blocking)
        analyzeHighlights(enSubs.subtitles)
          .then((result) => {
            set({ highlightedIndices: result.highlights });
          })
          .catch((e) => {
            console.warn('Failed to analyze highlights:', e);
          });
      } catch (e) {
        console.warn('Failed to fetch English subtitles:', e);
        set({ isLoading: false });
      }
    } catch (e) {
      set({
        isLoading: false,
        error: e instanceof Error ? e.message : 'Failed to load video',
      });
    }
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

  reset: () => {
    pendingTranslation = false;
    set({ ...initialState, translations: new Map() });
  },

  // Get translation for a specific index
  getTranslation: (index: number) => {
    return get().translations.get(index);
  },

  // Check if a subtitle is unlocked (has been played through)
  isUnlocked: (index: number) => {
    return index <= get().maxPlayedIndex;
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
  } catch (e) {
    console.error('Translation batch failed:', e);
    useVideoStore.setState({ isTranslating: false });
  } finally {
    pendingTranslation = false;
  }

  // Check if we need another batch (if user has progressed)
  const { activeSubtitleIndex, translatedUpTo } = useVideoStore.getState();
  if (activeSubtitleIndex + TRANSLATION_LOOK_AHEAD > translatedUpTo) {
    requestTranslationBatch(translatedUpTo + 1);
  }
}
