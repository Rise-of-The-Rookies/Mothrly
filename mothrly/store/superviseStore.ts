import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { zustandStorage } from '@/lib/storage';

/**
 * The apps Mothrly supervises, and how long each has been used today.
 *
 * The store owns the list, the per-app minute counters, the daily rollover that
 * zeroes them, and the log of which apps have already been nudged about today.
 * Nothing here talks to a usage API itself: `lib/useUsageSync.ts` reads Android's
 * numbers in and `lib/superviseNudge.ts` decides what to say about them.
 *
 * No real brand assets are used anywhere: each app carries an initial and a
 * palette colour, and the UI draws its own tile from those.
 */

/**
 * Whether Mothrly is actually watching an app.
 *
 * `live` means the app is supervised; `preview` means the row is listed but not
 * yet tracking, because platform support is still missing.
 */
export type SuperviseStatus = 'live' | 'preview';

export type SupervisedApp = {
  /** Stable key. Also the key into {@link SuperviseStore.minutesToday}. */
  id: string;
  /** Display name. */
  name: string;
  /** Single character drawn on the app tile in place of a logo. */
  initial: string;
  /** Tile background colour. */
  color: string;
  status: SuperviseStatus;
  /**
   * Minutes of use in a day before Mothrly nudges about this app.
   *
   * Also the step the nudges escalate on: each whole multiple of this gets its own
   * nudge, so a 15-minute threshold is spoken to at 15, 30 and 45 minutes. See
   * `lib/superviseNudge.ts`.
   */
  thresholdMinutes: number;
  /**
   * Android package names this app ships under, for matching against
   * `UsageStatsManager` data. More than one where a single app is published under
   * different ids per region; their times are summed.
   *
   * Empty means no real tracking for this app — its row keeps whatever the demo or
   * the seed left there. There is no iOS equivalent: `UsageStatsManager` is
   * Android-only, so iOS runs on demo mode alone.
   */
  androidPackages: readonly string[];
};

/** The apps a fresh install supervises. */
export const DEFAULT_APPS: readonly SupervisedApp[] = [
  {
    id: 'instagram',
    name: 'Instagram',
    initial: 'I',
    color: '#C2477A',
    status: 'live',
    thresholdMinutes: 15,
    androidPackages: ['com.instagram.android'],
  },
  {
    id: 'youtube',
    name: 'YouTube',
    initial: 'Y',
    color: '#C43D2E',
    status: 'live',
    thresholdMinutes: 45,
    androidPackages: ['com.google.android.youtube'],
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    initial: 'T',
    color: '#2E3A45',
    status: 'live',
    thresholdMinutes: 20,
    // Published under two ids depending on the region the device installed from.
    androidPackages: ['com.zhiliaoapp.musically', 'com.ss.android.ugc.trill'],
  },
  {
    id: 'x',
    name: 'X',
    initial: 'X',
    color: '#5A6470',
    status: 'preview',
    thresholdMinutes: 20,
    // Left untracked on purpose: this row stays a preview of the feature.
    androidPackages: [],
  },
];

/**
 * Whether the tracked minutes are measured or made up.
 *
 * `usage-stats` only ever comes from Android's `UsageStatsManager`; demo mode and
 * the seeded values both leave it at `seed`.
 */
export type MinutesSource = 'seed' | 'usage-stats';

/**
 * Seeded counters, so the list reads as populated before tracking exists.
 * Replaced by real numbers the first time a day rolls over.
 */
const DEFAULT_MINUTES: Record<string, number> = {
  instagram: 72,
  youtube: 41,
  tiktok: 18,
  x: 0,
};

/* -------------------------------------------------------------------------- */
/* Nudges                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * What caused a nudge. Recorded for logging only — nothing in the UI branches on
 * it, so a demo nudge is indistinguishable on screen from a detected one.
 */
export type SuperviseNudgeSource = 'detection' | 'demo';

/**
 * A supervise-mode nudge the user has not dealt with yet.
 *
 * A snapshot rather than a reference to the app: the alert should keep showing
 * the minute count that triggered it even as tracking carries on underneath.
 */
export type SuperviseNudge = {
  appId: string;
  appName: string;
  /** Tile initial and colour, copied so the alert matches the list row. */
  initial: string;
  color: string;
  /** Minutes used when the threshold was crossed. */
  minutes: number;
  /** The threshold that was crossed. */
  thresholdMinutes: number;
  /** Body copy, the same line the notification carries. */
  message: string;
  /** When it was raised, as a Unix timestamp in ms. */
  triggeredAt: number;
  source: SuperviseNudgeSource;
};

/**
 * How long an unattended nudge stays worth showing.
 *
 * `activeNudge` is persisted so a nudge raised while the app was backgrounded —
 * the normal case, since detection happens while the user is in the other app —
 * is still there when they open Mothrly. Past this window it is stale, and the
 * alert would be about a session that ended long ago.
 */
export const NUDGE_FRESHNESS_MS = 30 * 60_000;

/** Whether a nudge is recent enough to show. */
export function isNudgeFresh(nudge: SuperviseNudge, now: number = Date.now()): boolean {
  const age = now - nudge.triggeredAt;
  // `age >= 0` guards against a clock change leaving the nudge in the future.
  return age >= 0 && age <= NUDGE_FRESHNESS_MS;
}

/* -------------------------------------------------------------------------- */
/* Demo mode                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A canned detection event, for triggering the nudge flow on demand.
 *
 * Exists because real detection can't be summoned to order, and a screen
 * recording can't wait around for it. Each scenario is fed through the same
 * `triggerSuperviseNudge` a real detection event uses, so what gets recorded is
 * the genuine flow with a scripted input.
 */
export type SuperviseDemoScenario = {
  /** Stable key for lists. */
  id: string;
  /** Which supervised app to report. */
  appId: string;
  /** Minutes to report. Above the app's threshold, or nothing would fire. */
  minutes: number;
  /** Menu copy, e.g. `TikTok — 32 min`. */
  label: string;
};

/** The presets offered by the hidden demo menu, in display order. */
export const DEMO_SCENARIOS: readonly SuperviseDemoScenario[] = [
  { id: 'tiktok-32', appId: 'tiktok', minutes: 32, label: 'TikTok — 32 min' },
  { id: 'youtube-55', appId: 'youtube', minutes: 55, label: 'YouTube — 55 min' },
  { id: 'instagram-20', appId: 'instagram', minutes: 20, label: 'Instagram — 20 min' },
];

/* -------------------------------------------------------------------------- */

export type SuperviseStore = {
  /** Supervised apps, in display order. */
  apps: SupervisedApp[];
  /** Minutes used today per app id. Apps missing from the map count as 0. */
  minutesToday: Record<string, number>;
  /** The local calendar day `minutesToday` describes, as `YYYY-MM-DD`. */
  trackedOn: string;

  /**
   * Where the numbers in `minutesToday` came from. `seed` until real usage data
   * has been read at least once today; the Supervise screen labels the two
   * differently so a demo is never mistaken for measurement.
   */
  minutesSource: MinutesSource;
  /** When usage data was last read successfully, as a Unix timestamp in ms. */
  usageSyncedAt: number | null;
  /**
   * Replaces today's counters with real per-app usage.
   *
   * @param minutesByPackage Minutes per Android package name, as returned by
   *                         `readUsageMinutesToday`. A tracked app missing from the
   *                         map is recorded as zero — the device reporting nothing
   *                         for it is real data, not missing data.
   */
  applyUsageMinutes: (minutesByPackage: Record<string, number>) => void;

  /**
   * The nudge currently being shown, or `null` when there is nothing to answer.
   *
   * Written only by `triggerSuperviseNudge` — raise nudges through that, never by
   * calling {@link SuperviseStore.raiseNudge} directly, or the notification half
   * of the flow is skipped.
   */
  activeNudge: SuperviseNudge | null;
  /** Stores a nudge, replacing any it supersedes. */
  raiseNudge: (nudge: SuperviseNudge) => void;
  /** Clears the current nudge once the user has answered it. */
  dismissNudge: () => void;

  /**
   * The highest escalation level already nudged about, per app id, and the local
   * day that level belongs to.
   *
   * A level is how many whole multiples of its threshold an app has been used for:
   * level 1 at 15 minutes on a 15-minute threshold, level 2 at 30, and so on. This
   * is what paces detection. Usage is re-read every time Mothrly comes back to the
   * foreground, so an app over its threshold stays over it for the rest of the
   * day; recording the level means each new multiple gets one nudge and no
   * multiple gets two.
   *
   * The day is stored alongside the level rather than relied on being cleared, so
   * a rollover that has not run yet cannot make yesterday's level silence today.
   *
   * Persisted, because the point is to survive the app being killed and reopened.
   */
  nudgeLevels: Record<string, { day: string; level: number }>;
  /**
   * The highest level nudged about for this app today, or 0 if none — including
   * when the stored level belongs to an earlier day.
   */
  lastNudgedLevel: (appId: string) => number;
  /**
   * Records the level a nudge just went out for. Ignored if it is not higher than
   * what today has already reported, so a level can never move backwards.
   */
  markNudgedLevel: (appId: string, level: number) => void;

  /**
   * Zeroes today's counters when the local date has moved on.
   *
   * Cheap and idempotent: call it from a mount effect, and again whenever the
   * app returns to the foreground, since a session can outlive midnight.
   */
  rollOverIfNeeded: () => void;

  /** Adds usage to an app's counter for today. Rolls the day over first. */
  addMinutes: (appId: string, minutes: number) => void;
  /** Overwrites an app's counter for today. Rolls the day over first. */
  setMinutes: (appId: string, minutes: number) => void;

  /**
   * Appends an app to the list. Ignored if the id is already supervised, so it
   * is safe to call from a retryable flow.
   */
  addApp: (app: SupervisedApp) => void;
  /** Stops supervising an app and drops its counter. */
  removeApp: (appId: string) => void;

  /** Restores the seeded list and counters. */
  resetToDefaults: () => void;
};

/**
 * Today's date in the device's own timezone as `YYYY-MM-DD`.
 *
 * Built from the local getters rather than `toISOString`, which would convert to
 * UTC and roll the day over at the wrong moment for most of the world.
 */
function localDayKey(at: Date = new Date()): string {
  const month = String(at.getMonth() + 1).padStart(2, '0');
  const day = String(at.getDate()).padStart(2, '0');
  return `${at.getFullYear()}-${month}-${day}`;
}

/** Drops negatives and fractions of a minute from a counter update. */
function sanitizeMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return 0;
  return Math.max(0, Math.round(minutes));
}

const useSuperviseStore = create<SuperviseStore>()(
  persist(
    (set, get) => ({
      apps: [...DEFAULT_APPS],
      minutesToday: { ...DEFAULT_MINUTES },
      trackedOn: localDayKey(),
      minutesSource: 'seed',
      usageSyncedAt: null,
      activeNudge: null,
      nudgeLevels: {},

      applyUsageMinutes: (minutesByPackage) => {
        get().rollOverIfNeeded();

        const next: Record<string, number> = { ...get().minutesToday };

        for (const app of get().apps) {
          // Untracked apps (no packages) keep whatever they had, so an X row or a
          // demo-set value survives a sync.
          if (app.androidPackages.length === 0) continue;

          const total = app.androidPackages.reduce(
            (sum, packageName) => sum + sanitizeMinutes(minutesByPackage[packageName] ?? 0),
            0,
          );
          next[app.id] = total;
        }

        set({ minutesToday: next, minutesSource: 'usage-stats', usageSyncedAt: Date.now() });
      },

      raiseNudge: (nudge) => {
        set({ activeNudge: nudge });
      },

      dismissNudge: () => {
        if (!get().activeNudge) return;
        set({ activeNudge: null });
      },

      lastNudgedLevel: (appId) => {
        const entry = get().nudgeLevels[appId];
        // A level from an earlier day has nothing to say about today's usage.
        if (!entry || entry.day !== localDayKey()) return 0;
        return entry.level;
      },

      markNudgedLevel: (appId, level) => {
        const next = Number.isFinite(level) ? Math.max(0, Math.floor(level)) : 0;
        if (next <= get().lastNudgedLevel(appId)) return;
        set((state) => ({
          nudgeLevels: { ...state.nudgeLevels, [appId]: { day: localDayKey(), level: next } },
        }));
      },

      rollOverIfNeeded: () => {
        const today = localDayKey();
        if (get().trackedOn === today) return;
        // Yesterday's numbers say nothing about today, measured or not, so the
        // source resets with them and the next sync re-establishes it. Clearing
        // `nudgeLevels` is housekeeping rather than correctness — `lastNudgedLevel`
        // already checks the day — but it keeps stale entries out of storage.
        set({ trackedOn: today, minutesToday: {}, minutesSource: 'seed', nudgeLevels: {} });
      },

      addMinutes: (appId, minutes) => {
        get().rollOverIfNeeded();
        const delta = sanitizeMinutes(minutes);
        if (delta === 0) return;
        set((state) => ({
          minutesToday: {
            ...state.minutesToday,
            [appId]: (state.minutesToday[appId] ?? 0) + delta,
          },
        }));
      },

      setMinutes: (appId, minutes) => {
        get().rollOverIfNeeded();
        const next = sanitizeMinutes(minutes);
        if ((get().minutesToday[appId] ?? 0) === next) return;
        set((state) => ({
          minutesToday: { ...state.minutesToday, [appId]: next },
        }));
      },

      addApp: (app) => {
        if (get().apps.some((existing) => existing.id === app.id)) return;
        set((state) => ({ apps: [...state.apps, app] }));
      },

      removeApp: (appId) => {
        if (!get().apps.some((existing) => existing.id === appId)) return;
        set((state) => {
          const { [appId]: _removed, ...rest } = state.minutesToday;
          return {
            apps: state.apps.filter((existing) => existing.id !== appId),
            minutesToday: rest,
          };
        });
      },

      resetToDefaults: () => {
        set({
          apps: [...DEFAULT_APPS],
          minutesToday: { ...DEFAULT_MINUTES },
          trackedOn: localDayKey(),
          minutesSource: 'seed',
          usageSyncedAt: null,
          activeNudge: null,
          nudgeLevels: {},
        });
      },
    }),
    {
      name: 'mothrly.supervise',
      storage: createJSONStorage(() => zustandStorage),
      version: 5,
      // v1 apps predate `thresholdMinutes`, v2 predates `androidPackages`. The list
      // is seeded content rather than user data at this point, so re-seeding it is
      // cheaper and safer than patching each entry; the counters are kept.
      //
      // v3 predates the nudge log and v4 recorded only a day per app rather than a
      // level. Both start the log empty: the cost is at most one repeat nudge on the
      // day of the upgrade, against the risk of reading a level that isn't there.
      migrate: (persisted, version) => {
        const base = persisted as Partial<SuperviseStore>;

        if (version >= 3) {
          return { ...base, nudgeLevels: {} } as SuperviseStore;
        }

        return {
          ...base,
          apps: [...DEFAULT_APPS],
          minutesSource: 'seed',
          usageSyncedAt: null,
          activeNudge: null,
          nudgeLevels: {},
        } as SuperviseStore;
      },
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.warn('[supervise] Failed to rehydrate supervised apps', error);
          return;
        }
        if (!state) return;
        // A relaunch is the most likely moment for the stored day to be stale.
        state.rollOverIfNeeded();
        // Drop a nudge the user has already outlasted, so reopening the app days
        // later doesn't greet them with an alert about an old session.
        if (state.activeNudge && !isNudgeFresh(state.activeNudge)) {
          state.dismissNudge();
        }
      },
    },
  ),
);

/**
 * Formats a minute count for display: `0m`, `18m`, `1h 12m`.
 *
 * Hours are only shown once they exist, and the minute part is kept even at zero
 * minutes past the hour so the unit is never ambiguous.
 */
export function formatMinutes(minutes: number): string {
  const total = sanitizeMinutes(minutes);
  const hours = Math.floor(total / 60);
  const remainder = total % 60;
  return hours > 0 ? `${hours}h ${remainder}m` : `${remainder}m`;
}

export default useSuperviseStore;
