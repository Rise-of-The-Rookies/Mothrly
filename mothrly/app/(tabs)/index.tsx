import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Character from '@/components/Character';
import {
  DropletIcon,
  type IconProps,
  MoonIcon,
  SettingsIcon,
  TargetIcon,
} from '@/components/Icons';
import {
  CATEGORY_LABELS,
  formatAgoLabel,
  formatDueLabel,
  reminderHighlight,
} from '@/lib/nextReminder';
import { colors, fonts, radius, spacing } from '@/lib/theme';
import { useActivePersona } from '@/store/personaStore';
import useReminderStore from '@/store/reminderStore';

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

  // First launch: ask for notification permission, then plan the seeded
  // schedules. Idempotent, so the effect re-running is harmless.
  useEffect(() => {
    completeSetup();
  }, [completeSetup]);

  const highlight = useMemo(
    () => reminderHighlight({ hydration, sleep, focus }, lastFired, now, persona.id),
    [hydration, sleep, focus, lastFired, now, persona.id],
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            accessibilityHint="Opens the settings screen"
            hitSlop={spacing.sm}
            onPress={() => router.navigate('/settings')}
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
          >
            <SettingsIcon />
          </Pressable>
        </View>

        <View style={styles.characterCard}>
          <Character color={persona.accentColor} />
        </View>

        <View style={styles.bubble}>
          {/* Tail, pointing back up at the character. */}
          <View style={styles.bubbleTail} />
          {highlight ? (
            <>
              <Text style={styles.bubbleMessage}>{highlight.message}</Text>
              <Text style={styles.bubbleMeta}>
                {CATEGORY_LABELS[highlight.category]} ·{' '}
                {highlight.kind === 'fired'
                  ? formatAgoLabel(highlight.at, now)
                  : formatDueLabel(highlight.at, now)}
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.bubbleMessage}>
                All quiet for now. Turn a reminder back on whenever you would like a nudge.
              </Text>
              <Text style={styles.bubbleMeta}>No reminders scheduled</Text>
            </>
          )}
        </View>

        <View style={styles.chipRow}>
          <StatusChip icon={DropletIcon} label="Hydration" value={MOCK_STATUS.hydration} />
          <StatusChip icon={MoonIcon} label="Sleep" value={MOCK_STATUS.sleep} />
          <StatusChip icon={TargetIcon} label="Focus" value={MOCK_STATUS.focus} />
        </View>

        <View style={styles.superviseRow}>
          <View style={styles.superviseCopy}>
            <Text style={styles.superviseLabel}>Supervise mode</Text>
            <Text style={styles.superviseHint}>Mothrly checks in after each nudge.</Text>
          </View>
          <Switch
            accessibilityLabel="Supervise mode"
            accessibilityHint="Lets Mothrly follow up after each reminder"
            value={superviseMode}
            onValueChange={setSuperviseMode}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.background}
            ios_backgroundColor={colors.border}
          />
        </View>
      </ScrollView>
    </View>
  );
}

/* -------------------------------------------------------------------------- */

type StatusChipProps = {
  icon: (props: IconProps) => React.ReactElement;
  label: string;
  value: string;
};

/** One of the three at-a-glance tiles under the speech bubble. */
function StatusChip({ icon: Icon, label, value }: StatusChipProps) {
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={styles.chip}>
      <Icon size={20} color={colors.primary} />
      <Text style={styles.chipLabel}>{label}</Text>
      <Text style={styles.chipValue}>{value}</Text>
    </View>
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
  chip: {
    flex: 1,
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
});
