import type { ReminderCategory } from './reminderMessages';

/**
 * Pure time math for reminder scheduling.
 *
 * `lib/notifications.ts` only knows how to schedule a *single* reminder at an
 * absolute time. Recurring reminders are therefore built by planning a batch of
 * one-off notifications covering a rolling horizon (see {@link HORIZON_HOURS})
 * and re-planning whenever settings change or the app relaunches. That costs a
 * few extra OS notification slots but keeps the timing rules in plain JS, where
 * intervals and the work-session window are easy to reason about.
 *
 * Nothing in this module touches React Native, the notification API, or the
 * store — it maps settings plus a "now" to a list of fire times, and that is
 * all. `store/reminderStore.ts` owns the side effects.
 */

/** A wall-clock time of day, in the device's local timezone. */
export type TimeOfDay = {
  /** 0–23. */
  hour: number;
  /** 0–59. */
  minute: number;
};

/** Recurring, all-day nudge on a fixed interval. */
export type HydrationSettings = {
  enabled: boolean;
  intervalMinutes: number;
};

/** Single reminder at a fixed bedtime, every day. */
export type SleepSettings = {
  enabled: boolean;
  time: TimeOfDay;
};

/** Recurring nudge, but only inside the user's declared work session. */
export type FocusSettings = {
  enabled: boolean;
  intervalMinutes: number;
  /** Start of the work session. The first nudge lands one interval after this. */
  sessionStart: TimeOfDay;
  /** End of the work session. If it is not after the start, the session is overnight. */
  sessionEnd: TimeOfDay;
};

export type ReminderSettings = {
  hydration: HydrationSettings;
  sleep: SleepSettings;
  focus: FocusSettings;
};

const MINUTE_MS = 60_000;
const MINUTES_PER_DAY = 24 * 60;

/** Guard rails for user-supplied intervals. */
export const MIN_INTERVAL_MINUTES = 5;
export const MAX_INTERVAL_MINUTES = MINUTES_PER_DAY;

/**
 * How far ahead each category plans. Longer horizons survive longer stretches
 * without the app being opened; shorter ones waste fewer OS notification slots.
 */
export const HORIZON_HOURS: Record<ReminderCategory, number> = {
  hydration: 24,
  sleep: 24 * 7,
  focus: 24,
};

/**
 * Hard cap on pending notifications per category. iOS only keeps 64 pending
 * local notifications per app and silently drops the rest, so the three
 * categories together have to stay comfortably under that.
 */
export const MAX_OCCURRENCES: Record<ReminderCategory, number> = {
  hydration: 16,
  sleep: 7,
  focus: 12,
};

/** The three categories, in display order. */
export const REMINDER_CATEGORIES: readonly ReminderCategory[] = ['hydration', 'sleep', 'focus'];

/**
 * Seeded defaults: hydration every 90 minutes, bedtime at 11:00 PM, focus nudge
 * every 45 minutes during a 9–5 work session.
 *
 * All three start enabled. The OS permission prompt is the real gate —
 * `scheduleReminder` schedules nothing until the user grants notifications — so
 * enabling by default makes the feature work on first launch rather than
 * looking broken. Onboarding can turn categories off later.
 */
export const DEFAULT_SETTINGS: ReminderSettings = {
  hydration: {
    enabled: true,
    intervalMinutes: 90,
  },
  sleep: {
    enabled: true,
    time: { hour: 23, minute: 0 },
  },
  focus: {
    enabled: true,
    intervalMinutes: 45,
    sessionStart: { hour: 9, minute: 0 },
    sessionEnd: { hour: 17, minute: 0 },
  },
};

/* -------------------------------------------------------------------------- */
/* Time helpers                                                               */
/* -------------------------------------------------------------------------- */

/** Rounds and clamps an interval into {@link MIN_INTERVAL_MINUTES}–{@link MAX_INTERVAL_MINUTES}. */
export function clampInterval(minutes: number): number {
  if (!Number.isFinite(minutes)) return MIN_INTERVAL_MINUTES;
  return Math.min(MAX_INTERVAL_MINUTES, Math.max(MIN_INTERVAL_MINUTES, Math.round(minutes)));
}

/** Coerces arbitrary input into a valid {@link TimeOfDay}. */
export function normalizeTime(time: TimeOfDay): TimeOfDay {
  const hour = Number.isFinite(time.hour) ? Math.trunc(time.hour) : 0;
  const minute = Number.isFinite(time.minute) ? Math.trunc(time.minute) : 0;
  return {
    hour: Math.min(23, Math.max(0, hour)),
    minute: Math.min(59, Math.max(0, minute)),
  };
}

/** Minutes elapsed since local midnight. */
function toMinuteOfDay(time: TimeOfDay): number {
  return time.hour * 60 + time.minute;
}

/**
 * Local midnight of the day `dayOffset` days from `from`.
 *
 * Uses `setDate` rather than millisecond arithmetic so DST transitions land on
 * the correct calendar day.
 */
function startOfDay(from: Date, dayOffset: number): Date {
  const date = new Date(from);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  return date;
}

/* -------------------------------------------------------------------------- */
/* Occurrence planning                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Fixed-interval times across the whole horizon, starting one interval from now.
 *
 * Used for hydration, which has no window — it just ticks along all day.
 */
function planIntervalOccurrences(settings: HydrationSettings, now: Date): Date[] {
  const stepMs = clampInterval(settings.intervalMinutes) * MINUTE_MS;
  const horizonEnd = now.getTime() + HORIZON_HOURS.hydration * 60 * MINUTE_MS;
  const limit = MAX_OCCURRENCES.hydration;

  const occurrences: Date[] = [];
  for (
    let at = now.getTime() + stepMs;
    at <= horizonEnd && occurrences.length < limit;
    at += stepMs
  ) {
    occurrences.push(new Date(at));
  }
  return occurrences;
}

/** The bedtime reminder, once per day for as many days as the horizon covers. */
function planDailyOccurrences(settings: SleepSettings, now: Date): Date[] {
  const time = normalizeTime(settings.time);
  const limit = MAX_OCCURRENCES.sleep;
  const days = Math.min(limit, Math.ceil(HORIZON_HOURS.sleep / 24));

  const occurrences: Date[] = [];
  // Start at today: if the time has already passed, the `> now` check drops it
  // and the loop picks up tomorrow instead. The extra `<= days` iteration keeps
  // the batch at full size on those days.
  for (let day = 0; day <= days && occurrences.length < limit; day += 1) {
    const at = startOfDay(now, day);
    at.setHours(time.hour, time.minute, 0, 0);
    if (at.getTime() > now.getTime()) {
      occurrences.push(at);
    }
  }
  return occurrences;
}

/**
 * Fixed-interval times, but only inside the work session.
 *
 * The first nudge of a session lands one interval *after* the start (nudging
 * someone the moment they sit down is noise) and nothing fires past the end. A
 * session whose end is not after its start is treated as running overnight into
 * the following day, which is why planning starts a day in the past — an
 * overnight session that began yesterday can still have nudges due today.
 */
function planFocusOccurrences(settings: FocusSettings, now: Date): Date[] {
  const step = clampInterval(settings.intervalMinutes);
  const start = toMinuteOfDay(normalizeTime(settings.sessionStart));
  const rawEnd = toMinuteOfDay(normalizeTime(settings.sessionEnd));
  const end = rawEnd > start ? rawEnd : rawEnd + MINUTES_PER_DAY;

  const limit = MAX_OCCURRENCES.focus;
  const horizonEnd = now.getTime() + HORIZON_HOURS.focus * 60 * MINUTE_MS;
  const lastDay = Math.ceil(HORIZON_HOURS.focus / 24) + 1;

  const occurrences: Date[] = [];
  for (let day = -1; day <= lastDay; day += 1) {
    const midnight = startOfDay(now, day).getTime();

    for (let offset = start + step; offset <= end; offset += step) {
      const at = midnight + offset * MINUTE_MS;
      if (at <= now.getTime()) continue;
      if (at > horizonEnd) break;
      occurrences.push(new Date(at));
      if (occurrences.length >= limit) return occurrences;
    }
  }
  return occurrences;
}

/**
 * The times a category should next fire, soonest first.
 *
 * Always in the future relative to `now`, never longer than the category's
 * {@link MAX_OCCURRENCES} cap, and never beyond its {@link HORIZON_HOURS}.
 *
 * @param category Which reminder to plan.
 * @param settings Current settings for all categories.
 * @param now      Reference time. Injectable so the planning is testable.
 */
export function planOccurrences(
  category: ReminderCategory,
  settings: ReminderSettings,
  now: Date = new Date(),
): Date[] {
  switch (category) {
    case 'hydration':
      return planIntervalOccurrences(settings.hydration, now);
    case 'sleep':
      return planDailyOccurrences(settings.sleep, now);
    case 'focus':
      return planFocusOccurrences(settings.focus, now);
  }
}
