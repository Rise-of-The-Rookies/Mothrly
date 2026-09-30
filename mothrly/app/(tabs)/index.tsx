import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';

import Character from '@/components/Character';
import FadeSlideIn from '@/components/FadeSlideIn';
import GifPickerModal from '@/components/GifPickerModal';
import {
  DropletIcon,
  type IconProps,
  MoonIcon,
  SettingsIcon,
  TargetIcon,
  PlayIcon,
  FlameIcon,
} from '@/components/Icons';
import PressableScale from '@/components/PressableScale';
import {
  CATEGORY_LABELS,
  formatAgoLabel,
  formatDueLabel,
  reminderHighlight,
  type ReminderHighlight,
} from '@/lib/nextReminder';
import { colors, fonts, radius, spacing } from '@/lib/theme';
import {
  type NotificationPermission,
  useNotificationPermission,
} from '@/lib/useNotificationPermission';
import usePersonaStore, { useActivePersona } from '@/store/personaStore';
import useReminderStore from '@/store/reminderStore';
import useStatsStore, { type Mood } from '@/store/statsStore';

/**
 * Home: the character, what it wants to tell you next, and today at a glance.
 *
 * The greeting and the next-due reminder are both derived from the current time,
 * so the screen keeps a slow ticking clock (see {@link TICK_MS}) rather than
 * rendering a value that silently goes stale while the app sits open.
 */

/** How often the derived time values refresh. A minute is as precise as the copy gets. */
const TICK_MS = 60_000;

/** Placeholder tracker values. Real tracking replaces these later. */
const MOCK_STATUS = {
  hydration: '4 of 8',
  sleep: '7h 20m',
  focus: '2 sessions',
} as const;

function greetingFor(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Subscribed per-slice so an unrelated store write (scheduled ids, supervise
  // mode) doesn't re-plan occurrences.
  const hydration = useReminderStore((state) => state.hydration);
  const sleep = useReminderStore((state) => state.sleep);
  const focus = useReminderStore((state) => state.focus);
  const superviseMode = useReminderStore((state) => state.superviseMode);
  const setSuperviseMode = useReminderStore((state) => state.setSuperviseMode);
  const lastFired = useReminderStore((state) => state.lastFired);
  const completeSetup = useReminderStore((state) => state.completeSetup);

  // Drives both halves of the character's presence here: the blob's colour and
  // the voice in the bubble. Subscribed to the id alone, so this re-renders when
  // the user switches mood on the picker and not for anything else.
  const persona = useActivePersona();
  const voiceId = usePersonaStore((state) => state.voiceId);

  // Reminders are planned from settings alone, so without this the bubble would
  // promise a nudge that the OS will never deliver.
  const notificationPermission = useNotificationPermission();

  // First launch: ask for notification permission, then plan the seeded
  // schedules. Idempotent, so the effect re-running is harmless.
  useEffect(() => {
    completeSetup();
  }, [completeSetup]);

  const currentStreak = useStatsStore((state) => state.currentStreak);
  const getTodayMood = useStatsStore((state) => state.getTodayMood);
  const getTodayMoodImage = useStatsStore((state) => state.getTodayMoodImage);
  const logMood = useStatsStore((state) => state.logMood);
  const logMoodImage = useStatsStore((state) => state.logMoodImage);
  const acknowledgeReminder = useStatsStore((state) => state.acknowledgeReminder);
  const checkStreak = useStatsStore((state) => state.checkStreak);

  const [gifModalVisible, setGifModalVisible] = useState(false);

  // Check if streak is broken on mount or day change
  useEffect(() => {
    checkStreak();
  }, [now, checkStreak]);

  const todayMood = getTodayMood();
  const todayMoodImage = getTodayMoodImage();

  const pickMoodImage = () => {
    setGifModalVisible(true);
  };

  const highlight = useMemo(
    () => reminderHighlight({ hydration, sleep, focus }, lastFired, now, persona.id),
    [hydration, sleep, focus, lastFired, now, persona.id],
  );

  // What the bubble says, and the small print under it. Three states, in
  // precedence order — see `bubbleContent`.
  const bubble = useMemo(
    () => bubbleContent(highlight, notificationPermission, now),
    [highlight, notificationPermission, now],
  );

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.md, paddingBottom: spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <Text style={styles.greeting}>{greetingFor(now)}</Text>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Settings"
            accessibilityHint="Opens the settings screen"
            hitSlop={spacing.sm}
            onPress={() => router.navigate('/settings')}
            style={styles.iconButton}
            pressedStyle={styles.iconButtonPressed}
          >
            <SettingsIcon />
          </PressableScale>
        </View>

        {/* Indices below are one running sequence rather than per-group, so the
            screen arrives as a single cascade from the character downwards. */}
        <FadeSlideIn index={0} style={styles.characterCard}>
          <Character color={persona.accentColor} />
        </FadeSlideIn>

        <FadeSlideIn index={1} style={styles.bubble}>
          <View style={styles.bubbleTail} />
          <View style={styles.bubbleHeaderRow}>
            <Text style={[styles.bubbleMessage, { flex: 1 }]}>{bubble.message}</Text>
            <View style={{ flexDirection: 'row', gap: spacing.xs }}>
              {highlight?.kind === 'fired' && (
                <PressableScale
                  onPress={acknowledgeReminder}
                  style={styles.ackButton}
                >
                  <Text style={styles.ackButtonText}>Got it</Text>
                </PressableScale>
              )}
              {voiceId && (
                <PressableScale 
                  onPress={() => {
                    Speech.stop();
                    Speech.speak(bubble.message, { voice: voiceId });
                  }}
                  style={styles.playButton}
                  hitSlop={8}
                >
                  <PlayIcon size={20} color={colors.primary} />
                </PressableScale>
              )}
            </View>
          </View>
          <Text style={styles.bubbleMeta}>{bubble.meta}</Text>
        </FadeSlideIn>

        <View style={styles.chipRow}>
          <StatusChip
            index={2}
            icon={FlameIcon}
            label="Streak"
            value={`${currentStreak} days`}
          />
          <StatusChip
            index={3}
            icon={DropletIcon}
            label="Hydration"
            value={MOCK_STATUS.hydration}
          />
          <StatusChip index={4} icon={MoonIcon} label="Sleep" value={MOCK_STATUS.sleep} />
        </View>

        <FadeSlideIn index={4.5} style={styles.moodCard}>
          <View style={styles.moodHeader}>
            <Text style={styles.moodTitle}>How are you feeling today?</Text>
            <PressableScale onPress={pickMoodImage} style={styles.gifButton}>
              <Text style={styles.gifButtonText}>Search GIF 🔍</Text>
            </PressableScale>
          </View>
          
          {todayMoodImage ? (
            <View style={styles.customMoodImageContainer}>
              <Image source={{ uri: todayMoodImage }} style={styles.customMoodImage} />
              <Text style={styles.moodThanks}>Love the emotion! Thanks for checking in.</Text>
            </View>
          ) : (
            <View style={styles.emptyMoodContainer}>
              <Text style={styles.emptyMoodText}>Search for a GIF to express your mood!</Text>
            </View>
          )}
        </FadeSlideIn>

        {/* The whole row toggles, not just the switch: a 44pt-wide target beside
            two lines of copy is the hardest thing on the screen to hit. The switch
            itself is hidden from screen readers and from touch, because the row
            now carries both — announcing it twice, or letting a tap land on either,
            would be two controls for one setting. */}
        <FadeSlideIn index={5}>
          <PressableScale
            accessibilityRole="switch"
            accessibilityLabel="Supervise mode"
            accessibilityHint="Lets Mothrly follow up after each reminder"
            accessibilityState={{ checked: superviseMode }}
            onPress={() => setSuperviseMode(!superviseMode)}
            style={styles.superviseRow}
          >
            <View style={styles.superviseCopy}>
              <Text style={styles.superviseLabel}>Supervise mode</Text>
              <Text style={styles.superviseHint}>Mothrly checks in after each nudge.</Text>
            </View>
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              pointerEvents="none"
            >
              <Switch
                value={superviseMode}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.background}
                ios_backgroundColor={colors.border}
              />
            </View>
          </PressableScale>
        </FadeSlideIn>
      </ScrollView>

      <GifPickerModal
        visible={gifModalVisible}
        onClose={() => setGifModalVisible(false)}
        onSelect={(url) => logMoodImage(url)}
      />
    </View>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Mothrly's line when there is no reminder to report.
 *
 * Deliberately not about reminders at all: the states that land here are the ones
 * where she has nothing scheduled to say, and "no reminders scheduled" is already
 * covered by the meta line underneath.
 */
const DEFAULT_MESSAGE = "I'm here whenever you need me.";

/** What the speech bubble shows. */
type BubbleContent = { message: string; meta: string };

/**
 * Picks the bubble's copy, in precedence order:
 *
 * 1. **Notifications denied.** Checked first, because it outranks being correct
 *    about the schedule: the reminders are genuinely planned, but the OS will not
 *    deliver any of them, and a bubble reading "Hydration · in 20 min" would be a
 *    promise the app cannot keep. This is the state that used to be missing
 *    entirely — reminders would simply never arrive and nothing on screen said why.
 * 2. **A reminder to report** — one that just fired, or the next one due.
 * 3. **Nothing scheduled**, which means every category is switched off.
 *
 * Note that state 3 is *not* the fresh-install case. On a new install all three
 * categories are enabled by default, so `reminderHighlight` returns the first
 * upcoming reminder and the bubble has something to say from the very first
 * render. Reaching state 3 takes turning all three off in Settings.
 */
function bubbleContent(
  highlight: ReminderHighlight | null,
  permission: NotificationPermission,
  now: Date,
): BubbleContent {
  if (permission === 'denied') {
    return {
      message: DEFAULT_MESSAGE,
      meta: 'Notifications are off · turn them on in system settings for nudges',
    };
  }

  if (highlight) {
    return {
      message: highlight.message,
      meta: `${CATEGORY_LABELS[highlight.category]} · ${
        highlight.kind === 'fired'
          ? formatAgoLabel(highlight.at, now)
          : formatDueLabel(highlight.at, now)
      }`,
    };
  }

  return {
    message: DEFAULT_MESSAGE,
    meta: 'No reminders scheduled · turn one on in Settings',
  };
}

/* -------------------------------------------------------------------------- */

type StatusChipProps = {
  icon: (props: IconProps) => React.ReactElement;
  label: string;
  value: string;
  /** Position in the screen's entrance cascade. */
  index: number;
};

/**
 * One of the three at-a-glance tiles under the speech bubble.
 *
 * Not tappable — there is nothing behind a chip yet — so it gets the entrance
 * animation but no press feedback.
 */
function StatusChip({ icon: Icon, label, value, index }: StatusChipProps) {
  return (
    // `flex: 1` moves to the wrapper: it is the row's flex child now, and leaving
    // the flex on the chip inside would let all three collapse to their content.
    <FadeSlideIn index={index} style={styles.chipFlex}>
      <View accessible accessibilityLabel={`${label}: ${value}`} style={styles.chip}>
        <Icon size={20} color={colors.primary} />
        <Text style={styles.chipLabel}>{label}</Text>
        <Text style={styles.chipValue}>{value}</Text>
      </View>
    </FadeSlideIn>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  greeting: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.textMuted,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  iconButtonPressed: {
    backgroundColor: colors.card,
  },

  characterCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    // Generous vertical padding leaves the blob room to breathe without
    // clipping at the top of its scale.
    paddingVertical: spacing.xl,
  },

  bubble: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    // Room for the tail to overlap the top edge.
    marginTop: spacing.xs,
  },
  bubbleTail: {
    position: 'absolute',
    top: -9,
    left: spacing.lg,
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: colors.card,
  },
  bubbleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  playButton: {
    padding: spacing.xs,
    marginLeft: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: radius.pill,
  },
  ackButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginLeft: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    justifyContent: 'center',
  },
  ackButtonText: {
    color: colors.background,
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  bubbleMessage: {
    fontFamily: fonts.regular,
    fontSize: 17,
    lineHeight: 24,
    color: colors.text,
  },
  bubbleMeta: {
    fontFamily: fonts.medium,
    marginTop: spacing.sm,
    fontSize: 13,
    // `primaryDark` rather than `textMuted`: it clears 4.5:1 on the card at this
    // size, which muted does not.
    color: colors.primaryDark,
  },

  chipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  /** Carried by the entrance wrapper, which is the actual child of `chipRow`. */
  chipFlex: {
    flex: 1,
  },
  chip: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    gap: spacing.xs,
  },
  chipLabel: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.text,
  },
  chipValue: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.text,
    textAlign: 'center',
  },

  superviseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  superviseCopy: {
    flex: 1,
    gap: 2,
  },
  superviseLabel: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.text,
  },
  superviseHint: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
  },
  moodCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  moodHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gifButton: {
    backgroundColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  gifButtonText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.text,
  },
  customMoodImageContainer: {
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  customMoodImage: {
    width: 120,
    height: 120,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  moodTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.text,
  },
  emptyMoodContainer: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyMoodText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.textMuted,
  },
  moodThanks: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.primaryDark,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
