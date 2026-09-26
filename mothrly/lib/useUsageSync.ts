import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { hasUsageAccess, isUsageTrackingSupported, readUsageMinutesToday } from './usageStats';

import useSuperviseStore from '@/store/superviseStore';

/**
 * Keeps the supervised app times in step with what Android actually recorded.
 *
 * Both hooks here are no-ops unless {@link isUsageTrackingSupported} is true, so
 * iOS and Expo Go keep running on the seeded and demo values with nothing to
 * disable.
 */

/** Where the user stands with the Usage access grant. */
export type UsageAccessStatus =
  /** No usage data on this platform or build. Nothing to ask for. */
  | 'unsupported'
  /** Not checked yet. */
  | 'unknown'
  | 'granted'
  | 'denied';

/** Every Android package across the supervised apps, de-duplicated. */
function trackedPackages(): string[] {
  const packages = new Set<string>();
  for (const app of useSuperviseStore.getState().apps) {
    for (const packageName of app.androidPackages) packages.add(packageName);
  }
  return [...packages];
}

/**
 * Reads usage for today and writes it into the store.
 *
 * Resolves to whether real data was applied. `false` covers every "not now"
 * case — unsupported platform, permission not granted, query failed — and leaves
 * the existing numbers alone.
 */
export async function syncUsageMinutes(): Promise<boolean> {
  if (!isUsageTrackingSupported()) return false;

  const minutes = await readUsageMinutesToday(trackedPackages());
  if (!minutes) return false;

  useSuperviseStore.getState().applyUsageMinutes(minutes);
  return true;
}

/**
 * Syncs usage on mount and every time the app comes back to the foreground.
 *
 * Foregrounding is the moment that matters: the user has just come back from the
 * app they were using, so that session is exactly what we have not counted yet.
 *
 * Mount once from the root layout.
 */
export function useUsageSync(): void {
  useEffect(() => {
    if (!isUsageTrackingSupported()) return;

    // Fire and forget: `syncUsageMinutes` reports failure by returning false and
    // does not reject.
    void syncUsageMinutes();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncUsageMinutes();
    });

    return () => {
      subscription.remove();
    };
  }, []);
}

/**
 * Tracks whether Usage access has been granted, re-checking whenever the app
 * becomes active.
 *
 * That re-check is what closes the loop on the explanation screen: the user leaves
 * for system settings, flips the switch, and comes back to a screen that already
 * knows.
 *
 * @returns the current status and a `refresh` for checking on demand.
 */
export function useUsageAccess(): { status: UsageAccessStatus; refresh: () => void } {
  const [status, setStatus] = useState<UsageAccessStatus>(() =>
    isUsageTrackingSupported() ? 'unknown' : 'unsupported',
  );

  const refresh = useCallback(() => {
    // Nothing to check, and nothing to update: the initial state is already
    // `unsupported` on these platforms.
    if (!isUsageTrackingSupported()) return;

    hasUsageAccess()
      .then(async (granted) => {
        setStatus(granted ? 'granted' : 'denied');
        // Pull the numbers in the same breath as the grant, so the Supervise list
        // is already real by the time the user looks at it.
        if (granted) await syncUsageMinutes();
      })
      .catch((error: unknown) => {
        console.warn('[usage] Access check failed', error);
        setStatus('denied');
      });
  }, []);

  useEffect(() => {
    refresh();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });

    return () => {
      subscription.remove();
    };
  }, [refresh]);

  return { status, refresh };
}
