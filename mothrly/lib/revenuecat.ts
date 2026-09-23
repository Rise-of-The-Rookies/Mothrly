import { useEffect, useState } from 'react';
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type MakePurchaseResult,
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
 * Configures the RevenueCat SDK. Safe to call more than once — only the first
 * call reaches the native SDK.
 *
 * We deliberately use a single cross-platform key here because this project is
 * still on a RevenueCat Test Store key. When real App Store / Play Store keys
 * are added, this needs to branch on `Platform.OS`.
 */
export function configureRevenueCat(): void {
  if (configured) return;

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

/** Returns whether the given CustomerInfo has the premium entitlement active. */
function hasPremium(customerInfo: CustomerInfo): boolean {
  return customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID] !== undefined;
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
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const listener = (customerInfo: CustomerInfo) => {
      if (cancelled) return;
      setIsPremium(hasPremium(customerInfo));
      setIsLoading(false);
    };

    Purchases.addCustomerInfoUpdateListener(listener);

    Purchases.getCustomerInfo()
      .then((customerInfo) => {
        if (cancelled) return;
        setIsPremium(hasPremium(customerInfo));
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
