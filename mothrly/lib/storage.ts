import type { StateStorage } from 'zustand/middleware';

/**
 * Synchronous key-value persistence for Zustand stores.
 *
 * Three backends, tried in order, because no single one works everywhere this
 * code runs:
 *
 * 1. **MMKV** — fastest, but built on `react-native-nitro-modules`, so it needs
 *    a development build. Unavailable in Expo Go.
 * 2. **expo-sqlite/kv-store** — ships inside Expo Go on both iOS and Android,
 *    and its `*Sync` methods give us the synchronous API `persist` wants. Slower
 *    than MMKV, irrelevant at the size of our settings blob.
 * 3. **In-memory `Map`** — plain Node (lint, typecheck, future unit tests) and
 *    any platform the first two don't cover. Does not survive a restart.
 *
 * Both native tiers are loaded with `require` inside a `try`, not a static
 * `import`. That is load-bearing: `react-native-mmkv` pulls in
 * `react-native-nitro-modules`, which throws while *evaluating its own module*
 * when the native side is missing. A static import would crash the app at
 * startup, before any error handling in this file could run.
 */

type KeyValueStore = {
  set(key: string, value: string): void;
  getString(key: string): string | undefined;
  remove(key: string): void;
};

/** Which backend {@link storage} ended up using. Exported for diagnostics. */
export type StorageBackend = 'mmkv' | 'expo-sqlite' | 'memory';

/** Tier 1: MMKV, via a development build. */
function tryCreateMmkvStore(): KeyValueStore | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createMMKV } = require('react-native-mmkv') as typeof import('react-native-mmkv');
    return createMMKV();
  } catch {
    return null;
  }
}

/** Tier 2: SQLite-backed key-value store, available in Expo Go. */
function tryCreateSqliteStore(): KeyValueStore | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const kvStore = require('expo-sqlite/kv-store') as {
      default: typeof import('expo-sqlite/kv-store').default;
    };
    const store = kvStore.default;

    // Touch the store once up front. Opening the database is what actually
    // needs the native module, so a backend that fails here must be rejected
    // now rather than on the first real write.
    store.getItemSync('__probe__');

    return {
      set: (key, value) => store.setItemSync(key, value),
      getString: (key) => store.getItemSync(key) ?? undefined,
      remove: (key) => {
        store.removeItemSync(key);
      },
    };
  } catch {
    return null;
  }
}

/** Tier 3: last resort. Works anywhere, persists nothing. */
function createMemoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    set: (key, value) => {
      map.set(key, value);
    },
    getString: (key) => map.get(key),
    remove: (key) => {
      map.delete(key);
    },
  };
}

function createStore(): { store: KeyValueStore; backend: StorageBackend } {
  const mmkv = tryCreateMmkvStore();
  if (mmkv) return { store: mmkv, backend: 'mmkv' };

  const sqlite = tryCreateSqliteStore();
  if (sqlite) {
    console.log(
      '[storage] MMKV unavailable (needs a development build) — using ' +
        'expo-sqlite/kv-store. State persists normally.',
    );
    return { store: sqlite, backend: 'expo-sqlite' };
  }

  console.warn(
    '[storage] No persistent backend available — falling back to in-memory ' +
      'storage. State will not survive a restart.',
  );
  return { store: createMemoryStore(), backend: 'memory' };
}

const { store, backend } = createStore();

/** Shared key-value store. Re-use this rather than creating new instances. */
export const storage: KeyValueStore = store;

/** The backend actually in use. Handy when a persistence bug looks platform-specific. */
export const storageBackend: StorageBackend = backend;

/** Adapter that plugs {@link storage} into Zustand's `persist` middleware. */
export const zustandStorage: StateStorage = {
  setItem: (name, value) => {
    storage.set(name, value);
  },
  getItem: (name) => storage.getString(name) ?? null,
  removeItem: (name) => {
    storage.remove(name);
  },
};
