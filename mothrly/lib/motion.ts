import { Easing } from 'react-native-reanimated';

/**
 * Motion tokens for Mothrly.
 *
 * The same role `lib/theme.ts` plays for colour and type: durations and curves
 * live here so the whole app moves at one speed, and so "does this feel like the
 * rest of the app?" is answerable by reading one file.
 *
 * The house style is soft and slow. Nothing overshoots, nothing springs, nothing
 * snaps — the character breathes, so the interface around her should feel like it
 * is breathing too. In practice that means:
 *
 * - timing curves rather than springs, because a spring's overshoot is the
 *   cartoonish bounce we are avoiding
 * - ease-in-out almost everywhere, so movement starts and ends gently instead of
 *   arriving at speed
 * - durations in the 250–400ms band, slow enough to read as deliberate
 *
 * The one deliberate exception is the press-in, documented on {@link motion.press}.
 */

/**
 * The house curve: gentle at both ends.
 *
 * `Easing.ease` on its own is ease-in-out-ish but front-loaded; wrapping it in
 * `Easing.inOut` makes the symmetry explicit. Used for the character's breathing,
 * persona colour crossfades, card entrances and press releases.
 *
 * Deliberately *not* `Easing.linear`: constant velocity is what makes an
 * animation read as mechanical, and it is especially obvious on a looping
 * animation like the breath, where the direction changes become visible kinks.
 */
export const softInOut = Easing.inOut(Easing.ease);

/**
 * Decelerating curve — full speed immediately, then settles.
 *
 * Only for the press-in, where the point is to acknowledge the finger at once.
 */
export const softOut = Easing.out(Easing.ease);

export const motion = {
  /**
   * Press feedback on cards and buttons.
   *
   * `in` sits below the 250ms floor the rest of this file keeps to, on purpose.
   * A press-in is not a transition, it is a response: at 250ms the finger has
   * usually lifted before the scale finishes, so the control appears to shrink
   * *after* being released, which reads as lag rather than softness. 140ms with a
   * decelerating curve is fast enough to feel connected and still far too slow to
   * feel like a click. The release then takes its time, which is where the
   * softness actually lives.
   */
  press: {
    in: 140,
    out: 260,
    /**
     * How far a pressed surface sinks. 3% is visible on a large card without
     * making small buttons look like they are collapsing.
     */
    scale: 0.97,
  },

  /** Fade-and-rise for cards arriving on screen. */
  entrance: {
    duration: 320,
    /** Gap between consecutive items in a list, so a group arrives as a cascade. */
    stagger: 50,
    /**
     * How far a card rises as it fades in, in points. Small on purpose — the fade
     * carries the entrance and the travel only gives it a direction.
     */
    travel: 12,
  },

  /** Crossfade for a colour changing in place, such as the persona accent. */
  color: {
    duration: 300,
  },

  /** The character's idle breath. */
  breath: {
    /**
     * Half of the cycle. The animation reverses rather than restarting, so a full
     * inhale-exhale is twice this.
     */
    halfCycle: 1500,
    /** How much the blob grows at the top of a breath. Subtle on purpose. */
    scale: 1.04,
  },

  /** The supervise nudge sliding up over the app. */
  nudge: {
    enter: 340,
    /** Quicker than the entrance, so dismissing feels like it obeyed you. */
    exit: 220,
    /** How far the card travels on its way in. */
    travel: 48,
  },
} as const;
