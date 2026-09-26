import { scheduleReminder } from './notifications';
import { superviseMessage } from './reminderMessages';

import { activePersonaId } from '@/store/personaStore';
import useReminderStore from '@/store/reminderStore';
import useSuperviseStore, {
  formatMinutes,
  type SuperviseNudgeSource,
} from '@/store/superviseStore';

/**
 * The one way a supervise-mode nudge is raised.
 *
 * Real usage detection is not wired up yet, so today the only caller is the
 * hidden demo menu on the Supervise screen. That is deliberate: when detection
 * does land it calls this same function, which means everything downstream —
 * the copy, the persisted nudge, the alert animation, the tray notification —
 * is already the real path rather than a demo look-alike.
 */

/**
 * Delay before the tray notification fires.
 *
 * `scheduleReminder` rejects times in the past and rounds to whole seconds, so
 * the nudge needs a moment in the future to land on. One second also reads
 * correctly on camera: the in-app alert animates in, the banner follows.
 */
const TRAY_DELAY_MS = 1_000;

/**
 * Rotates the copy between nudges. Module-level rather than persisted — the only
 * thing it protects against is two nudges in a row reading identically.
 */
let nudgeIndex = 0;

/** Why a trigger did nothing, or `raised` when the nudge went out. */
export type SuperviseTriggerResult =
  | 'raised'
  /** No supervised app has that id. */
  | 'unknown-app'
  /** Supervise mode is switched off, so Mothrly stays quiet. */
  | 'supervise-off'
  /** The reported time is still under the app's threshold. */
  | 'below-threshold';

export type TriggerOptions = {
  /** Defaults to `detection`. */
  source?: SuperviseNudgeSource;
};

/**
 * Handles an app crossing its daily time threshold: records the time, raises the
 * in-app alert, and posts the matching notification.
 *
 * Synchronous on purpose. The alert is driven by store state, so it is on screen
 * within a frame of the call; the notification is fired and forgotten, since it
 * is best-effort and must never hold the UI up or throw.
 *
 * @param appId   Which supervised app was detected.
 * @param minutes Minutes used today, as detected. Replaces the stored count.
 * @returns what happened, so a caller can tell a no-op from a real nudge.
 */
export function triggerSuperviseNudge(
  appId: string,
  minutes: number,
  { source = 'detection' }: TriggerOptions = {},
): SuperviseTriggerResult {
  const supervise = useSuperviseStore.getState();
  const app = supervise.apps.find((candidate) => candidate.id === appId);

  if (!app) {
    console.warn(`[supervise] Ignoring nudge for unknown app "${appId}"`);
    return 'unknown-app';
  }

  // Record the time either way: the user's day happened whether or not we are
  // allowed to comment on it.
  supervise.setMinutes(appId, minutes);

  if (!useReminderStore.getState().superviseMode) {
    return 'supervise-off';
  }

  if (minutes < app.thresholdMinutes) {
    return 'below-threshold';
  }

  const timeLabel = formatMinutes(minutes);
  // One read, so the in-app alert and the tray notification below are built from
  // the same persona even if the user switches while the nudge is going out.
  const personaId = activePersonaId();
  const message = superviseMessage(app.name, timeLabel, nudgeIndex, personaId);
  nudgeIndex += 1;

  supervise.raiseNudge({
    appId: app.id,
    appName: app.name,
    initial: app.initial,
    color: app.color,
    minutes,
    thresholdMinutes: app.thresholdMinutes,
    message,
    triggeredAt: Date.now(),
    source,
  });

  // The same notification pipeline the scheduled reminders use, under the
  // `supervise` type so the tray copy and the payload identify it correctly.
  // `reminderHighlight` ignores this type, so recording the delivery does not
  // push a supervise nudge into Home's speech bubble — the alert owns it.
  scheduleReminder('supervise', message, Date.now() + TRAY_DELAY_MS, personaId).catch(
    (error: unknown) => {
      console.warn('[supervise] Failed to post the nudge notification', error);
    },
  );

  console.log(`[supervise] Nudge raised for ${app.name} at ${timeLabel} (${source})`);
  return 'raised';
}
