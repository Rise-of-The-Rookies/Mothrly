import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, spacing } from '@/lib/theme';
import { openUsageAccessSettings } from '@/lib/usageStats';
import { useUsageAccess } from '@/lib/useUsageSync';

/**
 * Explains Usage access before sending the user to the system settings screen
 * that grants it.
 *
 * `PACKAGE_USAGE_STATS` has no runtime prompt — the user has to find Mothrly in a
 * system list and switch it on. Dropping them into that screen cold is where this
 * kind of permission gets refused, so the explanation comes first: what is read,
 * what is not, and that it can be revoked the same way.
 *
 * Android only. The Supervise screen is what routes here, and it only offers the
 * row when the platform supports tracking at all.
 */
export default function UsageAccessScreen() {
  // Re-checks on foreground, so coming back from settings updates this screen
  // without the user doing anything else.
  const { status } = useUsageAccess();
  const [opening, setOpening] = useState(false);

  const granted = status === 'granted';

  async function handleOpenSettings() {
    setOpening(true);
    const opened = await openUsageAccessSettings();
    setOpening(false);

    if (!opened) {
      console.warn('[usage] Usage access settings could not be opened');
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Let Mothrly see your screen time</Text>

      <Text style={styles.body}>
        Android keeps a record of how long you spend in each app. With your permission, Mothrly can
        read that record so supervise mode works off your real day instead of a placeholder.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>What Mothrly reads</Text>
        <Text style={styles.bullet}>
          · How many minutes today you spent in the apps listed on the Supervise screen.
        </Text>
        <Text style={styles.cardTitle}>What it does not</Text>
        <Text style={styles.bullet}>
          · Anything you typed, watched, or posted. The record holds durations, not content.
        </Text>
        <Text style={styles.bullet}>
          · Nothing leaves your phone. The numbers are read on the device and stay there.
        </Text>
      </View>

      <Text style={styles.body}>
        Granting this takes a detour through system settings: find Mothrly in the list on the next
        screen and switch Usage access on. You can switch it back off in the same place whenever you
        like.
      </Text>

      {granted ? (
        <View accessibilityLiveRegion="polite" style={styles.grantedNote}>
          <Text style={styles.grantedText}>
            Usage access is on. The Supervise screen is showing your real times.
          </Text>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open usage access settings"
          accessibilityState={{ disabled: opening, busy: opening }}
          disabled={opening}
          onPress={handleOpenSettings}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            opening && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.buttonLabel}>{opening ? 'Opening…' : 'Open system settings'}</Text>
        </Pressable>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={granted ? 'Done' : 'Not now'}
        onPress={() => router.back()}
        style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
      >
        <Text style={styles.secondaryLabel}>{granted ? 'Done' : 'Not now'}</Text>
      </Pressable>

      <Text style={styles.footnote}>
        Without it, supervise mode still works — it just runs on the placeholder times.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 26,
    lineHeight: 32,
    color: colors.text,
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.text,
  },
  bullet: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
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
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonLabel: {
    color: colors.background,
    fontFamily: fonts.bold,
    fontSize: 19,
  },
  secondaryButton: {
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
  grantedNote: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.secondary,
    padding: spacing.md,
  },
  grantedText: {
    fontFamily: fonts.medium,
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
  },
  footnote: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
  },
});
