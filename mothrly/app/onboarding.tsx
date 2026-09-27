import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Character from '@/components/Character';
import PressableScale from '@/components/PressableScale';
import { motion, softInOut } from '@/lib/motion';
import { initNotifications } from '@/lib/notifications';
import { colors, fonts, radius, spacing } from '@/lib/theme';
import useOnboardingStore from '@/store/onboardingStore';
import { useActivePersona } from '@/store/personaStore';
import useReminderStore from '@/store/reminderStore';

/**
 * First-launch onboarding: three slides, then Home.
 *
 * Reachable only while `hasOnboarded` is false — the guard lives in
 * `app/_layout.tsx`, which also means finishing here is what makes the tab group
 * reachable. This screen never navigates by hand; flipping the flag is the
 * navigation.
 *
 * Built on a paging `ScrollView` rather than a pager library: three slides don't
 * need virtualising, and `react-native-pager-view` is native code, which would
 * cost this project a new development build to add.
 */

type Slide = {
  /** Stable key, also used in the pagination dots' accessibility labels. */
  id: string;
  headline: string;
  subtext: string;
};

const SLIDES: readonly Slide[] = [
  {
    id: 'company',
    headline: "Someone's got your back",
    subtext: 'Living far from home is a lot to carry alone. Mothrly sits with you through it.',
  },
  {
    id: 'reminders',
    headline: "She'll remind you of the little things",
    subtext: 'Water, sleep, and getting back to work — a nudge at the right moment, never a nag.',
  },
  {
    id: 'control',
    headline: "You're always in control",
    subtext: 'Turn supervise mode off whenever you like, and choose the mood she speaks in.',
  },
] as const;

const LAST_INDEX = SLIDES.length - 1;

/** Used for the pagination dots, whose width and colour are both animated. */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  // Matches Home, so the character the user meets here is the one that greets
  // them on the other side rather than changing colour on arrival.
  const persona = useActivePersona();

  const completeOnboarding = useOnboardingStore((state) => state.completeOnboarding);
  const completeSetup = useReminderStore((state) => state.completeSetup);

  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  /** Scrolls to a slide and moves the dots with it. */
  const goTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(LAST_INDEX, next));
      // Set state here as well as in `onMomentumScrollEnd`: a programmatic scroll
      // does not always emit a momentum event, so the dots would otherwise lag
      // behind a tap-to-advance.
      setIndex(clamped);
      scrollRef.current?.scrollTo({ x: clamped * width, animated: true });
    },
    [width],
  );

  const handleMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (width <= 0) return;
      setIndex(Math.round(event.nativeEvent.contentOffset.x / width));
    },
    [width],
  );

  const handleGetStarted = useCallback(async () => {
    if (busy) return;
    setBusy(true);

    // The permission prompt is the one thing worth waiting on — the user tapped
    // a button and an OS dialog is about to cover the screen, so leaving them on
    // this slide until they have answered it keeps the sequence legible.
    // `initNotifications` resolves false on a denial rather than throwing, and
    // onboarding finishes either way: reminders are the part that degrades, not
    // the app.
    await initNotifications();

    // Plans the seeded reminder schedules. Deliberately not awaited — it is a
    // batch of scheduling calls with nothing left to show the user, and it also
    // sets `hasCompletedSetup`, which is what lets scheduling run from here on.
    completeSetup().catch((error: unknown) => {
      console.warn('[onboarding] Could not plan the first reminders', error);
    });

    // Flips the guard in the root layout: this route becomes unreachable and the
    // router redirects to the tab group, landing on Home.
    completeOnboarding();
  }, [busy, completeOnboarding, completeSetup]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleMomentumEnd}
        // Without this the slides keep their old widths through a rotation.
        contentContainerStyle={{ width: width * SLIDES.length }}
        style={styles.pager}
      >
        {SLIDES.map((slide, slideIndex) => {
          const isLast = slideIndex === LAST_INDEX;

          return (
            <Pressable
              key={slide.id}
              // Tap anywhere to advance. Not an accessibility element itself —
              // the copy below stays plain readable text, and the dots are the
              // control screen readers get — and a no-op on the last slide,
              // where the button is the only way forward.
              accessible={false}
              importantForAccessibility="no"
              disabled={isLast}
              onPress={() => goTo(slideIndex + 1)}
              style={[styles.slide, { width }]}
            >
              <View style={styles.characterCard}>
                {/* Breathing left on: only one slide is ever on screen, so there
                    is no grid of blobs to look restless. */}
                <Character color={persona.accentColor} decorative />
              </View>

              <View style={styles.copy}>
                <Text style={styles.headline}>{slide.headline}</Text>
                <Text style={styles.subtext}>{slide.subtext}</Text>
              </View>

              {/* Reserved on every slide, not just the last, so the character
                  and copy sit at the same height as the user swipes. */}
              <View style={styles.actionSlot}>
                {isLast ? (
                  <PressableScale
                    accessibilityRole="button"
                    accessibilityLabel="Get started"
                    accessibilityHint="Asks permission to send reminders, then opens Mothrly"
                    accessibilityState={{ disabled: busy, busy }}
                    disabled={busy}
                    onPress={handleGetStarted}
                    style={[styles.button, busy && styles.buttonDisabled]}
                  >
                    <Text style={styles.buttonLabel}>{busy ? 'One moment…' : 'Get started'}</Text>
                  </PressableScale>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <View accessibilityRole="tablist" style={styles.dots}>
        {SLIDES.map((slide, slideIndex) => (
          <Dot
            key={slide.id}
            active={slideIndex === index}
            label={`Slide ${slideIndex + 1} of ${SLIDES.length}: ${slide.headline}`}
            onPress={() => goTo(slideIndex)}
          />
        ))}
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */

type DotProps = {
  active: boolean;
  /** Spoken label. Carries the slide's headline so the dots are navigable blind. */
  label: string;
  onPress: () => void;
};

/**
 * One pagination dot, which stretches into a pill while its slide is showing.
 *
 * Both the width and the colour animate, so the indicator slides along with the
 * slides instead of snapping a step behind them. Width is animated rather than
 * scale: scaling an 8pt dot to 24pt would smear its rounded ends.
 */
function Dot({ active, label, onPress }: DotProps) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    const target = active ? 1 : 0;
    progress.value = reducedMotion
      ? target
      : withTiming(target, { duration: motion.color.duration, easing: softInOut });
  }, [active, progress, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: DOT_SIZE + progress.value * (DOT_ACTIVE_WIDTH - DOT_SIZE),
    backgroundColor: interpolateColor(progress.value, [0, 1], [colors.border, colors.primary]),
  }));

  return (
    <AnimatedPressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      // The dot itself is 8pt tall; the slop is what makes the target big enough
      // to hit, and gives screen readers a way through the slides.
      hitSlop={spacing.md}
      onPress={onPress}
      style={[styles.dot, animatedStyle]}
    />
  );
}

/** Diameter of an inactive dot. */
const DOT_SIZE = 8;

/** Width the active dot stretches to. */
const DOT_ACTIVE_WIDTH = 24;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  pager: {
    flex: 1,
  },

  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.xl,
  },
  characterCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    // Generous vertical padding leaves the blob room to breathe without clipping
    // at the top of its scale.
    paddingVertical: spacing.xl,
  },
  copy: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  headline: {
    fontFamily: fonts.bold,
    fontSize: 28,
    lineHeight: 34,
    color: colors.text,
    textAlign: 'center',
  },
  subtext: {
    fontFamily: fonts.regular,
    fontSize: 16,
    lineHeight: 24,
    color: colors.text,
    textAlign: 'center',
  },

  actionSlot: {
    alignSelf: 'stretch',
    // The primary button's own height, held open on the slides without one.
    minHeight: 48,
    justifyContent: 'center',
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonLabel: {
    color: colors.background,
    fontFamily: fonts.bold,
    fontSize: 19,
  },

  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  dot: {
    // Width and colour are animated; height stays fixed so the row's baseline
    // doesn't shift as the active dot moves along it.
    height: DOT_SIZE,
    borderRadius: radius.pill,
  },
});
