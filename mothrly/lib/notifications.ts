// Type-only, so this import is erased at compile time and never evaluates the
// module. That distinction is the whole reason this file is shaped the way it is
// — see `loadNotifications` below.
import type * as NotificationsModule from 'expo-notifications';
import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

import { colors } from './theme';

import { isPersonaId, type PersonaId } from '@/data/personas';

/**
 * Local notification engine.
 *
 * Everything in here is best-effort: if the user denies notification
 * permissions, or the platform rejects a schedule request, the functions log
 * and resolve with a falsy value rather than throwing. Callers never need to
 * wrap these in try/catch to keep the app alive.
 *
 * This module is the *only* place that touches `expo-notifications`. Anything
 * else needing notifications goes through the functions exported here, for the
 * same reason `lib/usageStats.ts` owns `expo-android-usagestats`: the dependency
 * is not always loadable, and one guarded entry point is far easier to reason
 * about than a guard at every call site.
 */

/** Android notification channel that all reminders are posted to. */
export const REMINDERS_CHANNEL_ID = 'reminders';

/**
 * Category of reminder. Carried in the notification's `data` payload so the tap
 * handler (and, later, analytics) can tell reminders apart.
 */
export type ReminderType =
  'checkin' | 'supervise' | 'persona' | 'test' | 'hydration' | 'sleep' | 'focus';

/** Human-readable titles shown in the notification tray per reminder type. */
const TITLES: Record<ReminderType, string> = {
  checkin: 'Time to check in',
  supervise: 'Supervision reminder',
  persona: 'A word from your persona',
  test: 'Test notification',
  hydration: 'Water break',
  sleep: 'Bedtime',
  focus: 'Focus check',
};

/** Route opened when a reminder is tapped. `(tabs)/index` is the Home screen. */
export const HOME_ROUTE = '/';

/** Shape of the `data` payload attached to every reminder we schedule. */
export type ReminderData = {
  type: ReminderType;
  /** Deep link target consumed by the tap handler in `app/_layout.tsx`. */
  url: string;
  /**
   * Which persona's voice the body was written in.
   *
   * Stamped at schedule time so a delivered reminder can be told apart from the
   * persona now active — see `reminderHighlight`. Optional because a reminder
   * scheduled before this existed carries no stamp, and `test` notifications have
   * no persona behind them.
   */
  personaId?: PersonaId;
};

let initPromise: Promise<boolean> | null = null;
let permissionGranted = false;

/**
 * Loads `expo-notifications`, or returns `null` where it cannot be loaded.
 *
 * Deliberately a `require` inside a guard rather than a static import, and not
 * for the usual reason. `expo-notifications` does not merely fail when its push
 * features are used in Expo Go on Android — **importing it throws**. Its barrel
 * re-exports `DevicePushTokenAutoRegistration.fx`, whose module body calls
 * `addPushTokenListener()` at the top level, and that in turn calls a guard which
 * throws outright on Android under Expo Go (SDK 53 removed remote notifications
 * from Expo Go). So the error arrives while the module graph is still being
 * evaluated, long before any of our code runs, and it takes the whole app down at
 * launch. No amount of guarding *our* calls helps; the import itself is the
 * problem, which is why it has to be deferred behind this check.
 *
 * `isRunningInExpoGo` is the same predicate expo-notifications uses internally,
 * so this cannot disagree with the condition it is avoiding.
 *
 * Every consequence of returning `null` is a feature switching itself off, never
 * an error: reminders are not scheduled, permission reads as denied, and the Home
 * screen already has a state for exactly that.
 */
function loadNotifications(): typeof NotificationsModule | null {
  if (Platform.OS === 'android' && isRunningInExpoGo()) {
    console.log(
      '[notifications] Expo Go on Android cannot load expo-notifications ' +
        '(remote notifications were removed from Expo Go in SDK 53). Reminders ' +
        'are switched off for this session — run a development build to test them.',
    );
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-notifications') as typeof NotificationsModule;
  } catch (error) {
    console.warn('[notifications] expo-notifications could not be loaded', error);
    return null;
  }
}

const Notifications = loadNotifications();

/**
 * Whether notifications can work in this build at all.
 *
 * False in Expo Go on Android. Check it before showing UI that offers to send or
 * schedule anything, so the user is not handed a button that cannot work.
 */
export function isNotificationsAvailable(): boolean {
  return Notifications !== null;
}

/**
 * Foreground presentation behaviour. Without this, notifications that fire
 * while the app is open are delivered silently and never reach the tray, which
 * makes the test button look broken.
 */
Notifications?.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Creates (or updates) the `reminders` channel. Android-only; no-op elsewhere. */
async function createRemindersChannel(): Promise<void> {
  if (!Notifications) return;
  if (Platform.OS !== 'android') return;

  try {
    await Notifications.setNotificationChannelAsync(REMINDERS_CHANNEL_ID, {
      name: 'Reminders',
      description: 'Check-in nudges and supervision reminders from Mothrly.',
      importance: Notifications.AndroidImportance.HIGH,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      lightColor: colors.primary,
      vibrationPattern: [0, 250, 250, 250],
      enableVibrate: true,
      showBadge: true,
    });
  } catch (error) {
    // A missing channel degrades delivery on Android but shouldn't be fatal.
    console.warn('[notifications] Failed to create the "reminders" channel', error);
  }
}

/**
 * Asks for notification permission and sets up the Android channel.
 *
 * Safe to call repeatedly — the work runs once per app session and later calls
 * share the same promise. The OS itself only shows the permission dialog on the
 * first launch; once a user has answered, `getPermissionsAsync` short-circuits
 * the request so we never nag them again.
 *
 * @returns whether the app is allowed to post notifications.
 */
export function initNotifications(): Promise<boolean> {
  initPromise ??= (async () => {
    // Nothing to ask for, and nothing to ask with.
    if (!Notifications) {
      permissionGranted = false;
      return false;
    }

    // The channel must exist before the permission prompt on Android, otherwise
    // the prompt has no channel to attribute the request to.
    await createRemindersChannel();

    try {
      const existing = await Notifications.getPermissionsAsync();
      let granted = existing.granted;

      if (!granted && existing.canAskAgain) {
        const requested = await Notifications.requestPermissionsAsync({
          ios: { allowAlert: true, allowBadge: true, allowSound: true },
        });
        granted = requested.granted;
      }

      permissionGranted = granted;

      if (!granted) {
        console.log(
          '[notifications] Permission not granted. Reminders are disabled; ' +
            'the rest of the app continues to work normally.',
        );
      }

      return granted;
    } catch (error) {
      // Thrown on platforms without a notifications implementation (for
      // example web without a service worker). Treat it as "not available".
      console.warn('[notifications] Permission check failed', error);
      permissionGranted = false;
      return false;
    }
  })();

  return initPromise;
}

/** Whether notification permission is currently granted, as of the last check. */
export function hasNotificationPermission(): boolean {
  return permissionGranted;
}

/**
 * Re-reads the current permission state without ever prompting.
 *
 * {@link initNotifications} memoises its whole body, so once it has run it cannot
 * tell you that the user has since revoked notifications in system settings —
 * which they can do at any time, and which silently stops every reminder. This is
 * the read to use for anything that reports permission state in the UI.
 *
 * Never throws; a platform with no notifications implementation reads as denied.
 */
export async function checkNotificationPermission(): Promise<boolean> {
  if (!Notifications) {
    permissionGranted = false;
    return false;
  }

  try {
    const { granted } = await Notifications.getPermissionsAsync();
    permissionGranted = granted;
    return granted;
  } catch (error) {
    console.warn('[notifications] Permission re-check failed', error);
    permissionGranted = false;
    return false;
  }
}

/**
 * Schedules a one-off reminder.
 *
 * @param type      Reminder category. Determines the notification title and is
 *                  attached to the payload.
 * @param message   Body copy shown to the user.
 * @param triggerTime When to fire — a `Date`, or a Unix timestamp in
 *                  milliseconds. Times in the past are rejected.
 * @param personaId Whose voice `message` was written in, recorded in the payload.
 *                  Omit for copy that has no persona behind it, such as the test
 *                  notification.
 * @returns the notification identifier to pass to {@link cancelReminder}, or
 *          `null` if the reminder could not be scheduled.
 */
export async function scheduleReminder(
  type: ReminderType,
  message: string,
  triggerTime: Date | number,
  personaId?: PersonaId,
): Promise<string | null> {
  const granted = await initNotifications();
  // Covers both "denied" and "not available in this build" — `initNotifications`
  // resolves false for either, and the narrowing below needs `Notifications` too.
  if (!granted || !Notifications) {
    console.log(`[notifications] Skipping "${type}" reminder — no permission.`);
    return null;
  }

  const fireAt = triggerTime instanceof Date ? triggerTime : new Date(triggerTime);

  if (Number.isNaN(fireAt.getTime())) {
    console.warn('[notifications] Invalid triggerTime, reminder not scheduled', triggerTime);
    return null;
  }

  const secondsFromNow = (fireAt.getTime() - Date.now()) / 1000;
  if (secondsFromNow <= 0) {
    console.warn(
      `[notifications] triggerTime ${fireAt.toISOString()} is in the past, reminder not scheduled.`,
    );
    return null;
  }

  const data: ReminderData = { type, url: HOME_ROUTE, ...(personaId ? { personaId } : {}) };

  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: TITLES[type],
        body: message,
        data,
        sound: 'default',
      },
      trigger: {
        // A time interval is more reliable than a calendar date for short
        // delays, and both platforms honour it identically.
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(1, Math.round(secondsFromNow)),
        channelId: REMINDERS_CHANNEL_ID,
      },
    });
  } catch (error) {
    console.warn('[notifications] Failed to schedule reminder', error);
    return null;
  }
}

/**
 * Cancels a previously scheduled reminder. Resolves quietly when the id is
 * unknown or already fired.
 */
export async function cancelReminder(id: string): Promise<void> {
  if (!Notifications) return;

  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch (error) {
    console.warn(`[notifications] Failed to cancel reminder "${id}"`, error);
  }
}

/** Cancels every reminder this app has scheduled. */
export async function cancelAllReminders(): Promise<void> {
  if (!Notifications) return;

  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (error) {
    console.warn('[notifications] Failed to cancel all reminders', error);
  }
}

/**
 * Fires a reminder five seconds from now so the full pipeline (permission →
 * channel → schedule → delivery → tap) can be verified on a real device.
 *
 * @returns the notification id, or `null` when permission is missing.
 */
export function sendTestNotification(): Promise<string | null> {
  return scheduleReminder(
    'test',
    'If you can see this, notifications are wired up correctly. Tap to open Home.',
    Date.now() + 5_000,
  );
}

/* -------------------------------------------------------------------------- */
/* Observing what has fired and what is still pending                         */
/* -------------------------------------------------------------------------- */

/** A reminder that has already been delivered to the user. */
export type FiredReminder = {
  type: ReminderType;
  /** The body copy the user actually saw. */
  message: string;
  /** When the OS delivered it, as a Unix timestamp in ms. */
  firedAt: number;
  /**
   * Whose voice {@link FiredReminder.message} is in, when the payload said so.
   *
   * Absent means unknown rather than "no persona": a reminder scheduled by an
   * older build, or one of the persona-less types. Callers comparing this against
   * the active persona should treat absent as "don't know, assume it still fits".
   */
  personaId?: PersonaId;
};

/** Narrows an arbitrary payload value to a known {@link ReminderType}. */
function isReminderType(value: unknown): value is ReminderType {
  return typeof value === 'string' && value in TITLES;
}

/**
 * Reads a delivered notification back into a {@link FiredReminder}.
 *
 * Returns `null` for anything we did not schedule — the payload shape is the
 * only thing marking a notification as ours.
 */
function toFiredReminder(notification: NotificationsModule.Notification): FiredReminder | null {
  const { content } = notification.request;
  const type: unknown = content.data?.type;

  if (!isReminderType(type)) return null;

  const personaId: unknown = content.data?.personaId;

  return {
    type,
    message: content.body ?? '',
    ...(isPersonaId(personaId) ? { personaId } : {}),
    // `notification.date` is the real delivery time. Using it rather than
    // `Date.now()` matters for taps replayed at cold start, which can arrive
    // long after the notification was actually shown.
    firedAt: notification.date,
  };
}

/**
 * Subscribes to reminders being delivered.
 *
 * Covers both ways we learn about a delivery: the notification arriving while
 * the app is in the foreground, and the user tapping one. Neither fires for a
 * notification delivered while the app is backgrounded and never tapped, so
 * treat this as best-effort — it is good enough to keep the UI current, not a
 * reliable delivery log.
 *
 * @returns a subscription whose `remove()` detaches both underlying listeners.
 */
export function addReminderDeliveryListener(
  handler: (fired: FiredReminder) => void,
): NotificationsModule.EventSubscription {
  // A no-op subscription rather than null, so callers keep one shape to clean up.
  if (!Notifications) return { remove: () => {} };

  const forward = (notification: NotificationsModule.Notification) => {
    const fired = toFiredReminder(notification);
    if (fired) handler(fired);
  };

  const received = Notifications.addNotificationReceivedListener(forward);
  const tapped = Notifications.addNotificationResponseReceivedListener((response) => {
    forward(response.notification);
  });

  return {
    remove: () => {
      received.remove();
      tapped.remove();
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Notification taps                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The deep-link target a notification asks to open.
 *
 * Reminders scheduled by {@link scheduleReminder} always carry a `url`, but a
 * notification could arrive from elsewhere, so this falls back to {@link HOME_ROUTE}.
 */
export function routeForNotification(notification: NotificationsModule.Notification): string {
  const url = notification.request.content.data?.url;
  return typeof url === 'string' && url.length > 0 ? url : HOME_ROUTE;
}

/**
 * The tap that launched the app, if the app was started by one.
 *
 * Available synchronously on first render. Clearing it is the caller's job — see
 * {@link clearInitialNotificationResponse} — so a remount does not navigate twice.
 */
export function getInitialNotificationResponse(): NotificationsModule.NotificationResponse | null {
  if (Platform.OS === 'web') return null;
  return Notifications?.getLastNotificationResponse() ?? null;
}

/** Forgets the cold-start tap, so a later remount does not replay it. */
export function clearInitialNotificationResponse(): void {
  if (Platform.OS === 'web') return;
  Notifications?.clearLastNotificationResponse();
}

/**
 * Subscribes to the user tapping a notification while the app is running.
 *
 * Returns a no-op subscription where notifications are unavailable, so the caller
 * needs no branch of its own.
 */
export function addNotificationTapListener(
  handler: (notification: NotificationsModule.Notification) => void,
): NotificationsModule.EventSubscription {
  if (!Notifications) return { remove: () => {} };

  return Notifications.addNotificationResponseReceivedListener((response) => {
    handler(response.notification);
  });
}

/**
 * How many notifications are currently pending per reminder type.
 *
 * Asks the OS rather than trusting our own bookkeeping, which makes it the
 * honest way to check that enabling and disabling a category really does
 * schedule and cancel work.
 */
export async function getPendingReminderCounts(): Promise<Record<ReminderType, number>> {
  const counts = Object.fromEntries(Object.keys(TITLES).map((type) => [type, 0])) as Record<
    ReminderType,
    number
  >;

  // All zeros is the honest answer when there is no queue to read.
  if (!Notifications || Platform.OS === 'web') return counts;

  try {
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    for (const request of pending) {
      const type: unknown = request.content.data?.type;
      if (isReminderType(type)) counts[type] += 1;
    }
  } catch (error) {
    console.warn('[notifications] Failed to read pending notifications', error);
  }

  return counts;
}
