import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  cancelReminder,
  initNotifications,
  scheduleReminder,
  type FiredReminder,
} from '@/lib/notifications';
import { messageForOccurrence, type ReminderCategory } from '@/lib/reminderMessages';
import {
  clampInterval,
  DEFAULT_SETTINGS,
  normalizeTime,
  planOccurrences,
  REMINDER_CATEGORIES,
  type ReminderSettings,
  type TimeOfDay,
} from '@/lib/reminderSchedule';
import { zustandStorage } from '@/lib/storage';
import usePersonaStore, { activePersonaId } from '@/store/personaStore';

/**
 * Reminder settings and the scheduling side effects that follow from them.
 *
 * Every mutator reschedules the affected category itself, so callers only ever
 * change settings — they never schedule or cancel notifications by hand. The
 * time math lives in `lib/reminderSchedule.ts`; the copy comes from the active
 * persona via `lib/reminderMessages.ts`; this module owns persistence and the
 * conversation with `lib/notifications.ts`.
 *
 * The dependency on `store/personaStore.ts` runs one way, from here to there.
 * Keep it that way — the persona store must not import this one, or the
 * subscription at the bottom of this file closes a cycle.
 */

export type {
  FocusSettings,
  HydrationSettings,
  ReminderSettings,
  SleepSettings,
  TimeOfDay,
} from '@/lib/reminderSchedule';
export { DEFAULT_SETTINGS, planOccurrences } from '@/lib/reminderSchedule';
export type { ReminderCategory };

export type ReminderStore = ReminderSettings & {
  /**
   * Notification ids currently scheduled per category. Persisted so a relaunch
   * cancels the previous batch instead of stacking a duplicate one on top.
   */
  scheduledIds: Record<ReminderCategory, string[]>;
  /** When each category was last planned, as a Unix timestamp in ms. */
  lastScheduledAt: Record<ReminderCategory, number | null>;

  /**
   * Whether the user has opted into supervise mode. Persisted, and deliberately
   * independent of the three reminder categories — it changes how Mothrly
   * follows up on a nudge, not when nudges fire, so toggling it schedules
   * nothing.
   */
  superviseMode: boolean;
  /** Turns supervise mode on or off. */
  setSuperviseMode: (enabled: boolean) => void;

  /**
   * The most recent reminder known to have been delivered, or `null` before any
   * has fired. Best-effort — see `addReminderDeliveryListener` — and persisted
   * so the Home screen can still show it after a relaunch.
   */
  lastFired: FiredReminder | null;
  /** Records a delivered reminder. Ignores anything older than what we have. */
  recordFired: (fired: FiredReminder) => void;

  /** Whether first-launch setup has already run. Persisted. */
  hasCompletedSetup: boolean;
  /**
   * First-launch setup: asks for notification permission, then plans the seeded
   * default schedules.
   *
   * Idempotent and safe to call from a mount effect on every render pass — it
   * returns the in-flight promise if setup is already running, and returns
   * immediately once it has completed.
   */
  completeSetup: () => Promise<void>;

  /** Turns a category on or off, then schedules or clears its notifications. */
  setEnabled: (category: ReminderCategory, enabled: boolean) => void;
  /** Minutes between hydration nudges. Clamped to 5–1440. */
  setHydrationInterval: (minutes: number) => void;
  /** Time of the daily bedtime reminder. */
  setBedtime: (time: TimeOfDay) => void;
  /** Minutes between focus nudges. Clamped to 5–1440. */
  setFocusInterval: (minutes: number) => void;
  /** The work session focus nudges fire within. */
  setFocusSession: (sessionStart: TimeOfDay, sessionEnd: TimeOfDay) => void;

  /**
   * Re-plans every enabled category. Call on app launch — a scheduled batch
   * only covers a rolling horizon and drains as its notifications fire.
   */
  refreshAll: () => Promise<void>;
  /** Restores the seeded defaults and reschedules everything. */
  resetToDefaults: () => void;
};

/**
 * Kicks off scheduling work from a synchronous action.
 *
 * {@link reschedule} is already best-effort internally; this is the
 * belt-and-braces guard so an unexpected rejection surfaces as a warning rather
 * than an unhandled promise rejection.
 */
function fireAndForget(work: Promise<unknown>): void {
  work.catch((error: unknown) => {
    console.warn('[reminders] Rescheduling failed', error);
  });
}

/**
 * Bumped on every reschedule. An in-flight reschedule whose generation has gone
 * stale cancels its own work instead of storing it, so rapid setting changes
 * can't leave orphaned notifications behind.
 */
const generations: Record<ReminderCategory, number> = {
  hydration: 0,
  sleep: 0,
  focus: 0,
};

/**
 * In-flight first-launch setup, if any. Module-level rather than store state so
 * concurrent callers share one permission prompt instead of racing to open two.
 */
let setupPromise: Promise<void> | null = null;

const useReminderStore = create<ReminderStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_SETTINGS,
      scheduledIds: { hydration: [], sleep: [], focus: [] },
      lastScheduledAt: { hydration: null, sleep: null, focus: null },
      superviseMode: false,
      lastFired: null,
      hasCompletedSetup: false,

      setSuperviseMode: (enabled) => {
        if (get().superviseMode === enabled) return;
        set({ superviseMode: enabled });
      },

      recordFired: (fired) => {
        // The same notification reaches us twice when the user taps one that
        // arrived in the foreground. Both carry the same delivery date, so
        // rejecting anything not strictly newer de-duplicates it.
        const current = get().lastFired;
        if (current && current.firedAt >= fired.firedAt) return;
        set({ lastFired: fired });
      },

      completeSetup: () => {
        if (get().hasCompletedSetup) return Promise.resolve();

        setupPromise ??= (async () => {
          // Prompts on first launch only; the OS short-circuits it afterwards.
          // Neither call rejects, so there is no failure path to cache here.
          await initNotifications();
          await get().refreshAll();
          set({ hasCompletedSetup: true });
        })();

        return setupPromise;
      },

      setEnabled: (category, enabled) => {
        if (get()[category].enabled === enabled) return;
        set((state) => ({ [category]: { ...state[category], enabled } }) as Partial<ReminderStore>);
        fireAndForget(reschedule(category));
      },

      setHydrationInterval: (minutes) => {
        const intervalMinutes = clampInterval(minutes);
        if (get().hydration.intervalMinutes === intervalMinutes) return;
        set((state) => ({ hydration: { ...state.hydration, intervalMinutes } }));
        fireAndForget(reschedule('hydration'));
      },

      setBedtime: (time) => {
        const next = normalizeTime(time);
        const current = get().sleep.time;
        if (current.hour === next.hour && current.minute === next.minute) return;
        set((state) => ({ sleep: { ...state.sleep, time: next } }));
        fireAndForget(reschedule('sleep'));
      },

      setFocusInterval: (minutes) => {
        const intervalMinutes = clampInterval(minutes);
        if (get().focus.intervalMinutes === intervalMinutes) return;
        set((state) => ({ focus: { ...state.focus, intervalMinutes } }));
        fireAndForget(reschedule('focus'));
      },

      setFocusSession: (sessionStart, sessionEnd) => {
        const start = normalizeTime(sessionStart);
        const end = normalizeTime(sessionEnd);
        const current = get().focus;
        if (
          current.sessionStart.hour === start.hour &&
          current.sessionStart.minute === start.minute &&
          current.sessionEnd.hour === end.hour &&
          current.sessionEnd.minute === end.minute
        ) {
          return;
        }
        set((state) => ({ focus: { ...state.focus, sessionStart: start, sessionEnd: end } }));
        fireAndForget(reschedule('focus'));
      },

      refreshAll: async () => {
        await Promise.all(REMINDER_CATEGORIES.map((category) => reschedule(category)));
      },

      resetToDefaults: () => {
        set({ ...DEFAULT_SETTINGS });
        fireAndForget(get().refreshAll());
      },
    }),
    {
      name: 'mothrly.reminders',
      storage: createJSONStorage(() => zustandStorage),
      version: 1,
      // Only the settings and the ids we may need to clean up are persisted.
      partialize: (state) => ({
        hydration: state.hydration,
        sleep: state.sleep,
        focus: state.focus,
        scheduledIds: state.scheduledIds,
        superviseMode: state.superviseMode,
        lastFired: state.lastFired,
        hasCompletedSetup: state.hasCompletedSetup,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.warn('[reminders] Failed to rehydrate reminder settings', error);
        }
        if (!state) return;
        // Deferred so rehydration has fully settled before scheduling reads the
        // store, and so a slow permission prompt never blocks app startup.
        setTimeout(() => {
          fireAndForget(useReminderStore.getState().refreshAll());
        }, 0);
      },
    },
  ),
);

/* -------------------------------------------------------------------------- */
/* Rescheduling                                                               */
/* -------------------------------------------------------------------------- */

/** Cancels a batch of notification ids, ignoring any the OS no longer knows. */
async function cancelAll(ids: readonly string[]): Promise<void> {
  await Promise.all(ids.map((id) => cancelReminder(id)));
}

/**
 * Cancels the category's outstanding notifications and, when it is enabled,
 * schedules a fresh batch across the horizon.
 *
 * Never throws: the notification helpers it builds on are best-effort, so a
 * failed schedule just leaves the category with a short batch that the next
 * refresh retries.
 */
async function reschedule(category: ReminderCategory): Promise<void> {
  generations[category] += 1;
  const generation = generations[category];

  const settings = useReminderStore.getState();
  const previousIds = settings.scheduledIds[category];

  // Clear the ids up front so a concurrent reschedule can't cancel them twice.
  useReminderStore.setState((state) => ({
    scheduledIds: { ...state.scheduledIds, [category]: [] },
  }));
  await cancelAll(previousIds);

  if (!settings[category].enabled) {
    useReminderStore.setState((state) => ({
      lastScheduledAt: { ...state.lastScheduledAt, [category]: Date.now() },
    }));
    return;
  }

  // Read once per batch so every notification in it speaks with one voice, even
  // if the user switches persona midway through the await below. The switch
  // triggers its own reschedule, which supersedes this batch via `generations`.
  const personaId = activePersonaId();

  const occurrences = planOccurrences(category, settings);
  const results = await Promise.all(
    occurrences.map((at, index) =>
      scheduleReminder(category, messageForOccurrence(category, index, personaId), at, personaId),
    ),
  );
  const ids = results.filter((id): id is string => id !== null);

  // A newer reschedule started while we were awaiting — this batch is obsolete.
  if (generations[category] !== generation) {
    await cancelAll(ids);
    return;
  }

  useReminderStore.setState((state) => ({
    scheduledIds: { ...state.scheduledIds, [category]: ids },
    lastScheduledAt: { ...state.lastScheduledAt, [category]: Date.now() },
  }));
}

/**
 * Re-plans every enabled category. Safe to call from a root layout effect on
 * every launch, and the intended way to keep recurring reminders topped up.
 */
export function refreshAllReminders(): Promise<void> {
  return useReminderStore.getState().refreshAll();
}

/* -------------------------------------------------------------------------- */
/* Persona changes                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Re-plans every category when the user switches persona.
 *
 * Copy is baked into a notification at schedule time, so the batch already handed
 * to the OS still speaks in the old persona's voice. Without this, a switch would
 * only take effect as the pending batch drained — up to a day of the previous
 * persona still talking.
 *
 * Registered at module scope rather than from a screen so it holds regardless of
 * where the switch happens. Skipped before first-launch setup, since
 * `completeSetup` schedules the first batch itself and scheduling early would
 * bring the permission prompt forward.
 */
usePersonaStore.subscribe((state, previous) => {
  if (state.personaId === previous.personaId) return;
  if (!useReminderStore.getState().hasCompletedSetup) return;

  console.log(`[reminders] Persona changed to "${state.personaId}" — rescheduling copy.`);
  fireAndForget(useReminderStore.getState().refreshAll());
});

export default useReminderStore;
