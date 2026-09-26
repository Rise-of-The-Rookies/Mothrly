/**
 * The four Mothrly personas, as data.
 *
 * A persona is nothing but a row in {@link PERSONAS}: an id, a name, an accent
 * colour, a paywall flag, and its copy. Nothing in the app branches on *which*
 * persona is active — the scheduler, the supervise nudge and the Home bubble all
 * look up copy by id through `lib/reminderMessages.ts`. Adding a fifth persona
 * means adding an entry here and nothing else.
 *
 * This module is deliberately dependency-free (no stores, no `lib/`), so it can
 * be imported from anywhere without risking an import cycle. The active id lives
 * in `store/personaStore.ts`.
 */

/** Stable persona identifiers. Persisted, so treat these strings as a schema. */
export type PersonaId = 'strict' | 'gentle' | 'funny' | 'motivational';

/**
 * Copy buckets a persona provides.
 *
 * The first three line up with the scheduler's `ReminderCategory`; `supervise` is
 * the odd one out because supervise-mode nudges are templates rather than
 * finished lines — see {@link PersonaMessages.supervise}.
 */
export type PersonaMessageCategory = 'hydration' | 'sleep' | 'focus' | 'supervise';

export type PersonaMessages = {
  /** Drink-some-water nudges. */
  hydration: readonly string[];
  /** Bedtime and wind-down nudges. */
  sleep: readonly string[];
  /** Mid-session "are you still on task" nudges. */
  focus: readonly string[];
  /**
   * Supervise-mode nudges, as templates. `{app}` is substituted with the app
   * name and `{time}` with the time spent in it today, already formatted
   * (e.g. `32m`, `1h 12m`). Every line must contain both placeholders.
   */
  supervise: readonly string[];
};

export type Persona = {
  id: PersonaId;
  /** Display name, as shown on the Personas screen. */
  name: string;
  /** Accent colour for this persona's card and active state, as a hex string. */
  accentColor: string;
  /** Whether unlocking this persona needs the `premium_personas` entitlement. */
  isPremium: boolean;
  messages: PersonaMessages;
};

/**
 * Every persona, in display order.
 *
 * Free personas come first so the Personas screen leads with what the user
 * already has rather than with a paywall.
 */
export const PERSONAS: readonly Persona[] = [
  {
    id: 'strict',
    name: 'Strict',
    accentColor: '#A8342A',
    isPremium: false,
    messages: {
      hydration: [
        'Water. Now. No excuses.',
        'You have gone too long without a drink. Fix it.',
        'Glass of water, this minute. I am not asking twice.',
      ],
      sleep: [
        'Bed. It is late and you know it.',
        'Screens off. Lights out. Tomorrow starts whether you sleep or not.',
        'You set this bedtime. Honour it.',
      ],
      focus: [
        'Eyes on the task. You are drifting.',
        'Is this the work you sat down to do? Answer honestly.',
        'Stop wandering and finish what you started.',
      ],
      supervise: [
        '{time} on {app} today. That is wasted time and you know it.',
        'Put {app} down. {time} is already more than enough.',
        '{app}, {time}. Close it and get back to something that matters.',
      ],
    },
  },
  {
    id: 'gentle',
    name: 'Gentle',
    accentColor: '#7C9F5F',
    isPremium: false,
    messages: {
      hydration: [
        'A little water would do you good, dear.',
        'Just a sip when you get a moment. No rush.',
        'Your body has been asking politely for a drink.',
      ],
      sleep: [
        "It's getting late, love. Time to start winding down.",
        'Let today be finished. You have done enough.',
        'Off to bed now — tomorrow will still be there in the morning.',
      ],
      focus: [
        'Still on task, dear? Only checking.',
        'Take a breath, then look at what is in front of you.',
        'A gentle nudge back to the thing that matters.',
      ],
      supervise: [
        "That's {time} on {app} today, dear. Shall we find something else?",
        '{app} has had {time} of your day. Might be time to put it down.',
        '{time} of {app} today, love. I only mention it because you asked me to.',
      ],
    },
  },
  {
    id: 'funny',
    name: 'Funny',
    accentColor: '#E08A2E',
    isPremium: true,
    messages: {
      hydration: [
        'You are roughly 60% water and the tank is reading low.',
        'Plants get watered. You are a plant with opinions. Drink.',
        'Breaking news: local person discovers tap. Go on then.',
      ],
      sleep: [
        'Your bed filed a missing person report.',
        'Nothing good has ever been invented after midnight. Off you go.',
        'The internet will still be broken tomorrow. Sleep.',
      ],
      focus: [
        'You opened one tab. There are now eleven. Classic.',
        'That task is right there, looking at you. Awkward.',
        'Sorry to interrupt whatever this is. What were you meant to be doing?',
      ],
      supervise: [
        '{time} on {app}. Your thumb has done more cardio than your legs.',
        '{app} for {time} today. It is not even that good, be honest.',
        '{time}. {app}. I am not judging, I am simply reading it out loud.',
      ],
    },
  },
  {
    id: 'motivational',
    name: 'Motivational',
    accentColor: '#3F7FA6',
    isPremium: true,
    messages: {
      hydration: [
        'Water first, then everything else. Fuel the machine.',
        'One glass now and you will feel sharper in ten minutes. Go.',
        'Small win, available right now: drink up.',
      ],
      sleep: [
        'Rest is where today\u2019s work actually sticks. Go get it.',
        'Tomorrow needs you at full strength. Start now by sleeping.',
        'You showed up today. Close it out properly and rest.',
      ],
      focus: [
        'One task. Full attention. You have done harder things.',
        'Come back to it — momentum is easier to keep than to rebuild.',
        'The next ten minutes are yours. Make them count.',
      ],
      supervise: [
        '{time} on {app}. Imagine that time pointed at your goal instead.',
        'You have already given {app} {time} today. Take the rest back.',
        '{time} in {app} — close it and spend the next ten minutes on you.',
      ],
    },
  },
];

/** The persona a fresh install starts on. */
export const DEFAULT_PERSONA_ID: PersonaId = 'gentle';

/** Every persona id, in display order. */
export const PERSONA_IDS: readonly PersonaId[] = PERSONAS.map((persona) => persona.id);

/** Lookup table behind {@link getPersona}. */
const BY_ID: Record<PersonaId, Persona> = Object.fromEntries(
  PERSONAS.map((persona) => [persona.id, persona]),
) as Record<PersonaId, Persona>;

/** Whether an arbitrary value is a known persona id. Use when reading stored state. */
export function isPersonaId(value: unknown): value is PersonaId {
  return typeof value === 'string' && value in BY_ID;
}

/**
 * The persona with the given id.
 *
 * Falls back to the default persona for an unrecognised id rather than throwing,
 * so a stale persisted id can never leave the app without copy to show.
 */
export function getPersona(id: PersonaId): Persona {
  return BY_ID[id] ?? BY_ID[DEFAULT_PERSONA_ID];
}

/**
 * Copy for one of a persona's categories.
 *
 * Guaranteed non-empty for every persona and category, so callers can index into
 * the result without a fallback.
 */
export function personaMessages(
  id: PersonaId,
  category: PersonaMessageCategory,
): readonly string[] {
  return getPersona(id).messages[category];
}
