import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Note, NoteReply } from '../types';
import { getNotes, saveNote, deleteNote as deleteNoteApi } from '../api/client';
import { useAuthStore } from '../store/authStore';

interface NoteState {
  notes: Note[];
  isLoading: boolean;
  addNote: (note: Omit<Note, 'id' | 'created_at'>) => Promise<void>;
  addQuickNote: (videoId: string, timestamp: number, text: string, images?: string[]) => Promise<void>;
  updateNote: (id: string, text: string) => void;
  addReply: (noteId: string, content: string) => void;
  removeReply: (noteId: string, replyId: string) => void;
  removeNote: (id: string) => Promise<void>;
  getNotesByVideo: (videoId: string) => Note[];
  clearNotes: () => void;
  syncFromServer: () => Promise<void>;
}

export const useNoteStore = create<NoteState>()(
  persist(
    (set, get) => ({
      notes: [],
      isLoading: false,

      updateNote: (id, text) => {
        set((state) => ({
          notes: state.notes.map((n) =>
            n.id === id ? { ...n, note_text: text } : n
          ),
        }));
      },

      addReply: (noteId, content) => {
        const reply: NoteReply = {
          id: `reply_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          content,
          created_at: new Date().toISOString(),
        };

        set((state) => ({
          notes: state.notes.map((n) =>
            n.id === noteId
              ? { ...n, replies: [...(n.replies || []), reply] }
              : n
          ),
        }));
      },

      removeReply: (noteId, replyId) => {
        set((state) => ({
          notes: state.notes.map((n) =>
            n.id === noteId
              ? { ...n, replies: (n.replies || []).filter((r) => r.id !== replyId) }
              : n
          ),
        }));
      },

      addQuickNote: async (videoId, timestamp, text, images) => {
        const isAuthenticated = useAuthStore.getState().isAuthenticated;

        const note: Note = {
          id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          video_id: videoId,
          timestamp,
          note_text: text,
          images,
          created_at: new Date().toISOString(),
        };

        // Add to local state immediately
        set((state) => ({ notes: [...state.notes, note] }));

        // If authenticated, sync to server
        if (isAuthenticated) {
          try {
            await saveNote({
              id: note.id,
              video_id: note.video_id,
              timestamp: note.timestamp,
              note_text: note.note_text,
              images: note.images,
            });
          } catch (error) {
            console.error('Failed to sync quick note to server:', error);
          }
        }
      },

      addNote: async (noteData) => {
        const isAuthenticated = useAuthStore.getState().isAuthenticated;

        const note: Note = {
          ...noteData,
          id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          created_at: new Date().toISOString(),
        };

        // Add to local state immediately
        set((state) => ({ notes: [...state.notes, note] }));

        // If authenticated, sync to server
        if (isAuthenticated) {
          try {
            const savedNote = await saveNote({
              id: note.id,
              video_id: note.video_id,
              timestamp: note.timestamp,
              english: note.english,
              chinese: note.chinese,
              note_text: note.note_text,
              images: note.images,
            });

            // Update with server response (in case server modified the data)
            set((state) => ({
              notes: state.notes.map((n) =>
                n.id === note.id
                  ? { ...n, id: savedNote.id, created_at: savedNote.created_at }
                  : n
              ),
            }));
          } catch (error) {
            console.error('Failed to sync note to server:', error);
            // Note is still saved locally
          }
        }
      },

      removeNote: async (id) => {
        const isAuthenticated = useAuthStore.getState().isAuthenticated;

        // Remove from local state immediately
        set((state) => ({
          notes: state.notes.filter((n) => n.id !== id),
        }));

        // If authenticated, sync to server
        if (isAuthenticated) {
          try {
            await deleteNoteApi(id);
          } catch (error) {
            console.error('Failed to delete note from server:', error);
          }
        }
      },

      getNotesByVideo: (videoId) => {
        return get().notes.filter((n) => n.video_id === videoId);
      },

      clearNotes: () => {
        set({ notes: [] });
      },

      syncFromServer: async () => {
        const isAuthenticated = useAuthStore.getState().isAuthenticated;
        if (!isAuthenticated) return;

        set({ isLoading: true });

        try {
          const serverNotes = await getNotes();
          // Merge server notes with local notes, preferring server data
          const localNotes = get().notes;
          const serverNoteIds = new Set(serverNotes.map((n) => n.id));

          // Keep local notes that don't exist on server (offline additions)
          const offlineNotes = localNotes.filter((n) => !serverNoteIds.has(n.id));

          // Convert server notes to local Note type
          const mergedNotes: Note[] = [
            ...serverNotes.map((n) => ({
              id: n.id,
              video_id: n.video_id,
              timestamp: n.timestamp,
              english: n.english,
              chinese: n.chinese,
              note_text: n.note_text,
              images: n.images,
              created_at: n.created_at,
            })),
            ...offlineNotes,
          ];

          set({ notes: mergedNotes, isLoading: false });

          // Sync offline notes to server
          for (const note of offlineNotes) {
            try {
              await saveNote({
                id: note.id,
                video_id: note.video_id,
                timestamp: note.timestamp,
                english: note.english,
                chinese: note.chinese,
                note_text: note.note_text,
                images: note.images,
              });
            } catch (error) {
              console.error('Failed to sync offline note:', error);
            }
          }
        } catch (error) {
          console.error('Failed to sync notes from server:', error);
          set({ isLoading: false });
        }
      },
    }),
    {
      name: 'eng-learner-notes',
      partialize: (state) => ({ notes: state.notes }),
    }
  )
);
