import { create } from 'zustand';

import { storage } from '@/lib/storage';

/**
 * Whether the user has been through onboarding.
 *
 * One boolean, read straight from {@link storage} at module load rather than
 * through Zustand's `persist` middleware. That is deliberate: this flag decides
 * which screen the app opens on, so it has to be correct on the very first
 * render. `persist` rehydrates in a `then` callback even when the backing store
 * is synchronous, which would let one frame of Home render before the flag
 * arrived and the router bounced us back to onboarding.
 *
 * The trade-off is doing the serialisation by hand, which for a single boolean
 * is a string comparison.
 */

/** Storage key. Namespaced to match the `mothrly.*` convention used by the persisted stores. */
const ONBOARDED_KEY = 'mothrly.hasOnboarded';

/** The value written for a completed onboarding. Anything else reads as "not yet". */
const ONBOARDED_VALUE = 'true';

function readHasOnboarded(): boolean {
  try {
    return storage.getString(ONBOARDED_KEY) === ONBOARDED_VALUE;
  } catch (error) {
    // A storage backend that throws on read shouldn't wedge the app shut. Showing
    // onboarding again is the harmless direction to fail in.
    console.warn('[onboarding] Could not read the onboarding flag', error);
    return false;
  }
}

export type OnboardingStore = {
  /**
   * Whether onboarding has been completed. Persisted, so it survives a relaunch
   * and onboarding is only ever seen once.
   */
  hasOnboarded: boolean;
  /**
   * Marks onboarding as done and writes the flag through to storage.
   *
   * Idempotent. Flipping this makes the `(tabs)` group reachable and the
   * onboarding route unreachable — see the guards in `app/_layout.tsx`.
   */
  completeOnboarding: () => void;
  /** Clears the flag so onboarding shows again. For development and support resets. */
  resetOnboarding: () => void;
};

const useOnboardingStore = create<OnboardingStore>()((set, get) => ({
  hasOnboarded: readHasOnboarded(),

  completeOnboarding: () => {
    if (get().hasOnboarded) return;
    try {
      storage.set(ONBOARDED_KEY, ONBOARDED_VALUE);
    } catch (error) {
      // Update the in-memory flag regardless: the user finished onboarding, so
      // they should get to Home now even if the write is lost on relaunch.
      console.warn('[onboarding] Could not persist the onboarding flag', error);
    }
    set({ hasOnboarded: true });
  },

  resetOnboarding: () => {
    try {
      storage.remove(ONBOARDED_KEY);
    } catch (error) {
      console.warn('[onboarding] Could not clear the onboarding flag', error);
    }
    set({ hasOnboarded: false });
  },
}));

export default useOnboardingStore;
