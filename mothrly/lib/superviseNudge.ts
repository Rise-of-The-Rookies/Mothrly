import { scheduleReminder } from './notifications';
import { superviseMessage } from './reminderMessages';

import { activePersonaId } from '@/store/personaStore';
import useReminderStore from '@/store/reminderStore';
import useSuperviseStore, {
  formatMinutes,
  isNudgeFresh,
  type SuperviseNudgeSource,
} from '@/store/superviseStore';

/**
 * How a supervise-mode nudge is raised.
 *
 * {@link triggerSuperviseNudge} is the single way a nudge reaches the user, and
 * the two callers share it: {@link evaluateSuperviseNudges}, which runs after
 * every usage read, and the hidden demo menu on the Supervise screen. A demo
 * nudge is therefore the real flow with a scripted input rather than a
 * look-alike.
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

/** What a detection pass decided, beyond the outcomes a trigger itself can have. */
export type SuperviseEvaluation =
  | SuperviseTriggerResult
  /**
   * No tracked app has reached a threshold multiple that has not already been
   * nudged about today.
   */
  | 'no-candidate'
  /** The counters are still seeded or demo values, so there is nothing to judge. */
  | 'not-measured'
  /** A nudge is already on screen waiting to be answered. */
  | 'nudge-pending';

/**
 * Checks the current usage counters against each app's threshold and raises a
 * nudge if one is due.
 *
 * Call this after writing fresh usage data into the store — a measurement is the
 * only thing that can newly cross a threshold, so `syncUsageMinutes` is the
 * natural and only caller.
 *
 * Nudges escalate at whole multiples of the threshold. An app with a 15-minute
 * threshold is nudged about at 15 minutes, again at 30, again at 45 — each
 * multiple once. {@link SuperviseStore.lastNudgedLevel} records how far up that
 * ladder Mothrly has already spoken, which is what makes the difference between
 * escalating and repeating: usage is re-read on every foreground, so an app over
 * its threshold stays over it until midnight, and without the record every switch
 * back to Mothrly would raise the same nudge again.
 *
 * At most one nudge per pass. `activeNudge` holds a single nudge, so raising two
 * would mean the second silently replacing the first while both notifications went
 * out. When several apps are due, the one at the highest level wins, since that is
 * the furthest past what its own threshold said was reasonable; ties go to the app
 * with more minutes over.
 *
 * @returns why nothing happened, or `raised` when a nudge went out.
 */
export function evaluateSuperviseNudges(): SuperviseEvaluation {
  if (!useReminderStore.getState().superviseMode) return 'supervise-off';

  const supervise = useSuperviseStore.getState();

  // Seeded counters are made up, and demo values were already spoken for when the
  // demo raised them. Judging either would nudge about time the user never spent.
  if (supervise.minutesSource !== 'usage-stats') return 'not-measured';

  // An unanswered nudge owns the moment; piling a second one on top of it reads as
  // nagging rather than noticing. Nothing is lost by waiting: the level is worked
  // out from the current minutes, so the next pass picks up wherever usage has got
  // to rather than replaying the level that was skipped.
  if (supervise.activeNudge && isNudgeFresh(supervise.activeNudge)) return 'nudge-pending';

  let candidate: { appId: string; minutes: number; level: number; overage: number } | null = null;

  for (const app of supervise.apps) {
    // No packages means nothing measured this app, so its counter is seed or demo
    // data regardless of what the day's source says.
    if (app.androidPackages.length === 0) continue;
    // A zero or negative threshold would make every level infinite. Not reachable
    // from the seeded list, but the field is editable state.
    if (app.thresholdMinutes <= 0) continue;

    const minutes = supervise.minutesToday[app.id] ?? 0;
    const level = Math.floor(minutes / app.thresholdMinutes);

    // Below the threshold, or still inside a multiple already spoken for.
    if (level < 1 || level <= supervise.lastNudgedLevel(app.id)) continue;

    const overage = minutes - app.thresholdMinutes;
    if (
      !candidate ||
      level > candidate.level ||
      (level === candidate.level && overage > candidate.overage)
    ) {
      candidate = { appId: app.id, minutes, level, overage };
    }
  }

  if (!candidate) return 'no-candidate';

  const result = triggerSuperviseNudge(candidate.appId, candidate.minutes, {
    source: 'detection',
  });

  // Only record a level the user was actually told about. A trigger that no-opped
  // has said nothing, so the next pass should be free to try the same level again.
  if (result === 'raised') supervise.markNudgedLevel(candidate.appId, candidate.level);

  return result;
}
