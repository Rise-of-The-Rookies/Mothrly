import { useEffect, useState } from 'react';
import { NativeModules } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type MakePurchaseResult,
  type PurchasesEntitlementInfo,
  type PurchasesOffering,
  type PurchasesOfferings,
  type PurchasesPackage,
} from 'react-native-purchases';

/**
 * Entitlement identifier configured in the RevenueCat dashboard that unlocks
 * the premium personas.
 */
export const PREMIUM_ENTITLEMENT_ID = 'premium_personas';

const API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY;

let configured = false;

/**
 * Whether the native RevenueCat SDK is actually present.
 *
 * `react-native-purchases` imports cleanly without its native module — it only
 * fails at the first call, with an opaque "cannot read property of undefined".
 * Checking up front lets the app run in Expo Go (which does not bundle it) with
 * purchases simply switched off, instead of crashing at startup.
 */
export function isRevenueCatAvailable(): boolean {
  return NativeModules.RNPurchases != null;
}

/**
 * Configures the RevenueCat SDK. Safe to call more than once — only the first
 * call reaches the native SDK.
 *
 * We deliberately use a single cross-platform key here because this project is
 * still on a RevenueCat Test Store key. When real App Store / Play Store keys
 * are added, this needs to branch on `Platform.OS`.
 */
export function configureRevenueCat(): void {
  if (configured) return;

  if (!isRevenueCatAvailable()) {
    console.warn(
      '[revenuecat] Native SDK unavailable — skipping configure(). ' +
        'Purchases and entitlements are disabled. A development build is ' +
        'required (Expo Go does not bundle react-native-purchases).',
    );
    return;
  }

  if (!API_KEY) {
    console.warn(
      '[revenuecat] EXPO_PUBLIC_REVENUECAT_API_KEY is not set. ' +
        'Copy .env.example to .env and add your Test Store key. Skipping configure().',
    );
    return;
  }

  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);
  Purchases.configure({ apiKey: API_KEY });
  configured = true;
}

/** True once {@link configureRevenueCat} has successfully configured the SDK. */
export function isRevenueCatConfigured(): boolean {
  return configured;
}

/** Fetches all offerings available to the current customer. */
export function getOfferings(): Promise<PurchasesOfferings> {
  return Purchases.getOfferings();
}

/** Convenience accessor for the offering marked "current" in the dashboard. */
export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  const offerings = await getOfferings();
  return offerings.current;
}

/** Starts the purchase flow for a package taken from an offering. */
export function purchasePackage(offeringPackage: PurchasesPackage): Promise<MakePurchaseResult> {
  return Purchases.purchasePackage(offeringPackage);
}

/** Restores previously purchased products for the current customer. */
export function restorePurchases(): Promise<CustomerInfo> {
  return Purchases.restorePurchases();
}

/**
 * Fetches the latest CustomerInfo for the current customer.
 *
 * Hits the network when the cache is stale, so it is the honest answer rather
 * than whatever {@link usePremiumEntitlement} last heard.
 */
export function getCustomerInfo(): Promise<CustomerInfo> {
  return Purchases.getCustomerInfo();
}

/**
 * The premium entitlement if it is currently active, otherwise `null`.
 *
 * Reading the entitlement rather than a boolean gives callers the terms too —
 * renewal date, trial or not, whether the store has flagged a billing problem.
 */
export function premiumEntitlement(
  customerInfo: CustomerInfo,
): PurchasesEntitlementInfo | undefined {
  return customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID];
}

/**
 * Returns whether the given CustomerInfo has the premium entitlement active.
 *
 * Exported because `purchasePackage` and `restorePurchases` both resolve with a
 * CustomerInfo: checking it directly lets a caller react to its own purchase
 * without waiting on {@link usePremiumEntitlement}'s listener to come round.
 * A purchase can also succeed *without* granting the entitlement — a Google Play
 * transaction left pending, for one — which is only visible by looking.
 */
export function hasPremiumEntitlement(customerInfo: CustomerInfo): boolean {
  return premiumEntitlement(customerInfo) !== undefined;
}

/**
 * Tracks whether the `premium_personas` entitlement is currently active.
 *
 * Reads the cached CustomerInfo on mount and then stays in sync via the SDK's
 * CustomerInfo listener, so purchases and restores update it automatically.
 *
 * `isLoading` is exposed so callers can avoid rendering a "locked" state during
 * the initial fetch.
 */
export function usePremiumEntitlement(): { isPremium: boolean; isLoading: boolean } {
  const [isPremium, setIsPremium] = useState(false);
  // Without the native SDK there is nothing to ask, so this starts already
  // settled: callers render their free state rather than a spinner that will
  // never resolve. Decided here rather than in the effect below, which would mean
  // a synchronous setState and a wasted second render on every mount.
  const [isLoading, setIsLoading] = useState(isRevenueCatAvailable);

  useEffect(() => {
    if (!isRevenueCatAvailable()) return;

    let cancelled = false;

    const listener = (customerInfo: CustomerInfo) => {
      if (cancelled) return;
      setIsPremium(hasPremiumEntitlement(customerInfo));
      setIsLoading(false);
    };

    Purchases.addCustomerInfoUpdateListener(listener);

    Purchases.getCustomerInfo()
      .then((customerInfo) => {
        if (cancelled) return;
        setIsPremium(hasPremiumEntitlement(customerInfo));
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn('[revenuecat] Failed to fetch customer info', error);
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, []);

  return { isPremium, isLoading };
}
