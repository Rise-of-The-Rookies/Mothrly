import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { type PurchasesEntitlementInfo } from 'react-native-purchases';

import { getPendingReminderCounts, sendTestNotification } from '@/lib/notifications';
import { type ReminderCategory } from '@/lib/reminderMessages';
import { REMINDER_CATEGORIES, type TimeOfDay } from '@/lib/reminderSchedule';
import {
  getCustomerInfo,
  isRevenueCatAvailable,
  premiumEntitlement,
  restorePurchases,
  usePremiumEntitlement,
} from '@/lib/revenuecat';
import { colors, fonts, radius, spacing } from '@/lib/theme';
import useReminderStore from '@/store/reminderStore';

/** Display order and copy for the reminder category rows. */
const CATEGORY_LABELS: Record<ReminderCategory, string> = {
  hydration: 'Hydration',
  sleep: 'Sleep',
  focus: 'Focus',
};

/** Formats an ISO date as a short local date, or `null` if it isn't a real date. */
function formatDate(iso: string | null): string | null {
  if (!iso) return null;

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Describes an active premium entitlement in one line.
 *
 * Reads the terms off the entitlement rather than assuming them, because the
 * interesting cases are the ones that differ: a trial that has not converted, a
 * subscription already cancelled but still running, and a billing problem the
 * store wants resolving. All three still report as active.
 */
function formatPremiumStatus(entitlement: PurchasesEntitlementInfo): string {
  const opening = entitlement.periodType === 'TRIAL' ? 'Free trial active' : 'Subscription active';

  // A null expiry is lifetime access, not missing data.
  if (entitlement.expirationDate === null) {
    return `${opening}, with no expiry date. Yours for good.`;
  }

  const expires = formatDate(entitlement.expirationDate);
  const period =
    expires === null
      ? `${opening}.`
      : entitlement.willRenew
        ? `${opening}, renewing ${expires}.`
        : `${opening} until ${expires}, then it stops — renewal is already switched off.`;

  // Worth surfacing: access continues for now, but it will lapse if the payment
  // is never taken, and the fix is in the store rather than in this app.
  return entitlement.billingIssueDetectedAt === null
    ? period
    : `${period} The store has reported a billing problem, so check your payment method there.`;
}

/** Formats a {@link TimeOfDay} as a 12-hour clock time, e.g. `11:00 PM`. */
function formatTimeOfDay({ hour, minute }: TimeOfDay): string {
  const suffix = hour < 12 ? 'AM' : 'PM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${suffix}`;
}

export default function SettingsScreen() {
  const [status, setStatus] = useState<string | null>(null);
  const [isScheduling, setIsScheduling] = useState(false);

  // Backed by the SDK's CustomerInfo listener, so this row follows a purchase made
  // on the paywall without Settings having to re-read anything.
  const { isPremium, isLoading: isEntitlementLoading } = usePremiumEntitlement();
  const [subscriptionNote, setSubscriptionNote] = useState<string | null>(null);
  const [isCheckingSubscription, setIsCheckingSubscription] = useState(false);

  const hydration = useReminderStore((state) => state.hydration);
  const sleep = useReminderStore((state) => state.sleep);
  const focus = useReminderStore((state) => state.focus);
  const setEnabled = useReminderStore((state) => state.setEnabled);
  // Written at the end of every reschedule, which makes it a reliable signal
  // that the pending notification counts are worth re-reading.
  const lastScheduledAt = useReminderStore((state) => state.lastScheduledAt);

  const [pending, setPending] = useState<Record<string, number> | null>(null);

  const refreshPending = useCallback(async () => {
    setPending(await getPendingReminderCounts());
  }, []);

  // Re-reads the OS notification queue whenever a reschedule finishes. The
  // cancelled flag keeps a slow response from overwriting a newer one.
  useEffect(() => {
    let cancelled = false;

    getPendingReminderCounts().then((counts) => {
      if (!cancelled) setPending(counts);
    });

    return () => {
      cancelled = true;
    };
  }, [lastScheduledAt]);

  const settingsFor: Record<ReminderCategory, { enabled: boolean; summary: string }> = {
    hydration: {
      enabled: hydration.enabled,
      summary: `Every ${hydration.intervalMinutes} min`,
    },
    sleep: {
      enabled: sleep.enabled,
      summary: `Daily at ${formatTimeOfDay(sleep.time)}`,
    },
    focus: {
      enabled: focus.enabled,
      summary: `Every ${focus.intervalMinutes} min, ${formatTimeOfDay(
        focus.sessionStart,
      )}–${formatTimeOfDay(focus.sessionEnd)}`,
    },
  };

  /**
   * One row, two jobs, depending on whether there is a subscription to manage.
   *
   * Without the entitlement there is nothing to manage, so it goes where the user
   * actually wants to be. With it, it re-reads the subscription from the store and
   * reports the terms — which doubles as the restore path for anyone who has
   * reinstalled or switched device.
   */
  async function handleManageSubscription() {
    if (!isPremium) {
      router.push('/paywall');
      return;
    }

    if (isCheckingSubscription) return;

    setIsCheckingSubscription(true);
    setSubscriptionNote(null);

    try {
      const customerInfo = await restorePurchases();
      const entitlement = premiumEntitlement(customerInfo);

      setSubscriptionNote(
        entitlement
          ? formatPremiumStatus(entitlement)
          : 'The store has no active subscription on this account. If you paid with a different one, sign into that one and try again.',
      );
    } catch (error) {
      console.warn('[settings] Could not refresh the subscription', error);
      setSubscriptionNote('Could not reach the store just now. Try again in a moment.');
    } finally {
      setIsCheckingSubscription(false);
    }
  }

  /**
   * Dumps the raw CustomerInfo to the console.
   *
   * A testing aid, which is why it is `__DEV__`-only: the quickest way to see what
   * RevenueCat actually thinks the entitlement state is, rather than inferring it
   * from what the UI has drawn.
   */
  async function handleLogCustomerInfo() {
    if (!isRevenueCatAvailable()) {
      console.warn('[revenuecat] Native SDK unavailable — no customer info to read.');
      setSubscriptionNote('No customer info in this build: purchases need a development build.');
      return;
    }

    try {
      const customerInfo = await getCustomerInfo();
      const active = Object.keys(customerInfo.entitlements.active);

      console.log('[revenuecat] customer info:', JSON.stringify(customerInfo, null, 2));
      console.log('[revenuecat] active entitlements:', active.length > 0 ? active : '(none)');

      setSubscriptionNote(
        `Customer info written to the console. Active entitlements: ${
          active.length > 0 ? active.join(', ') : 'none'
        }.`,
      );
    } catch (error) {
      console.warn('[revenuecat] Failed to read customer info', error);
      setSubscriptionNote('Could not read customer info — see the console for the error.');
    }
  }

  async function handleTestNotification() {
    setIsScheduling(true);
    setStatus(null);

    const id = await sendTestNotification();

    setIsScheduling(false);
    setStatus(
      id
        ? 'Scheduled. It should arrive in about 5 seconds — background the app to see it in the tray.'
        : 'Could not schedule. Notifications are probably turned off for Mothrly in system settings.',
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Settings</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Subscription</Text>
        <Text style={styles.cardBody}>
          Premium unlocks the Funny and Motivational moods. Billing itself lives with the App Store
          or Google Play, so cancelling and changing payment details happen there.
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Manage subscription"
          accessibilityHint={
            isPremium
              ? 'Re-reads your subscription from the store and shows its status'
              : 'Opens the upgrade options'
          }
          accessibilityState={{
            disabled: isCheckingSubscription,
            busy: isCheckingSubscription,
          }}
          disabled={isCheckingSubscription}
          onPress={handleManageSubscription}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        >
          <View style={styles.rowCopy}>
            <Text style={styles.rowLabel}>Manage subscription</Text>
            <Text style={styles.rowHint}>
              {isCheckingSubscription
                ? 'Checking with the store…'
                : isEntitlementLoading
                  ? 'Checking your subscription…'
                  : isPremium
                    ? 'Active. Tap to refresh the status from the store.'
                    : 'Not subscribed. Tap to see the plans.'}
            </Text>
          </View>
          <Text style={styles.rowAction}>{isPremium ? 'Refresh' : 'View plans'}</Text>
        </Pressable>

        {/* Stripped from release builds along with the branch: a console dump is a
            testing aid, not a setting. */}
        {__DEV__ ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Log customer info to the console"
            accessibilityHint="Prints the RevenueCat customer info and active entitlements to the development console"
            onPress={handleLogCustomerInfo}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <View style={styles.rowCopy}>
              <Text style={styles.rowLabel}>Log customer info</Text>
              <Text style={styles.rowHint}>
                Dev only · dumps the RevenueCat entitlement state to the console
              </Text>
            </View>
            <Text style={styles.rowAction}>Log</Text>
          </Pressable>
        ) : null}

        {subscriptionNote ? (
          <Text accessibilityLiveRegion="polite" style={styles.status}>
            {subscriptionNote}
          </Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Reminders</Text>
        <Text style={styles.cardBody}>
          Turning a category off cancels its pending notifications straight away. Turning it back on
          plans a fresh batch. The count beside each row is what the OS actually has queued.
        </Text>

        {REMINDER_CATEGORIES.map((category) => (
          <View key={category} style={styles.row}>
            <View style={styles.rowCopy}>
              <Text style={styles.rowLabel}>{CATEGORY_LABELS[category]}</Text>
              <Text style={styles.rowHint}>
                {settingsFor[category].summary}
                {pending ? ` · ${pending[category] ?? 0} queued` : ''}
              </Text>
            </View>
            <Switch
              accessibilityLabel={`${CATEGORY_LABELS[category]} reminders`}
              value={settingsFor[category].enabled}
              onValueChange={(next) => setEnabled(category, next)}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.background}
              ios_backgroundColor={colors.border}
            />
          </View>
        ))}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh pending notification counts"
          onPress={refreshPending}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
        >
          <Text style={styles.secondaryButtonLabel}>Refresh counts</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Notifications</Text>
        <Text style={styles.cardBody}>
          Fires a test reminder 5 seconds from now so you can confirm delivery on a real device.
          Tapping it should land you on Home.
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send a test notification"
          accessibilityHint="Schedules a notification to arrive in five seconds"
          accessibilityState={{ disabled: isScheduling, busy: isScheduling }}
          disabled={isScheduling}
          onPress={handleTestNotification}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            isScheduling && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.buttonLabel}>
            {isScheduling ? 'Scheduling…' : 'Send test notification'}
          </Text>
        </Pressable>

        {status ? (
          <Text accessibilityLiveRegion="polite" style={styles.status}>
            {status}
          </Text>
        ) : null}
      </View>
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
    fontSize: 28,
    color: colors.text,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
  },
  cardTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  cardBody: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    // Body copy uses `text` rather than `textMuted`: muted only reaches 3.5:1
    // against the card background, short of the 4.5:1 AA threshold at this size.
    color: colors.text,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rowCopy: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.text,
  },
  rowHint: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
  },
  rowPressed: {
    opacity: 0.85,
  },
  /** The affordance on a row that goes somewhere, in place of a Switch. */
  rowAction: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.primaryDark,
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
    // Cream on coral is the highest-contrast pairing available in the palette
    // (~3.9:1). Kept at bold 19px so it qualifies as WCAG large text, where the
    // threshold is 3:1.
    color: colors.background,
    fontFamily: fonts.bold,
    fontSize: 19,
  },
  secondaryButton: {
    marginTop: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  secondaryButtonLabel: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: 15,
  },
  status: {
    fontFamily: fonts.regular,
    marginTop: spacing.md,
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
  },
});
