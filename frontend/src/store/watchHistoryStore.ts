import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import * as api from '../api/client';

export interface WatchHistoryItem {
  videoId: string;
  title: string;
  thumbnail: string;
  watchedAt: number; // timestamp
}

interface WatchHistoryState {
  history: WatchHistoryItem[];
  isLoading: boolean;
  addToHistory: (item: Omit<WatchHistoryItem, 'watchedAt'>) => void;
  removeFromHistory: (videoId: string) => void;
  clearHistory: () => void;
  syncFromServer: () => Promise<void>;
}

const MAX_HISTORY_ITEMS = 10;

export const useWatchHistoryStore = create<WatchHistoryState>()(
  persist(
    (set, get) => ({
      history: [],
      isLoading: false,

      addToHistory: async (item) => {
        // Optimistically update local state
        set((state) => {
          const filtered = state.history.filter(h => h.videoId !== item.videoId);
          const newHistory = [
            { ...item, watchedAt: Date.now() },
            ...filtered,
          ].slice(0, MAX_HISTORY_ITEMS);
          return { history: newHistory };
        });

        // Sync to server (fire and forget)
        try {
          await api.addWatchHistory({
            video_id: item.videoId,
            title: item.title,
            thumbnail: item.thumbnail,
          });
        } catch (e) {
          console.warn('Failed to sync watch history to server:', e);
        }
      },

      removeFromHistory: async (videoId) => {
        // Optimistically update local state
        set((state) => ({
          history: state.history.filter(h => h.videoId !== videoId),
        }));

        // Sync to server
        try {
          await api.deleteWatchHistoryItem(videoId);
        } catch (e) {
          console.warn('Failed to delete watch history from server:', e);
        }
      },

      clearHistory: async () => {
        set({ history: [] });

        try {
          await api.clearWatchHistory();
        } catch (e) {
          console.warn('Failed to clear watch history on server:', e);
        }
      },

      syncFromServer: async () => {
        set({ isLoading: true });
        try {
          const serverHistory = await api.getWatchHistory();
          // Convert server format to local format
          const localHistory: WatchHistoryItem[] = serverHistory.map(item => ({
            videoId: item.video_id,
            title: item.title,
            thumbnail: item.thumbnail,
            watchedAt: new Date(item.watched_at).getTime(),
          }));
          set({ history: localHistory, isLoading: false });
        } catch (e) {
          console.warn('Failed to sync watch history from server:', e);
          set({ isLoading: false });
        }
      },
    }),
    {
      name: 'watch-history',
    }
  )
);
