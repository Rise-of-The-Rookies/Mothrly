import { PACKAGE_TYPE, PURCHASES_ERROR_CODE, type PurchasesPackage } from 'react-native-purchases';

/**
 * Reading a RevenueCat package well enough to render a plan card.
 *
 * The paywall shows whatever the dashboard returns, so nothing here knows the
 * names, prices or periods of Mothrly's plans — every value is derived from the
 * `PurchasesPackage` in hand. That is also why the fallbacks are so careful: the
 * store decides which fields are populated, and the answer differs between the
 * App Store and Google Play.
 */

/**
 * Length of each predefined package type, in months.
 *
 * `null` for the two open-ended types: a custom or unrecognised package could be
 * any period, so its length has to come from the product instead.
 */
const MONTHS_PER_PACKAGE_TYPE: Record<PACKAGE_TYPE, number | null> = {
  // Averaged over a year rather than 1/4, so a weekly plan compared against an
  // annual one isn't handed a 4/4.345 advantage by the arithmetic.
  [PACKAGE_TYPE.WEEKLY]: 12 / 52,
  [PACKAGE_TYPE.MONTHLY]: 1,
  [PACKAGE_TYPE.TWO_MONTH]: 2,
  [PACKAGE_TYPE.THREE_MONTH]: 3,
  [PACKAGE_TYPE.SIX_MONTH]: 6,
  [PACKAGE_TYPE.ANNUAL]: 12,
  [PACKAGE_TYPE.LIFETIME]: Number.POSITIVE_INFINITY,
  [PACKAGE_TYPE.CUSTOM]: null,
  [PACKAGE_TYPE.UNKNOWN]: null,
};

/** ISO 8601 durations as the stores use them: `P1Y`, `P6M`, `P1W`, `P7D`. */
const ISO_8601_PERIOD = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?$/;

/** Singular nouns for the period units the stores report. */
const PERIOD_UNIT_NOUNS: Record<string, string> = {
  DAY: 'day',
  WEEK: 'week',
  MONTH: 'month',
  YEAR: 'year',
};

function monthsFromIso8601(period: string | null): number | null {
  if (!period) return null;

  const match = ISO_8601_PERIOD.exec(period.trim().toUpperCase());
  if (!match) return null;

  const [, years, months, weeks, days] = match;
  const total =
    Number(years ?? 0) * 12 +
    Number(months ?? 0) +
    Number(weeks ?? 0) * (12 / 52) +
    Number(days ?? 0) * (12 / 365);

  // `P` on its own matches the pattern and means nothing, so a zero total is a
  // failure to parse rather than a zero-length period.
  return total > 0 ? total : null;
}

/**
 * How many months a package covers, or `null` if the stores didn't say.
 *
 * `Number.POSITIVE_INFINITY` for a lifetime purchase, which keeps it sorting as
 * the longest period without special-casing at every call site.
 */
export function packageMonths(pkg: PurchasesPackage): number | null {
  return (
    MONTHS_PER_PACKAGE_TYPE[pkg.packageType] ?? monthsFromIso8601(pkg.product.subscriptionPeriod)
  );
}

/**
 * Cost per month, normalised so packages of different lengths can be compared.
 *
 * Prefers the store's own `pricePerMonth` — it accounts for Google Play base
 * plans, which dividing the headline price does not — and only falls back to
 * arithmetic when the store leaves it null.
 */
export function effectiveMonthlyPrice(pkg: PurchasesPackage): number | null {
  const { price, pricePerMonth } = pkg.product;
  if (pricePerMonth !== null) return pricePerMonth;

  const months = packageMonths(pkg);
  if (months === null || months <= 0) return null;

  // A lifetime package divides down to zero, which is the honest answer: spread
  // over an unbounded period, its monthly cost really is the lowest on offer.
  return price / months;
}

/**
 * Ranks packages by `score` and returns the single winner.
 *
 * Returns `null` rather than a best guess in the two cases where marking a
 * package would mislead: when any package can't be scored (ranking the rest
 * would crown whichever plan happened to report more data) and when the best
 * score is shared (two plans of equal value, one wearing a badge).
 */
function pickUniqueBy(
  packages: readonly PurchasesPackage[],
  score: (pkg: PurchasesPackage) => number | null,
  prefer: 'lowest' | 'highest',
): PurchasesPackage | null {
  let winner: PurchasesPackage | null = null;
  let winningScore = 0;
  let tied = false;

  for (const pkg of packages) {
    const value = score(pkg);
    if (value === null || Number.isNaN(value)) return null;

    if (winner === null) {
      winner = pkg;
      winningScore = value;
      continue;
    }

    const better = prefer === 'lowest' ? value < winningScore : value > winningScore;
    if (better) {
      winner = pkg;
      winningScore = value;
      tied = false;
    } else if (value === winningScore) {
      tied = true;
    }
  }

  return tied ? null : winner;
}

/**
 * The package worth flagging as better value, or `null` if there is no clear
 * winner to flag.
 *
 * Compares effective monthly cost where every package exposes one, because that
 * is the only comparison that actually means "better value". Where it doesn't,
 * falls back to flagging the longest-running package — a weaker claim, but the
 * longer commitment is the one that is nearly always discounted.
 *
 * Always `null` for a single package: there is nothing to be better than.
 */
export function findBestValuePackage(
  packages: readonly PurchasesPackage[],
): PurchasesPackage | null {
  if (packages.length < 2) return null;

  return (
    pickUniqueBy(packages, effectiveMonthlyPrice, 'lowest') ??
    pickUniqueBy(packages, packageMonths, 'highest')
  );
}

/** What a package offers up front, before it starts charging the normal price. */
export type PackageOffer = {
  /** An introductory period that costs nothing — an actual free trial. */
  hasFreeTrial: boolean;
  /** An introductory period that is discounted but still paid. */
  hasPaidIntro: boolean;
  /** Length of the free trial, e.g. `"7 days"`. Null when the store didn't say. */
  freeTrialLength: string | null;
};

function formatPeriod(
  unit: string | null | undefined,
  value: number | null | undefined,
): string | null {
  if (!unit || value === null || value === undefined || value <= 0) return null;

  const noun = PERIOD_UNIT_NOUNS[unit.toUpperCase()];
  if (!noun) return null;

  return `${value} ${noun}${value === 1 ? '' : 's'}`;
}

/**
 * Reads the introductory offer attached to a package.
 *
 * The two stores describe a free trial differently: the App Store reports an
 * `introPrice` costing zero, while Google Play reports a zero-cost pricing phase
 * on the subscription option. Both are checked, so the CTA says the same true
 * thing on either platform.
 *
 * A discounted-but-paid intro offer is kept separate from a free trial on
 * purpose — calling "first month half price" a free trial is the kind of claim
 * that gets a build rejected.
 */
export function packageOffer(pkg: PurchasesPackage): PackageOffer {
  const { introPrice, defaultOption } = pkg.product;

  const freePhase = defaultOption?.freePhase ?? null;
  const hasFreeTrial = freePhase !== null || introPrice?.price === 0;
  const hasPaidIntro =
    !hasFreeTrial && (defaultOption?.introPhase != null || (introPrice?.price ?? 0) > 0);

  const freeTrialLength = hasFreeTrial
    ? (formatPeriod(freePhase?.billingPeriod.unit, freePhase?.billingPeriod.value) ??
      formatPeriod(introPrice?.periodUnit, introPrice?.periodNumberOfUnits))
    : null;

  return { hasFreeTrial, hasPaidIntro, freeTrialLength };
}

/**
 * Label for the primary call to action.
 *
 * "Start free trial" is reserved for packages that genuinely open with a free
 * period; everything else, including a discounted first period, gets the plain
 * "Subscribe".
 */
export function callToActionLabel(pkg: PurchasesPackage | null): string {
  if (!pkg) return 'Subscribe';
  return packageOffer(pkg).hasFreeTrial ? 'Start free trial' : 'Subscribe';
}

/**
 * The store-formatted monthly equivalent of a longer package, for the small
 * print under its price.
 *
 * Null for monthly, weekly and lifetime packages: restating a monthly plan's own
 * price adds nothing, and a lifetime purchase has no meaningful monthly figure.
 */
export function equivalentMonthlyPriceString(pkg: PurchasesPackage): string | null {
  const months = packageMonths(pkg);
  if (months === null || !Number.isFinite(months) || months <= 1) return null;

  return pkg.product.pricePerMonthString;
}

/**
 * Whether a rejected purchase was the user backing out of the store sheet.
 *
 * Worth singling out because it is not a failure: the correct response is to put
 * the paywall back exactly as it was, with no error message.
 */
export function isUserCancelledError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;

  const candidate = error as { code?: unknown; userCancelled?: unknown };

  return (
    candidate.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR ||
    // `userCancelled` is deprecated in favour of the code above, but older
    // native SDK versions still only set the boolean.
    candidate.userCancelled === true
  );
}
