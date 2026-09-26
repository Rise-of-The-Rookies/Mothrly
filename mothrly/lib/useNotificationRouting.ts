import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';

import { HOME_ROUTE, initNotifications } from './notifications';

/**
 * Pulls the deep-link target out of a notification payload.
 *
 * Reminders scheduled by `scheduleReminder` always carry a `url`, but a
 * notification could also arrive from elsewhere, so fall back to Home.
 */
function routeFor(notification: Notifications.Notification): string {
  const url = notification.request.content.data?.url;
  return typeof url === 'string' && url.length > 0 ? url : HOME_ROUTE;
}

/**
 * Requests notification permission on launch and routes notification taps.
 *
 * Handles both entry points:
 * - cold start, where the tap happened before React mounted and is replayed by
 *   `getLastNotificationResponse`
 * - warm taps while the app is already running, via the response listener
 *
 * Mount this once from the root layout.
 */
export function useNotificationRouting(): void {
  useEffect(() => {
    // Fire and forget — initNotifications handles its own errors and never rejects.
    initNotifications();

    let handledColdStart = false;

    const open = (notification: Notifications.Notification) => {
      // `navigate` rather than `push` so a tap doesn't stack duplicate Home
      // screens if the user taps several reminders in a row.
      router.navigate(routeFor(notification));
    };

    // A tap that launched the app is available synchronously on first render.
    const initial = Notifications.getLastNotificationResponse();
    if (initial?.notification) {
      handledColdStart = true;
      open(initial.notification);
      // Clear it so a later remount doesn't navigate again.
      Notifications.clearLastNotificationResponse();
    }

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      // The listener also replays the cold-start response on some platforms.
      if (handledColdStart) {
        handledColdStart = false;
        return;
      }
      open(response.notification);
    });

    return () => {
      subscription.remove();
    };
  }, []);
}
