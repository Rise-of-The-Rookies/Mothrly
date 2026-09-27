import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { checkNotificationPermission, hasNotificationPermission } from './notifications';

/**
 * Tracks whether Mothrly is allowed to post notifications.
 *
 * Exists because a denial is invisible from inside the app otherwise. Reminders
 * are planned from settings alone — `lib/nextReminder.ts` is pure and never asks
 * the OS what is actually queued — so with permission off, every screen goes on
 * cheerfully reporting a next reminder that will never arrive. This is what lets
 * the UI tell the truth instead.
 *
 * Re-checks on every foreground, which is the moment that matters: revoking
 * notifications means leaving for system settings and coming back.
 *
 * Shaped after {@link useUsageAccess} in `lib/useUsageSync.ts`, deliberately —
 * the two answer the same kind of question about a different permission.
 */

/** Where the user stands with the notification permission. */
export type NotificationPermission =
  /** Not read yet. Treat as "don't warn about it" — assume the happy path. */
  'unknown' | 'granted' | 'denied';

export function useNotificationPermission(): NotificationPermission {
  // Seeded from the last known value rather than always starting at `unknown`, so
  // a screen that mounts after the permission has already been read doesn't flash
  // through an indeterminate state on its way to the answer it could have had.
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    hasNotificationPermission() ? 'granted' : 'unknown',
  );

  useEffect(() => {
    let cancelled = false;

    const read = () => {
      // Never rejects, so there is no failure branch to handle here.
      checkNotificationPermission().then((granted) => {
        if (!cancelled) setPermission(granted ? 'granted' : 'denied');
      });
    };

    read();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') read();
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return permission;
}
