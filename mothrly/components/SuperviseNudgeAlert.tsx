import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Character from './Character';

import { colors, fonts, radius, spacing } from '@/lib/theme';
import useSuperviseStore, { formatMinutes, isNudgeFresh } from '@/store/superviseStore';

/**
 * The supervise-mode alert: Mothrly appearing over whatever the user is doing to
 * mention how long they have been in an app.
 *
 * Purely a view onto `superviseStore.activeNudge`, which means it has exactly one
 * code path — a nudge raised by real detection and one raised by the demo menu
 * arrive here identically, animation included.
 *
 * Mount once from the root layout, not from a screen: a nudge can be raised while
 * the user is on any tab.
 */

/** Spring that brings the card up. Slightly soft, to stay in character. */
const ENTER_SPRING = { damping: 18, stiffness: 180, mass: 0.9 } as const;

/** Exit is a plain fade-down — quicker than the entrance, so dismissing feels crisp. */
const EXIT_MS = 180;

/** How far the card travels on its way in. */
const TRAVEL = 48;

export default function SuperviseNudgeAlert() {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  const activeNudge = useSuperviseStore((state) => state.activeNudge);
  const dismissNudge = useSuperviseStore((state) => state.dismissNudge);

  // A persisted nudge can be hours old by the time the app is reopened. The
  // store prunes stale ones on rehydrate; this is the belt-and-braces check.
  const nudge = activeNudge && isNudgeFresh(activeNudge) ? activeNudge : null;

  // 0 hidden, 1 fully shown. Drives both the backdrop and the card so they move
  // as one.
  const progress = useSharedValue(0);

  /**
   * Plays the exit, then clears the nudge.
   *
   * Ordered this way so the card animates out with its content intact rather
   * than vanishing the instant the store slot empties.
   *
   * A plain function declared above the entrance effect, rather than a
   * `useCallback` below it: the React Compiler lint rules reject writing a shared
   * value that an earlier hook in the body has already captured.
   */
  function dismiss() {
    if (reducedMotion) {
      dismissNudge();
      return;
    }

    progress.value = withTiming(
      0,
      { duration: EXIT_MS, easing: Easing.out(Easing.quad) },
      (finished) => {
        // Skipped when a new nudge interrupted the exit — that animation now
        // owns `progress`, and clearing the store would drop its nudge.
        if (finished) runOnJS(dismissNudge)();
      },
    );
  }

  // Animates in whenever a nudge appears. No exit branch here: dismissal plays
  // the exit first and clears the store afterwards (see `dismiss`), so by the
  // time `nudge` goes null the card is already invisible and can just unmount.
  useEffect(() => {
    if (!nudge) return;
    progress.value = reducedMotion ? 1 : withSpring(1, ENTER_SPRING);
  }, [nudge, progress, reducedMotion]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value * 0.45,
  }));

  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: interpolate(progress.value, [0, 1], [TRAVEL, 0]) }],
  }));

  if (!nudge) return null;

  const timeLabel = formatMinutes(nudge.minutes);

  return (
    // `box-none` on the wrapper keeps the untouched areas of the screen inert
    // while still letting the backdrop and card take presses.
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        onPress={dismiss}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View
        accessibilityViewIsModal
        accessibilityLiveRegion="assertive"
        style={[
          styles.cardWrapper,
          { paddingBottom: insets.bottom + spacing.lg, paddingTop: insets.top + spacing.lg },
          cardStyle,
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.card}>
          <Character size={96} />

          <View style={styles.appRow}>
            <View style={[styles.tile, { backgroundColor: nudge.color }]}>
              <Text style={styles.tileInitial}>{nudge.initial}</Text>
            </View>
            <Text style={styles.appMeta}>
              {nudge.appName} · {timeLabel} today
            </Text>
          </View>

          <Text style={styles.message}>{nudge.message}</Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Alright, putting it down"
            onPress={dismiss}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.primaryLabel}>Alright, putting it down</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Five more minutes"
            onPress={dismiss}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryLabel}>Five more minutes</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

const TILE_SIZE = 28;

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: colors.primaryDark,
  },
  cardWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.md,
  },
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
    // Lifts the card off the dimmed screen behind it.
    elevation: 8,
    shadowColor: colors.primaryDark,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileInitial: {
    color: colors.background,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  appMeta: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.text,
  },
  message: {
    fontFamily: fonts.regular,
    fontSize: 19,
    lineHeight: 27,
    color: colors.text,
    textAlign: 'center',
  },
  primaryButton: {
    alignSelf: 'stretch',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  primaryLabel: {
    // Cream on coral, kept at bold 19px so it clears the 3:1 large-text
    // threshold — the same pairing the Settings buttons use.
    color: colors.background,
    fontFamily: fonts.bold,
    fontSize: 19,
  },
  secondaryButton: {
    alignSelf: 'stretch',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  secondaryLabel: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: 15,
  },
  pressed: {
    opacity: 0.85,
  },
});
