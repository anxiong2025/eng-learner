import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Note } from '../types';

interface NoteState {
  notes: Note[];
  addNote: (note: Omit<Note, 'id' | 'created_at'>) => void;
  removeNote: (id: string) => void;
  getNotesByVideo: (videoId: string) => Note[];
  clearNotes: () => void;
}

export const useNoteStore = create<NoteState>()(
  persist(
    (set, get) => ({
      notes: [],

      addNote: (noteData) => {
        const note: Note = {
          ...noteData,
          id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          created_at: new Date().toISOString(),
        };
        set((state) => ({ notes: [...state.notes, note] }));
      },

      removeNote: (id) => {
        set((state) => ({
          notes: state.notes.filter((n) => n.id !== id),
        }));
      },

      getNotesByVideo: (videoId) => {
        return get().notes.filter((n) => n.video_id === videoId);
      },

      clearNotes: () => {
        set({ notes: [] });
      },
    }),
    {
      name: 'eng-learner-notes',
    }
  )
);
