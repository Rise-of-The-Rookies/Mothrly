import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { triggerSuperviseNudge } from '@/lib/superviseNudge';
import { colors, fonts, radius, spacing } from '@/lib/theme';
import { useUsageAccess } from '@/lib/useUsageSync';
import useReminderStore from '@/store/reminderStore';
import useSuperviseStore, {
  DEMO_SCENARIOS,
  formatMinutes,
  type SuperviseDemoScenario,
  type SuperviseStatus,
} from '@/store/superviseStore';

/**
 * Supervise mode: the master toggle, plus the apps Mothrly keeps an eye on and
 * how long each has been used today.
 *
 * App tiles are drawn from an initial and a palette colour rather than real
 * brand marks — no trademarked assets are bundled. The "+ Add app" row is UI
 * only for now; picking an app needs platform usage permissions we don't have
 * yet.
 *
 * Long-pressing the title opens the demo menu — a hidden affordance for demos and
 * screen recordings, where waiting on real detection is not an option. It is not
 * advertised in the UI or to screen readers because it is not a feature of the
 * app; see {@link triggerSuperviseNudge}.
 */

/** How long the title has to be held before the demo menu opens. */
const DEMO_LONG_PRESS_MS = 800;

/** Copy for the per-row status tag. */
const STATUS_LABEL: Record<SuperviseStatus, string> = {
  live: 'Live',
  preview: 'Preview',
};

export default function SuperviseScreen() {
  const superviseMode = useReminderStore((state) => state.superviseMode);
  const setSuperviseMode = useReminderStore((state) => state.setSuperviseMode);

  const apps = useSuperviseStore((state) => state.apps);
  const minutesToday = useSuperviseStore((state) => state.minutesToday);
  const minutesSource = useSuperviseStore((state) => state.minutesSource);
  const rollOverIfNeeded = useSuperviseStore((state) => state.rollOverIfNeeded);

  // `unsupported` on iOS and in Expo Go, where there is nothing to offer and so
  // nothing about tracking is shown at all.
  const { status: usageAccess } = useUsageAccess();

  const [demoOpen, setDemoOpen] = useState(false);

  // Stored counters can be a day (or a month) old by the time the screen opens.
  useEffect(() => {
    rollOverIfNeeded();
  }, [rollOverIfNeeded]);

  function runScenario(scenario: SuperviseDemoScenario) {
    setDemoOpen(false);

    // Supervise mode being off is a legitimate reason for the real path to stay
    // quiet, so satisfy the precondition here rather than weakening the check
    // inside the trigger. Keeps the demo working from a cold, untouched install.
    setSuperviseMode(true);

    triggerSuperviseNudge(scenario.appId, scenario.minutes, { source: 'demo' });
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="header"
            accessibilityLabel="Supervise mode"
            onLongPress={() => setDemoOpen(true)}
            delayLongPress={DEMO_LONG_PRESS_MS}
            style={styles.titlePress}
          >
            <Text style={styles.title}>Supervise mode</Text>
          </Pressable>
          <Switch
            accessibilityLabel="Supervise mode"
            value={superviseMode}
            onValueChange={setSuperviseMode}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.background}
            ios_backgroundColor={colors.border}
          />
        </View>

        <Text style={styles.intro}>
          {superviseMode
            ? 'Mothrly follows up when you linger in one of these apps.'
            : 'Turn this on and Mothrly will follow up when you linger in one of these apps.'}
        </Text>

        {usageAccess === 'denied' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Use my real screen time"
            accessibilityHint="Explains the permission Android needs first"
            onPress={() => router.navigate('/usage-access')}
            style={({ pressed }) => [styles.usageCard, pressed && styles.usageCardPressed]}
          >
            <Text style={styles.usageTitle}>Use my real screen time</Text>
            <Text style={styles.usageBody}>
              The times below are placeholders. Android can tell Mothrly how long you actually spend
              in these apps, with your permission.
            </Text>
          </Pressable>
        ) : null}

        <View style={styles.list}>
          {apps.map((app, index) => {
            const minutes = minutesToday[app.id] ?? 0;
            const time = formatMinutes(minutes);

            return (
              <View
                key={app.id}
                accessible
                accessibilityLabel={`${app.name}, ${time} today, ${STATUS_LABEL[app.status]}`}
                style={[styles.row, index > 0 && styles.rowDivided]}
              >
                <View
                  // Decorative: the name sits right beside it, and the row already
                  // carries a full label for screen readers.
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={[styles.tile, { backgroundColor: app.color }]}
                >
                  <Text style={styles.tileInitial}>{app.initial}</Text>
                </View>

                <Text style={styles.rowName} numberOfLines={1}>
                  {app.name}
                </Text>

                <Text style={styles.rowTime}>{time}</Text>

                <View
                  style={[styles.tag, app.status === 'live' ? styles.tagLive : styles.tagPreview]}
                >
                  <Text style={styles.tagLabel}>{STATUS_LABEL[app.status]}</Text>
                </View>
              </View>
            );
          })}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add app"
            accessibilityHint="Not available yet"
            // Deliberately inert: there is no app picker to open yet.
            disabled
            style={[styles.row, styles.rowDivided, styles.addRow]}
          >
            <Text style={styles.addLabel}>+ Add app</Text>
          </Pressable>
        </View>

        {/* Says plainly whether the numbers above are measured, so a placeholder is
            never mistaken for a reading. */}
        <Text style={styles.caption}>
          {minutesSource === 'usage-stats'
            ? "Times today, from Android's usage records."
            : 'Placeholder times, until real tracking is switched on.'}
        </Text>
      </ScrollView>

      {/* Rendered inside the screen rather than in a `Modal`: on iOS a modal is a
          separate native window, which would sit on top of the nudge alert and
          hide the very thing the demo is here to show. */}
      {demoOpen ? (
        <View style={StyleSheet.absoluteFill}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close demo scenarios"
            onPress={() => setDemoOpen(false)}
            style={[StyleSheet.absoluteFill, styles.demoBackdrop]}
          />

          <View accessibilityViewIsModal style={styles.demoSheet}>
            <Text style={styles.demoTitle}>Demo scenarios</Text>
            <Text style={styles.demoHint}>Fires a real supervise nudge for the chosen app.</Text>

            {DEMO_SCENARIOS.map((scenario) => (
              <Pressable
                key={scenario.id}
                accessibilityRole="button"
                accessibilityLabel={scenario.label}
                onPress={() => runScenario(scenario)}
                style={({ pressed }) => [styles.demoRow, pressed && styles.demoRowPressed]}
              >
                <Text style={styles.demoRowLabel}>{scenario.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const TILE_SIZE = 40;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  titlePress: {
    flex: 1,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 28,
    color: colors.text,
  },
  intro: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
  },
  list: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 4,
    minHeight: 56,
  },
  rowDivided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileInitial: {
    // Cream on the tile colours, each of which is dark enough to clear the 3:1
    // WCAG threshold for large text at 18px bold.
    color: colors.background,
    fontFamily: fonts.bold,
    fontSize: 18,
  },
  rowName: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.text,
  },
  rowTime: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.text,
    // Keeps the tags in a straight column as the times change width.
    minWidth: 56,
    textAlign: 'right',
  },
  tag: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    minWidth: 62,
    alignItems: 'center',
  },
  tagLive: {
    borderColor: colors.secondary,
  },
  tagPreview: {
    borderColor: colors.border,
  },
  tagLabel: {
    fontFamily: fonts.bold,
    fontSize: 12,
    // Both tags use body text rather than their accent colour: sage on the card
    // background only reaches ~2.9:1, well short of AA at this size. The border
    // carries the colour, and the words themselves carry the meaning, so nothing
    // is communicated by hue alone.
    color: colors.text,
  },
  addRow: {
    justifyContent: 'center',
    opacity: 0.6,
  },
  addLabel: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.primaryDark,
  },

  usageCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.md,
    gap: spacing.xs,
  },
  usageCardPressed: {
    opacity: 0.85,
  },
  usageTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.primaryDark,
  },
  usageBody: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
  },
  caption: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
  },

  demoBackdrop: {
    backgroundColor: colors.primaryDark,
    opacity: 0.35,
  },
  demoSheet: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    top: spacing.xl,
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    elevation: 6,
    shadowColor: colors.primaryDark,
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  demoTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.text,
  },
  demoHint: {
    fontFamily: fonts.regular,
    marginTop: 2,
    marginBottom: spacing.sm,
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
  },
  demoRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingVertical: spacing.md - 2,
    justifyContent: 'center',
    minHeight: 48,
  },
  demoRowPressed: {
    backgroundColor: colors.card,
  },
  demoRowLabel: {
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.text,
  },
});
