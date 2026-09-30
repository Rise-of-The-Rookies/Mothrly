import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { zustandStorage } from '@/lib/storage';

export type Mood = 'great' | 'good' | 'okay' | 'bad' | 'terrible';

export type StatsStore = {
  /** Record of YYYY-MM-DD -> Mood */
  moodHistory: Record<string, Mood>;
  /** Record of YYYY-MM-DD -> Image URI */
  moodImages: Record<string, string>;
  /** Total number of reminders acknowledged all time */
  totalAcknowledged: number;
  /** Current daily streak */
  currentStreak: number;
  /** Last date a reminder was acknowledged or mood logged (YYYY-MM-DD) */
  lastActiveDate: string | null;

  /** Log a mood for today */
  logMood: (mood: Mood) => void;
  /** Log a custom image/gif for today's mood */
  logMoodImage: (uri: string) => void;
  /** Acknowledge a reminder, updating streak if applicable */
  acknowledgeReminder: () => void;
  /** Get today's mood, if logged */
  getTodayMood: () => Mood | null;
  /** Get today's mood image, if logged */
  getTodayMoodImage: () => string | null;
  /** Helper to check and break streak if missed a day */
  checkStreak: () => void;
};

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export const useStatsStore = create<StatsStore>()(
  persist(
    (set, get) => ({
      moodHistory: {},
      moodImages: {},
      totalAcknowledged: 0,
      currentStreak: 0,
      lastActiveDate: null,

      logMood: (mood) => {
        const today = getTodayStr();
        const { lastActiveDate, currentStreak } = get();
        
        let newStreak = currentStreak;
        if (lastActiveDate !== today) {
          // If last active was yesterday, increment streak. If older, reset to 1.
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
          
          if (lastActiveDate === yesterdayStr) {
            newStreak += 1;
          } else {
            newStreak = 1;
          }
        } else if (currentStreak === 0) {
            newStreak = 1;
        }

        set((state) => ({
          moodHistory: { ...state.moodHistory, [today]: mood },
          lastActiveDate: today,
          currentStreak: newStreak,
        }));
      },

      logMoodImage: (uri) => {
        const today = getTodayStr();
        const { lastActiveDate, currentStreak } = get();
        
        let newStreak = currentStreak;
        if (lastActiveDate !== today) {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
          
          if (lastActiveDate === yesterdayStr) {
            newStreak += 1;
          } else {
            newStreak = 1;
          }
        } else if (currentStreak === 0) {
            newStreak = 1;
        }

        set((state) => ({
          moodImages: { ...state.moodImages, [today]: uri },
          lastActiveDate: today,
          currentStreak: newStreak,
        }));
      },

      acknowledgeReminder: () => {
        const today = getTodayStr();
        const { lastActiveDate, currentStreak } = get();
        
        let newStreak = currentStreak;
        if (lastActiveDate !== today) {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
          
          if (lastActiveDate === yesterdayStr) {
            newStreak += 1;
          } else {
            newStreak = 1;
          }
        } else if (currentStreak === 0) {
            newStreak = 1;
        }

        set((state) => ({
          totalAcknowledged: state.totalAcknowledged + 1,
          lastActiveDate: today,
          currentStreak: newStreak,
        }));
      },

      getTodayMood: () => {
        const today = getTodayStr();
        return get().moodHistory[today] || null;
      },

      getTodayMoodImage: () => {
        const today = getTodayStr();
        return get().moodImages[today] || null;
      },

      checkStreak: () => {
        const { lastActiveDate, currentStreak } = get();
        if (!lastActiveDate || currentStreak === 0) return;

        const today = getTodayStr();
        if (lastActiveDate === today) return;

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
        
        if (lastActiveDate !== yesterdayStr) {
          // Streak broken
          set({ currentStreak: 0 });
        }
      },
    }),
    {
      name: 'mothrly-stats-v1',
      storage: zustandStorage,
    },
  ),
);

export default useStatsStore;
