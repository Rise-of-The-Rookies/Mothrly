// Type-only, so this module stays free of any runtime dependency on
// expo-notifications and remains pure.
import type { FiredReminder } from './notifications';
import { messageForOccurrence, type ReminderCategory } from './reminderMessages';
import { planOccurrences, REMINDER_CATEGORIES, type ReminderSettings } from './reminderSchedule';

import { DEFAULT_PERSONA_ID, type PersonaId } from '@/data/personas';

/**
 * Picks the reminder the Home screen should be showing.
 *
 * Pure, like the rest of `reminderSchedule` — it derives everything from
 * settings, a persona and a "now", so it never has to ask the OS what is
 * actually pending. It also reuses `messageForOccurrence` with index 0, which
 * means the copy on screen is the same line the next notification will arrive
 * with, in the same persona's voice.
 */

export type NextReminder = {
  category: ReminderCategory;
  /** The copy the next notification for this category will carry. */
  message: string;
  /** When it is due. Always in the future relative to the `now` passed in. */
  at: Date;
};

/** Human-readable category names, for labelling the bubble. */
export const CATEGORY_LABELS: Record<ReminderCategory, string> = {
  hydration: 'Hydration',
  sleep: 'Sleep',
  focus: 'Focus',
};

/**
 * The soonest upcoming reminder across every enabled category, or `null` when
 * all three are switched off.
 *
 * @param settings  Current reminder settings.
 * @param now       Reference time. Injectable so the result is testable.
 * @param personaId Whose voice the copy should be in. Defaults to the default
 *                  persona; pass the active id so the bubble matches the tray.
 */
export function nextReminder(
  settings: ReminderSettings,
  now: Date = new Date(),
  personaId: PersonaId = DEFAULT_PERSONA_ID,
): NextReminder | null {
  let soonest: NextReminder | null = null;

  for (const category of REMINDER_CATEGORIES) {
    if (!settings[category].enabled) continue;

    // `planOccurrences` returns future times, soonest first, so the head of the
    // list is this category's next due reminder.
    const [at] = planOccurrences(category, settings, now);
    if (!at) continue;
    if (soonest && at.getTime() >= soonest.at.getTime()) continue;

    soonest = { category, message: messageForOccurrence(category, 0, personaId), at };
  }

  return soonest;
}

/**
 * A short "when" label for a due time, e.g. `in 20 min`, `in 3h 5m`, `tomorrow`.
 *
 * Deliberately coarse: the exact second a batched notification lands is not
 * something the user needs, and a vaguer label ages better between re-renders.
 */
export function formatDueLabel(at: Date, now: Date = new Date()): string {
  const totalMinutes = Math.round((at.getTime() - now.getTime()) / 60_000);

  if (totalMinutes <= 0) return 'due now';
  if (totalMinutes < 60) return `in ${totalMinutes} min`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) return minutes === 0 ? `in ${hours}h` : `in ${hours}h ${minutes}m`;

  const days = Math.round(hours / 24);
  return days <= 1 ? 'tomorrow' : `in ${days} days`;
}

/* -------------------------------------------------------------------------- */
/* Choosing what to show                                                      */
/* -------------------------------------------------------------------------- */

/**
 * How long a delivered reminder stays more interesting than the next upcoming
 * one. Past this, the user has moved on and "what's next" is the better answer.
 */
export const FIRED_FRESHNESS_MS = 30 * 60_000;

/** The single reminder the Home screen should be showing, and why. */
export type ReminderHighlight = {
  /** `fired` for one that just went off, `upcoming` for the next one due. */
  kind: 'fired' | 'upcoming';
  category: ReminderCategory;
  message: string;
  /** Delivery time for `fired`, due time for `upcoming`. */
  at: Date;
};

/**
 * Narrows a delivered reminder to one of the three schedulable categories.
 *
 * Deliberately excludes `test` and the other one-off types: a diagnostic
 * notification should not take over the Home screen.
 */
function firedCategory(fired: FiredReminder): ReminderCategory | null {
  const match = REMINDER_CATEGORIES.find((category) => category === fired.type);
  return match ?? null;
}

/**
 * Picks between "one just fired" and "here's what's next".
 *
 * A reminder that fired within {@link FIRED_FRESHNESS_MS} wins, because it is
 * what the user is most likely still acting on. Otherwise this falls through to
 * {@link nextReminder}, and returns `null` only when every category is off and
 * nothing recent has fired.
 *
 * A delivered reminder is only shown while it still belongs to the active
 * persona. Its text is whatever the OS actually delivered, so it cannot be
 * re-voiced without misrepresenting what the user was sent — instead, switching
 * persona retires it and the bubble falls through to the upcoming reminder, which
 * speaks in the new voice. A reminder carrying no persona stamp (an older build,
 * or a persona-less type) is treated as still fitting.
 */
export function reminderHighlight(
  settings: ReminderSettings,
  lastFired: FiredReminder | null,
  now: Date = new Date(),
  personaId: PersonaId = DEFAULT_PERSONA_ID,
): ReminderHighlight | null {
  if (lastFired) {
    const category = firedCategory(lastFired);
    const age = now.getTime() - lastFired.firedAt;
    // Unstamped counts as a match, so the only thing this rejects is copy we know
    // belongs to a persona the user has left.
    const samePersona = lastFired.personaId === undefined || lastFired.personaId === personaId;

    // `age >= 0` guards against a clock change leaving a delivery in the future.
    if (category && samePersona && age >= 0 && age <= FIRED_FRESHNESS_MS) {
      return {
        kind: 'fired',
        category,
        message: lastFired.message,
        at: new Date(lastFired.firedAt),
      };
    }
  }

  const upcoming = nextReminder(settings, now, personaId);
  if (!upcoming) return null;

  return {
    kind: 'upcoming',
    category: upcoming.category,
    message: upcoming.message,
    at: upcoming.at,
  };
}

/**
 * A short "how long ago" label, e.g. `just now`, `12 min ago`, `2h ago`.
 *
 * The past-tense counterpart to {@link formatDueLabel}, kept equally coarse.
 */
export function formatAgoLabel(at: Date, now: Date = new Date()): string {
  const totalMinutes = Math.round((now.getTime() - at.getTime()) / 60_000);

  if (totalMinutes < 1) return 'just now';
  if (totalMinutes < 60) return `${totalMinutes} min ago`;

  const hours = Math.floor(totalMinutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  return days <= 1 ? 'yesterday' : `${days} days ago`;
}
