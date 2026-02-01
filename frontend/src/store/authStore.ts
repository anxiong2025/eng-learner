import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const API_URL = import.meta.env.VITE_API_URL || '';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  provider: 'google' | 'github' | 'email';
  tier: 'free' | 'pro';
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string) => Promise<void>;
  logout: () => void;
  fetchUser: () => Promise<void>;
  getToken: () => string | null;
  isProUser: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (token: string) => {
        set({ token, isLoading: true });

        try {
          const response = await fetch(`${API_URL}/api/auth/me`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (response.ok) {
            const userData = await response.json();
            set({
              user: {
                id: userData.id,
                name: userData.name,
                email: userData.email,
                avatar: userData.avatar,
                provider: userData.provider as 'google' | 'github' | 'email',
                tier: (userData.tier || 'free') as 'free' | 'pro',
              },
              isAuthenticated: true,
              isLoading: false,
            });
          } else {
            // Token is invalid
            set({ token: null, user: null, isAuthenticated: false, isLoading: false });
          }
        } catch (error) {
          console.error('Failed to fetch user:', error);
          set({ token: null, user: null, isAuthenticated: false, isLoading: false });
        }
      },

      logout: () => {
        set({ user: null, token: null, isAuthenticated: false });
      },

      fetchUser: async () => {
        const { token } = get();
        if (!token) return;

        set({ isLoading: true });

        try {
          const response = await fetch(`${API_URL}/api/auth/me`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (response.ok) {
            const userData = await response.json();
            set({
              user: {
                id: userData.id,
                name: userData.name,
                email: userData.email,
                avatar: userData.avatar,
                provider: userData.provider as 'google' | 'github' | 'email',
                tier: (userData.tier || 'free') as 'free' | 'pro',
              },
              isAuthenticated: true,
              isLoading: false,
            });
          } else {
            // Token expired or invalid
            set({ token: null, user: null, isAuthenticated: false, isLoading: false });
          }
        } catch (error) {
          console.error('Failed to fetch user:', error);
          set({ isLoading: false });
        }
      },

      getToken: () => get().token,

      isProUser: () => get().user?.tier === 'pro',
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
