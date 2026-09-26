import { DEFAULT_PERSONA_ID, personaMessages, type PersonaId } from '@/data/personas';

/**
 * Reminder copy, resolved against a persona.
 *
 * The lines themselves live in `data/personas.ts`; this module is only the lookup
 * — which persona, which category, which of its variants. It stays pure and takes
 * the persona id as an argument rather than reading `store/personaStore.ts`, both
 * so the result is testable and so `store/reminderStore.ts` can depend on the
 * persona store without a cycle forming back through here.
 *
 * Callers that omit the persona get the default one. That is a safety net for
 * pure code with no store access, not the normal path: anything scheduling a real
 * notification passes the active id.
 */

/** The three reminder categories the scheduler knows how to plan. */
export type ReminderCategory = 'hydration' | 'sleep' | 'focus';

/**
 * All messages available for a category in the given persona's voice.
 *
 * Guaranteed to be non-empty for every category, so callers can index into it
 * without a fallback.
 */
export function messagesFor(
  category: ReminderCategory,
  personaId: PersonaId = DEFAULT_PERSONA_ID,
): readonly string[] {
  return personaMessages(personaId, category);
}

/**
 * Picks the message for the nth occurrence of a reminder.
 *
 * Rotating by index rather than at random keeps a scheduled batch varied
 * instead of repeating the same line five times in a row, and stays
 * deterministic so a reschedule produces the same copy.
 *
 * @param category  Which reminder category to draw copy from.
 * @param index     Zero-based position of the occurrence in the batch. Negative
 *                  or fractional values are tolerated.
 * @param personaId Whose voice to use. Defaults to the default persona.
 */
export function messageForOccurrence(
  category: ReminderCategory,
  index: number,
  personaId: PersonaId = DEFAULT_PERSONA_ID,
): string {
  const pool = messagesFor(category, personaId);
  const safeIndex = Number.isFinite(index) ? Math.abs(Math.trunc(index)) : 0;
  // `pool` is never empty, but `noUncheckedIndexedAccess` can't know that.
  return pool[safeIndex % pool.length] ?? pool[0]!;
}

/* -------------------------------------------------------------------------- */
/* Supervise mode                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Copy for a supervise nudge about an app.
 *
 * Supervise lines are templates rather than finished copy, because a nudge is
 * about something the user is doing right now rather than a scheduled check-in —
 * it names the app and the number. `{app}` and `{time}` are substituted here.
 *
 * @param appName   App to name in the message.
 * @param timeLabel Time spent today, pre-formatted (e.g. `32m`, `1h 12m`).
 * @param index     Which line to use. Rotates, so consecutive nudges differ, and
 *                  stays deterministic so the notification and the in-app alert
 *                  can be built from the same index and never disagree.
 * @param personaId Whose voice to use. Defaults to the default persona.
 */
export function superviseMessage(
  appName: string,
  timeLabel: string,
  index = 0,
  personaId: PersonaId = DEFAULT_PERSONA_ID,
): string {
  const pool = personaMessages(personaId, 'supervise');
  const safeIndex = Number.isFinite(index) ? Math.abs(Math.trunc(index)) : 0;
  const template = pool[safeIndex % pool.length] ?? pool[0]!;
  return template.replace('{app}', appName).replace('{time}', timeLabel);
}
