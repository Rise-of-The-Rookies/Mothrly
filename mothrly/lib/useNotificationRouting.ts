import { router } from 'expo-router';
import { useEffect } from 'react';

import {
  addNotificationTapListener,
  clearInitialNotificationResponse,
  getInitialNotificationResponse,
  routeForNotification,
} from './notifications';

/**
 * Routes notification taps to the screen the payload asks for.
 *
 * Handles both entry points:
 * - cold start, where the tap happened before React mounted and is replayed by
 *   the initial-response read
 * - warm taps while the app is already running, via the tap listener
 *
 * Deliberately does *not* ask for notification permission. That used to happen
 * here, which meant the OS dialog appeared on the first cold start with no
 * context around it. The onboarding screen owns the prompt now — see
 * `app/onboarding.tsx` — so the ask arrives attached to the slide that explains
 * why it is being made.
 *
 * Note that nothing here imports `expo-notifications`. It goes through
 * `lib/notifications.ts` instead, which owns the one guarded reference to that
 * module — importing it directly is what used to crash the app at launch in Expo
 * Go on Android. Both helpers below degrade to doing nothing there.
 *
 * Mount this once from the root layout.
 */
export function useNotificationRouting(): void {
  useEffect(() => {
    let handledColdStart = false;

    // `navigate` rather than `push` so a tap doesn't stack duplicate Home
    // screens if the user taps several reminders in a row.
    const open = (route: string) => {
      router.navigate(route);
    };

    // A tap that launched the app is available synchronously on first render.
    const initial = getInitialNotificationResponse();
    if (initial?.notification) {
      handledColdStart = true;
      open(routeForNotification(initial.notification));
      // Clear it so a later remount doesn't navigate again.
      clearInitialNotificationResponse();
    }

    const subscription = addNotificationTapListener((notification) => {
      // The listener also replays the cold-start response on some platforms.
      if (handledColdStart) {
        handledColdStart = false;
        return;
      }
      open(routeForNotification(notification));
    });

    return () => {
      subscription.remove();
    };
  }, []);
}
