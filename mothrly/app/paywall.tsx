import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { type PurchasesOffering, type PurchasesPackage } from 'react-native-purchases';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Character from '@/components/Character';
import { CheckIcon, CloseIcon } from '@/components/Icons';
import {
  callToActionLabel,
  equivalentMonthlyPriceString,
  findBestValuePackage,
  isUserCancelledError,
  packageOffer,
} from '@/lib/paywall';
import {
  getCurrentOffering,
  hasPremiumEntitlement,
  isRevenueCatAvailable,
  isRevenueCatConfigured,
  purchasePackage,
  restorePurchases,
  usePremiumEntitlement,
} from '@/lib/revenuecat';
import { colors, fonts, radius, spacing } from '@/lib/theme';

/**
 * The upgrade screen for the `premium_personas` entitlement.
 *
 * Every plan on this screen comes from the offering configured in the RevenueCat
 * dashboard: one card per package returned, titled and priced with the store's
 * own strings. Nothing about the plans is written down here, so changing the
 * price, renaming a plan or adding a yearly option is a dashboard edit and needs
 * no release.
 *
 * Presented as a modal with no navigation header (see `app/_layout.tsx`), so the
 * screen owns its own close control and top inset.
 *
 * There is no confirmation step to write: `usePremiumEntitlement` is backed by
 * the SDK's CustomerInfo listener, so a completed purchase or a successful
 * restore swaps this screen for {@link PremiumConfirmation} on its own.
 */

/** What premium unlocks. Copy only — the entitlement itself gates the personas. */
const FEATURES: readonly string[] = [
  'All four moods — Strict, Gentle, Funny and Motivational',
  'Switch her mood whenever you like, as often as you like',
  'Every reminder rewritten in her voice: water, sleep and focus',
  'Supervise-mode nudges that sound like the mood you picked',
];

/**
 * How long the success confirmation stays up before the modal closes itself.
 *
 * Long enough to register as a confirmation rather than a flicker, short enough
 * that it doesn't become a screen the user has to wait out.
 */
const SUCCESS_DISMISS_DELAY_MS = 1700;

/**
 * An inline message under the call to action.
 *
 * `info` covers the outcomes that are not failures — backing out of the store
 * sheet, or a purchase the store has yet to confirm — and reads in the same calm
 * voice as the rest of the screen. `error` is for something that actually went
 * wrong, and is still only a line of text: interrupting a failed purchase with a
 * modal alert on top of the modal the user is already in helps nobody.
 */
type Notice = { kind: 'info' | 'error'; message: string };

/** Loading states for the offering fetch. */
type OfferingState =
  | { status: 'loading' }
  | { status: 'ready'; packages: PurchasesPackage[] }
  /** Reached the store, but the dashboard has no packages to sell. */
  | { status: 'empty' }
  /** No native SDK, or no API key — purchases can't work in this build at all. */
  | { status: 'unavailable'; reason: string }
  | { status: 'error'; message: string };

/**
 * Why purchases cannot work in this build at all, or `null` if they can.
 *
 * Checked before calling the SDK rather than after it fails: without the native
 * module `getOfferings()` rejects with an opaque property-of-undefined error,
 * which would surface as "something went wrong" for what is really a missing
 * development build — not something the user can act on.
 */
function unavailableReason(): string | null {
  if (!isRevenueCatAvailable()) {
    return 'Purchases need a development build — Expo Go does not bundle the store SDK. Everything else in the app works as normal.';
  }

  if (!isRevenueCatConfigured()) {
    return 'Purchases are not configured in this build, so there is nothing to show yet. Everything else in the app works as normal.';
  }

  return null;
}

/**
 * Resolved once, before the first render, so an unsupported build never renders a
 * spinner it will not resolve — and so the mount effect below has no reason to
 * set state synchronously.
 */
function initialOfferingState(): OfferingState {
  const reason = unavailableReason();
  return reason === null ? { status: 'loading' } : { status: 'unavailable', reason };
}

/**
 * Closes the modal, returning to whichever screen opened it — the persona picker
 * or Settings.
 *
 * Module-level so the auto-dismiss timer can depend on it without re-running.
 * The guard covers the paywall being the only route in the stack, which a deep
 * link could manage: there is nothing to go back to, so the confirmation simply
 * stays put rather than the app popping itself into an empty stack.
 */
function dismissPaywall() {
  if (router.canGoBack()) router.back();
}

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const { isPremium } = usePremiumEntitlement();

  const [offering, setOffering] = useState<OfferingState>(initialOfferingState);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  /**
   * True once a purchase made *on this screen* has granted the entitlement.
   *
   * Separate from `isPremium` because the two want different screens: this one
   * earns the celebration and closes itself, whereas arriving already subscribed
   * should just explain the situation and wait to be dismissed.
   */
  const [justPurchased, setJustPurchased] = useState(false);

  /** Turns a fetched offering into the state the plan cards render from. */
  const applyOffering = useCallback((current: PurchasesOffering | null) => {
    const available = current?.availablePackages ?? [];
    if (available.length === 0) {
      setOffering({ status: 'empty' });
      return;
    }

    setOffering({ status: 'ready', packages: available });

    // Opens on the better-value plan, which is both the friendlier default and
    // the one most people would pick anyway. `available[0]` covers an offering
    // with a single package, where there is no better value to find.
    const preselected = findBestValuePackage(available) ?? available[0];
    setSelectedId(preselected?.identifier ?? null);
  }, []);

  const applyOfferingError = useCallback((error: unknown) => {
    console.warn('[paywall] Failed to load the current offering', error);
    setOffering({
      status: 'error',
      message: 'We could not reach the store. Check your connection and try again.',
    });
  }, []);

  useEffect(() => {
    // Nothing to fetch in a build that cannot buy anything — `initialOfferingState`
    // has already put the screen in its `unavailable` state.
    if (unavailableReason() !== null) return;

    // `cancelled` covers the modal being dismissed mid-flight. Written as promise
    // callbacks rather than an awaited call so the state updates land in a
    // callback from the store rather than synchronously in the effect body —
    // the same shape `usePremiumEntitlement` uses.
    let cancelled = false;

    getCurrentOffering()
      .then((current) => {
        if (cancelled) return;
        applyOffering(current);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        applyOfferingError(error);
      });

    return () => {
      cancelled = true;
    };
  }, [applyOffering, applyOfferingError]);

  function handleRetry() {
    setOffering({ status: 'loading' });
    getCurrentOffering().then(applyOffering).catch(applyOfferingError);
  }

  const packages = offering.status === 'ready' ? offering.packages : null;
  const bestValue = packages ? findBestValuePackage(packages) : null;
  const selected = packages?.find((pkg) => pkg.identifier === selectedId) ?? null;

  async function handlePurchase() {
    if (!selected || busy) return;

    setNotice(null);
    setIsPurchasing(true);

    try {
      const { customerInfo } = await purchasePackage(selected);

      // Read from the purchase's own result rather than waiting for
      // `usePremiumEntitlement` to be told: the listener does fire, but hanging
      // the confirmation off it would make this screen depend on which of two
      // callbacks happens to land first.
      if (hasPremiumEntitlement(customerInfo)) {
        setJustPurchased(true);
        return;
      }

      // Bought, but not yet entitled. A Google Play transaction awaiting
      // confirmation ends up here, and it is neither a success to celebrate nor a
      // failure to apologise for.
      setNotice({
        kind: 'info',
        message:
          'The store is still confirming your purchase. The moods unlock by themselves as soon as it clears.',
      });
    } catch (error) {
      // Backing out of the store sheet is not a failure, and saying so would be
      // the app telling the user off for changing their mind.
      if (isUserCancelledError(error)) {
        setNotice({
          kind: 'info',
          message: 'No charge made. The plans are here whenever you want them.',
        });
        return;
      }

      console.warn('[paywall] Purchase failed', error);
      setNotice({
        kind: 'error',
        message: 'The store could not finish that, so nothing has been charged. Worth another try.',
      });
    } finally {
      // Runs on every path, including the successful one, so the button is never
      // left spinning behind the confirmation.
      setIsPurchasing(false);
    }
  }

  async function handleRestore() {
    if (busy) return;

    setNotice(null);
    setIsRestoring(true);

    try {
      const customerInfo = await restorePurchases();
      // A restore that finds nothing still resolves, so the entitlement has to be
      // checked rather than assumed from the absence of an error.
      if (hasPremiumEntitlement(customerInfo)) {
        setJustPurchased(true);
        return;
      }

      setNotice({
        kind: 'info',
        message: 'No previous subscription found for this store account.',
      });
    } catch (error) {
      console.warn('[paywall] Restore failed', error);
      setNotice({
        kind: 'error',
        message: 'We could not check for previous purchases. Try again in a moment.',
      });
    } finally {
      setIsRestoring(false);
    }
  }

  const busy = isPurchasing || isRestoring;

  useEffect(() => {
    if (!justPurchased) return;

    // Cleared on unmount, so tapping close during the confirmation doesn't leave a
    // timer behind to pop a second screen afterwards.
    const timer = setTimeout(dismissPaywall, SUCCESS_DISMISS_DELAY_MS);
    return () => clearTimeout(timer);
  }, [justPurchased]);

  return (
    <View style={styles.screen}>
      <View style={[styles.closeRow, { paddingTop: insets.top + spacing.sm }]}>
        {/* Locked while the store sheet is up: closing the screen out from under
            an in-flight purchase would unmount the code that handles its result. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          hitSlop={spacing.sm}
          onPress={dismissPaywall}
          style={({ pressed }) => [
            styles.closeButton,
            pressed && styles.pressed,
            busy && styles.disabled,
          ]}
        >
          <CloseIcon size={22} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
      >
        {justPurchased ? (
          <PurchaseSuccess />
        ) : isPremium ? (
          <PremiumConfirmation />
        ) : (
          <>
            <Text style={styles.headline}>Meet the other sides of Mom</Text>
            <Text style={styles.subhead}>
              She has four moods. Two of them are waiting behind this screen.
            </Text>

            <View style={styles.featureList}>
              {FEATURES.map((feature) => (
                <View key={feature} style={styles.featureRow}>
                  {/* The row's text names the feature, so the tick is decoration. */}
                  <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    <CheckIcon size={20} color={colors.secondary} />
                  </View>
                  <Text style={styles.featureText}>{feature}</Text>
                </View>
              ))}
            </View>

            <PlanSection
              offering={offering}
              bestValue={bestValue}
              selectedId={selectedId}
              disabled={busy}
              onSelect={setSelectedId}
              onRetry={handleRetry}
            />

            {selected ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={callToActionLabel(selected)}
                accessibilityState={{ disabled: busy, busy: isPurchasing }}
                disabled={busy}
                onPress={handlePurchase}
                style={({ pressed }) => [
                  styles.cta,
                  pressed && styles.pressed,
                  busy && styles.disabled,
                ]}
              >
                {/* The button keeps its height either way, so swapping the label
                    for the spinner doesn't shift the layout below it. */}
                {isPurchasing ? (
                  <ActivityIndicator color={colors.background} />
                ) : (
                  <Text style={styles.ctaLabel}>{callToActionLabel(selected)}</Text>
                )}
              </Pressable>
            ) : null}

            {selected ? <CommitmentNote pkg={selected} /> : null}

            {/* Offered even when the offering failed to load: someone who already
                pays and reinstalled needs this to work regardless. */}
            {offering.status === 'unavailable' ? null : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Restore purchases"
                accessibilityHint="Checks your store account for a subscription you already bought"
                accessibilityState={{ disabled: busy, busy: isRestoring }}
                disabled={busy}
                hitSlop={spacing.sm}
                onPress={handleRestore}
                style={({ pressed }) => [
                  styles.restore,
                  pressed && styles.pressed,
                  busy && styles.disabled,
                ]}
              >
                <Text style={styles.restoreLabel}>
                  {isRestoring ? 'Checking…' : 'Restore purchases'}
                </Text>
              </Pressable>
            )}

            {notice ? (
              <View
                accessibilityLiveRegion="polite"
                style={[
                  styles.noticeBox,
                  notice.kind === 'error' ? styles.noticeBoxError : styles.noticeBoxInfo,
                ]}
              >
                <Text style={styles.noticeText}>{notice.message}</Text>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

/* -------------------------------------------------------------------------- */

type PlanSectionProps = {
  offering: OfferingState;
  /** The package to badge, or null when no package is clearly better value. */
  bestValue: PurchasesPackage | null;
  selectedId: string | null;
  /** True while a purchase or restore is in flight — plans stop being switchable. */
  disabled: boolean;
  onSelect: (identifier: string) => void;
  onRetry: () => void;
};

/**
 * The plan cards, or whatever stands in for them.
 *
 * Only this section swaps while the offering loads. Keeping the headline and
 * feature list mounted throughout means the modal never opens as a bare spinner,
 * and the copy does not jump down the screen once prices arrive.
 */
function PlanSection({
  offering,
  bestValue,
  selectedId,
  disabled,
  onSelect,
  onRetry,
}: PlanSectionProps) {
  if (offering.status === 'loading') {
    return (
      <View accessibilityLiveRegion="polite" style={styles.placeholder}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.placeholderText}>Fetching today&apos;s prices…</Text>
      </View>
    );
  }

  if (offering.status === 'unavailable') {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>{offering.reason}</Text>
      </View>
    );
  }

  if (offering.status === 'empty') {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>
          There are no plans on offer right now. Please try again later.
        </Text>
      </View>
    );
  }

  if (offering.status === 'error') {
    return (
      <View accessibilityLiveRegion="polite" style={styles.placeholder}>
        <Text style={styles.placeholderText}>{offering.message}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Try again"
          onPress={onRetry}
          style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
        >
          <Text style={styles.retryLabel}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View accessibilityRole="radiogroup" style={styles.planRow}>
      {offering.packages.map((pkg) => (
        <PlanCard
          key={pkg.identifier}
          pkg={pkg}
          selected={pkg.identifier === selectedId}
          isBestValue={pkg.identifier === bestValue?.identifier}
          disabled={disabled}
          onSelect={() => onSelect(pkg.identifier)}
        />
      ))}
    </View>
  );
}

type PlanCardProps = {
  pkg: PurchasesPackage;
  selected: boolean;
  isBestValue: boolean;
  disabled: boolean;
  onSelect: () => void;
};

/**
 * One package from the offering.
 *
 * Title and price are the store's own strings, untouched — they are already
 * localised, and re-deriving either from the numeric price is how a paywall ends
 * up showing the wrong currency.
 */
function PlanCard({ pkg, selected, isBestValue, disabled, onSelect }: PlanCardProps) {
  const monthlyEquivalent = equivalentMonthlyPriceString(pkg);
  const offer = packageOffer(pkg);

  // Spoken as one phrase, because a screen reader announcing the card's four
  // separate texts loses which price belongs to which plan.
  const label = [
    pkg.product.title,
    pkg.product.priceString,
    isBestValue ? 'best value' : null,
    monthlyEquivalent ? `${monthlyEquivalent} per month` : null,
    offer.hasFreeTrial
      ? offer.freeTrialLength
        ? `${offer.freeTrialLength} free first`
        : 'free trial included'
      : null,
  ]
    .filter((part): part is string => part !== null)
    .join(', ');

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onSelect}
      style={({ pressed }) => [
        styles.planCard,
        // The border is always 2px and only changes colour, so selecting a plan
        // recolours the card instead of resizing the row.
        selected && styles.planCardSelected,
        pressed && styles.pressed,
      ]}
    >
      {/* Reserved on every card so the titles line up whether or not a badge is
          present, without positioning the badge outside the card. */}
      <View style={styles.badgeSlot}>
        {isBestValue ? (
          <View style={styles.badge}>
            <Text style={styles.badgeLabel}>Best value</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.planTitle}>{pkg.product.title}</Text>
      <Text style={styles.planPrice}>{pkg.product.priceString}</Text>

      {monthlyEquivalent ? (
        <Text style={styles.planDetail}>{monthlyEquivalent} / month</Text>
      ) : null}

      {offer.hasFreeTrial ? (
        <Text style={styles.planTrial}>
          {offer.freeTrialLength ? `${offer.freeTrialLength} free` : 'Free trial'}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** The small print under the CTA, built from the selected package's real terms. */
function CommitmentNote({ pkg }: { pkg: PurchasesPackage }) {
  const offer = packageOffer(pkg);

  if (offer.hasFreeTrial) {
    return (
      <Text style={styles.commitment}>
        {offer.freeTrialLength ? `${offer.freeTrialLength} free, then ` : 'Free to start, then '}
        {pkg.product.priceString}. Cancel any time before it ends and you pay nothing.
      </Text>
    );
  }

  return (
    <Text style={styles.commitment}>
      {pkg.product.priceString}
      {offer.hasPaidIntro ? ' after the introductory period' : ''}. Cancel any time from your store
      account.
    </Text>
  );
}

/**
 * The confirmation for a purchase or restore that just completed here.
 *
 * Closes itself — see the timer in `PaywallScreen` — so the user lands back on
 * the persona picker with Funny and Motivational already unlocked, rather than
 * having to dismiss a screen to find out whether it worked.
 *
 * The tick springs in, which is the whole animation. There is no progress to
 * convey and the screen is about to leave, so anything longer would be in the way.
 */
function PurchaseSuccess() {
  // An idle flourish is exactly what this setting is for, so with reduced motion
  // the tick is simply already there.
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(reducedMotion ? 1 : 0.6);
  const opacity = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    if (reducedMotion) return;

    scale.value = withSpring(1, { damping: 11, stiffness: 180 });
    opacity.value = withTiming(1, { duration: 180 });
  }, [opacity, reducedMotion, scale]);

  const tickStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <View accessibilityLiveRegion="polite" style={styles.confirmation}>
      <Animated.View style={[styles.successCircle, tickStyle]}>
        <CheckIcon size={44} color={colors.background} />
      </Animated.View>

      <Text style={[styles.headline, styles.centred]}>You&apos;re in</Text>
      <Text style={[styles.subhead, styles.centred]}>
        Funny and Motivational are unlocked. Taking you back…
      </Text>
    </View>
  );
}

/**
 * Shown instead of the plans when the entitlement was already active on arrival.
 *
 * What a paying customer sees if they reach this screen by a route that forgot to
 * check. Unlike {@link PurchaseSuccess} it waits to be dismissed: there was no
 * action to confirm, so closing itself would look like a glitch.
 */
function PremiumConfirmation() {
  return (
    <View style={styles.confirmation}>
      <Character size={140} decorative />
      <Text style={[styles.headline, styles.centred]}>All four moods, unlocked</Text>
      <Text style={[styles.subhead, styles.centred]}>
        Funny and Motivational are yours. Pick one on the Moods tab and she will change voice from
        the very next reminder.
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Done"
        onPress={() => router.back()}
        style={({ pressed }) => [styles.cta, styles.ctaStretch, pressed && styles.pressed]}
      >
        <Text style={styles.ctaLabel}>Done</Text>
      </Pressable>
    </View>
  );
}

/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  closeRow: {
    paddingHorizontal: spacing.md,
    alignItems: 'flex-end',
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  headline: {
    fontFamily: fonts.bold,
    fontSize: 28,
    lineHeight: 34,
    color: colors.text,
  },
  subhead: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    // `text` rather than `textMuted`: muted only reaches ~3.5:1 on cream, short
    // of the 4.5:1 AA threshold at this size.
    color: colors.text,
    marginTop: -spacing.sm,
  },
  featureList: {
    gap: spacing.sm,
  },
  featureRow: {
    flexDirection: 'row',
    // Ticks align to the first line of text rather than centring against a
    // wrapped two-line feature.
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  featureText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: colors.text,
  },
  planRow: {
    flexDirection: 'row',
    // Two packages sit side by side; a third or fourth wraps to a new row rather
    // than squeezing every price into an unreadable column.
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  planCard: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    gap: spacing.xs,
  },
  planCardSelected: {
    borderColor: colors.primary,
  },
  badgeSlot: {
    minHeight: 22,
    justifyContent: 'center',
  },
  badge: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  badgeLabel: {
    // Cream on the dark terracotta clears AA comfortably, which the accent
    // colours do not at this size.
    color: colors.background,
    fontFamily: fonts.bold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  planTitle: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.text,
    textAlign: 'center',
  },
  planPrice: {
    fontFamily: fonts.bold,
    fontSize: 22,
    color: colors.text,
    textAlign: 'center',
  },
  planDetail: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.text,
    textAlign: 'center',
  },
  planTrial: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.secondary,
    textAlign: 'center',
  },
  placeholder: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    alignItems: 'center',
  },
  placeholderText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
    textAlign: 'center',
  },
  retryButton: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  retryLabel: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: 15,
  },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    marginTop: spacing.xs,
  },
  ctaLabel: {
    // Cream on coral is the strongest pairing in the palette (~3.9:1), which
    // clears the 3:1 WCAG threshold for large text at bold 19px.
    color: colors.background,
    fontFamily: fonts.bold,
    fontSize: 19,
  },
  /** The confirmation centres its children, which would shrink the CTA to fit. */
  ctaStretch: {
    alignSelf: 'stretch',
  },
  commitment: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
    textAlign: 'center',
    marginTop: -spacing.xs,
  },
  restore: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  restoreLabel: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.primaryDark,
    textDecorationLine: 'underline',
  },
  noticeBox: {
    borderRadius: radius.md,
    padding: spacing.md - 2,
    backgroundColor: colors.card,
  },
  noticeBoxInfo: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  noticeBoxError: {
    // The accent rather than a warning red: this is a purchase that did not
    // happen, not a problem with the user's phone, and colouring it like an
    // emergency would overstate it.
    borderWidth: 1,
    borderColor: colors.primary,
  },
  noticeText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
    textAlign: 'center',
  },
  successCircle: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmation: {
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.lg,
  },
  /** Applied on top of `headline` / `subhead`, which are left-aligned by default. */
  centred: {
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.6,
  },
});
