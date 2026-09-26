import { Platform } from 'react-native';

/**
 * Real per-app usage time, read from Android's `UsageStatsManager`.
 *
 * Android only, and additive: every function here reports "unavailable" rather
 * than throwing, so iOS, Expo Go, and any build where the native module failed to
 * link all fall back to the seeded/demo numbers untouched.
 *
 * Built on `expo-android-usagestats`, a third-party Expo module. It is loaded with
 * `require` inside a `try` for the same reason `lib/storage.ts` loads MMKV that
 * way: a module whose native side is missing throws while being evaluated, and a
 * static import would take the whole app down at startup.
 *
 * Permission model worth knowing: `PACKAGE_USAGE_STATS` is a protected permission.
 * There is no runtime prompt to accept — the user has to switch the app on under
 * Settings → Special app access → Usage access, which is why this is fronted by an
 * explanation screen (`app/usage-access.tsx`) rather than a permission dialog.
 */

/** Minimal shape of the parts of `expo-android-usagestats` we use. */
type UsageStatsModule = {
  hasUsageStatsPermission: () => Promise<boolean>;
  requestUsageStatsPermission: () => Promise<null>;
  getUsageStats: (startTime: number, endTime: number) => Promise<UsageStatsEntry[]>;
  getUsageEvents: (startTime: number, endTime: number) => Promise<UsageEventEntry[]>;
};

/** One app's aggregated usage, as returned by `queryUsageStats`. */
type UsageStatsEntry = {
  packageName: string;
  /** Foreground time in milliseconds, across the queried buckets. */
  totalTimeInForeground: number;
};

/** One foreground transition, as returned by `queryEvents`. */
type UsageEventEntry = {
  packageName: string;
  timeStamp: number;
  eventType: number;
};

/**
 * `UsageEvents.Event` constants we care about. Matched numerically because the
 * names the module attaches differ between Android versions
 * (`MOVE_TO_FOREGROUND` and `ACTIVITY_RESUMED` are both 1).
 */
const EVENT_RESUMED = 1;
const EVENT_PAUSED = 2;

function tryLoadModule(): UsageStatsModule | null {
  // The module has no iOS implementation, so don't even try off Android.
  if (Platform.OS !== 'android') return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded = require('expo-android-usagestats') as Partial<UsageStatsModule>;

    // Guard each function individually: a version mismatch is more likely to
    // drop a function than to fail the import outright.
    if (
      typeof loaded.hasUsageStatsPermission !== 'function' ||
      typeof loaded.requestUsageStatsPermission !== 'function' ||
      typeof loaded.getUsageStats !== 'function' ||
      typeof loaded.getUsageEvents !== 'function'
    ) {
      console.warn('[usage] expo-android-usagestats loaded but is missing expected functions');
      return null;
    }

    return loaded as UsageStatsModule;
  } catch {
    console.log(
      '[usage] Native usage-stats module unavailable (needs a development ' +
        'build). Falling back to seeded values.',
    );
    return null;
  }
}

const usageStats = tryLoadModule();

/**
 * Whether real usage tracking can work on this device at all.
 *
 * False on iOS, in Expo Go, and in any build where the native module is missing.
 * Check this before showing any tracking UI — there is nothing the user can do
 * about a missing module, so they should not be asked.
 */
export function isUsageTrackingSupported(): boolean {
  return usageStats !== null;
}

/**
 * Whether the user has granted Usage access.
 *
 * Note the underlying check is a heuristic: the module infers the grant by
 * querying stats and seeing whether anything came back, so a device that has
 * genuinely recorded nothing reads as denied. {@link readUsageMinutesToday}
 * therefore attempts its query regardless and treats returned data as proof.
 */
export async function hasUsageAccess(): Promise<boolean> {
  if (!usageStats) return false;

  try {
    return await usageStats.hasUsageStatsPermission();
  } catch (error) {
    console.warn('[usage] Permission check failed', error);
    return false;
  }
}

/**
 * Opens Settings → Special app access → Usage access.
 *
 * Resolves as soon as the screen has been asked for, not when the user comes
 * back; callers re-check {@link hasUsageAccess} when the app next becomes active.
 *
 * @returns whether the settings screen was opened.
 */
export async function openUsageAccessSettings(): Promise<boolean> {
  if (!usageStats) return false;

  try {
    await usageStats.requestUsageStatsPermission();
    return true;
  } catch (error) {
    console.warn('[usage] Could not open the Usage access settings screen', error);
    return false;
  }
}

/** Midnight this morning in the device's own timezone. */
function startOfToday(now: Date = new Date()): number {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  return midnight.getTime();
}

/**
 * Sums foreground time per package from raw resume/pause events.
 *
 * Preferred over the aggregated buckets because `queryUsageStats` returns whole
 * daily buckets that can start before the range asked for, which would count
 * yesterday evening as today. Events are exact to the transition.
 *
 * A package still in the foreground has no closing event, so its open interval is
 * closed at `until`.
 */
function sumForegroundMs(
  events: readonly UsageEventEntry[],
  since: number,
  until: number,
): Map<string, number> {
  const totals = new Map<string, number>();
  const openedAt = new Map<string, number>();

  // Events arrive in chronological order, but sort defensively: the pairing below
  // depends on it and the cost is trivial at a day's volume.
  const ordered = [...events].sort((a, b) => a.timeStamp - b.timeStamp);

  for (const event of ordered) {
    if (event.eventType === EVENT_RESUMED) {
      // Clamp to the window: a resume from before midnight only counts from
      // midnight onwards.
      openedAt.set(event.packageName, Math.max(event.timeStamp, since));
      continue;
    }

    if (event.eventType !== EVENT_PAUSED) continue;

    const opened = openedAt.get(event.packageName);
    // A pause with no matching resume means the session started before the
    // window; nothing to add that we can account for honestly.
    if (opened === undefined) continue;

    openedAt.delete(event.packageName);
    const elapsed = Math.min(event.timeStamp, until) - opened;
    if (elapsed > 0) {
      totals.set(event.packageName, (totals.get(event.packageName) ?? 0) + elapsed);
    }
  }

  // Whatever is still open is on screen right now, or was when the phone slept.
  for (const [packageName, opened] of openedAt) {
    const elapsed = until - opened;
    if (elapsed > 0) {
      totals.set(packageName, (totals.get(packageName) ?? 0) + elapsed);
    }
  }

  return totals;
}

/** Aggregated-bucket fallback, used when the event query yields nothing. */
function sumBucketMs(entries: readonly UsageStatsEntry[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    totals.set(
      entry.packageName,
      (totals.get(entry.packageName) ?? 0) + entry.totalTimeInForeground,
    );
  }
  return totals;
}

/**
 * Minutes spent today in each of the given packages.
 *
 * @param packages Android package names to report on. Anything else the device
 *                 has usage for is discarded rather than returned — we only read
 *                 what the Supervise screen actually lists.
 * @returns minutes per package name, or `null` when usage data could not be read
 *          at all (unsupported, not granted, or the query failed). `null` means
 *          "keep whatever you had"; an empty map means "genuinely nothing today".
 */
export async function readUsageMinutesToday(
  packages: readonly string[],
): Promise<Record<string, number> | null> {
  if (!usageStats || packages.length === 0) return null;

  const until = Date.now();
  const since = startOfToday(new Date(until));

  let totals: Map<string, number> | null = null;

  try {
    const events = await usageStats.getUsageEvents(since, until);
    if (events.length > 0) {
      totals = sumForegroundMs(events, since, until);
    }
  } catch (error) {
    // Rejects with PERMISSION_DENIED when access has not been granted, which is
    // an expected state rather than a fault.
    console.log('[usage] Event query unavailable', error);
  }

  if (!totals) {
    try {
      totals = sumBucketMs(await usageStats.getUsageStats(since, until));
    } catch (error) {
      console.log('[usage] Usage stats query unavailable', error);
      return null;
    }
  }

  const minutes: Record<string, number> = {};
  for (const packageName of packages) {
    const ms = totals.get(packageName);
    if (ms === undefined) continue;
    minutes[packageName] = Math.round(ms / 60_000);
  }

  return minutes;
}
