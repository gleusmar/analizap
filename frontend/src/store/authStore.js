import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      avatar: null,
      isAuthenticated: false,

      login: (token, user) => {
        set({ user, token, avatar: user.avatar, isAuthenticated: true });
      },

      logout: () => {
        set({ user: null, token: null, avatar: null, isAuthenticated: false });
      },

      setUser: (user) => {
        set({ user, avatar: user.avatar });
      }
    }),
    {
      name: 'auth-storage'
    }
  )
);
