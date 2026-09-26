/**
 * Design tokens for Mothrly.
 *
 * Single source of truth for colour and typography values. Import these rather
 * than hard-coding hex strings in `StyleSheet.create` calls.
 */

export const colors = {
  /** App-wide screen background (cream). */
  background: '#FBF3EA',
  /** Raised surface background for cards, sheets and list rows. */
  card: '#F5E9DC',
  /** Primary accent — coral/terracotta. Used for primary buttons and active states. */
  primary: '#D85A30',
  /** Darker shade of the primary accent. Use for text/icons sitting on `primary`. */
  primaryDark: '#712B13',
  /** Secondary accent — sage green. Used for success and supportive states. */
  secondary: '#639922',
  /** Default body copy colour. */
  text: '#4A3428',
  /** De-emphasised copy: captions, hints, placeholders. */
  textMuted: '#8A7A6D',
  /** Hairline borders and dividers. */
  border: '#E4D9CC',
} as const;

/**
 * Font family names, as registered by `useFonts` in `app/_layout.tsx`.
 *
 * Nunito — a rounded, friendly sans — loaded at runtime from
 * `@expo-google-fonts/nunito`.
 *
 * Each weight is a **separate family name**, not a weight of one family:
 * declaring multiple faces under a single family needs SDK 58 and this project
 * is on 57. Two consequences for anything styling text:
 *
 * 1. Set `fontFamily` to pick a weight. Reach for {@link fonts.bold}, not
 *    `fontWeight: '700'`.
 * 2. Do not also set `fontWeight`. Asking for a heavy weight on a face that is
 *    already heavy is what makes the platform synthesise a faux bold, which
 *    looks smeared next to the real thing.
 */
export const fonts = {
  /** Body copy and anything unemphasised. */
  regular: 'Nunito_400Regular',
  /** Labels and mild emphasis. Semi-bold, despite the `medium` key. */
  medium: 'Nunito_600SemiBold',
  /** Titles, buttons and strong emphasis. */
  bold: 'Nunito_700Bold',
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export type Colors = typeof colors;
