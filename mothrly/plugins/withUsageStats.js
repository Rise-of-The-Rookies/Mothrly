const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Adds the Android bits `expo-android-usagestats` needs, which the package does
 * not ship a config plugin for.
 *
 * Two manifest edits, both Android-only:
 *
 * 1. `PACKAGE_USAGE_STATS`. A signature|privileged permission, so it is never
 *    granted by a runtime prompt — declaring it only makes the app appear in
 *    Settings → Special app access → Usage access, where the user grants it by
 *    hand. `tools:ignore="ProtectedPermissions"` is required or the manifest
 *    merger fails the build for declaring a permission the app cannot hold.
 *
 * 2. A `<queries>` entry for launcher activities. Android 11 and above hide most
 *    installed packages behind package visibility rules, and without this the
 *    usage-stats query comes back missing the apps we are looking for.
 */

/** Permission that puts the app in the Usage access settings list. */
const USAGE_STATS_PERMISSION = 'android.permission.PACKAGE_USAGE_STATS';

/**
 * Declares the permission with the lint suppression the merger needs.
 *
 * Written by hand rather than through `AndroidConfig.Permissions`, which cannot
 * attach the `tools:ignore` attribute.
 */
function addUsageStatsPermission(androidManifest) {
  const manifest = androidManifest.manifest;

  // The `tools:` prefix has to be declared on the root element before it can be
  // used on a child.
  manifest.$ = { ...manifest.$, 'xmlns:tools': 'http://schemas.android.com/tools' };

  const permissions = manifest['uses-permission'] ?? [];
  const existing = permissions.find((item) => item.$?.['android:name'] === USAGE_STATS_PERMISSION);

  if (existing) {
    existing.$['tools:ignore'] = 'ProtectedPermissions';
  } else {
    permissions.push({
      $: {
        'android:name': USAGE_STATS_PERMISSION,
        'tools:ignore': 'ProtectedPermissions',
      },
    });
  }

  manifest['uses-permission'] = permissions;
  return androidManifest;
}

/** Makes launcher apps visible to `PackageManager` on Android 11+. */
function addLauncherQueries(androidManifest) {
  const manifest = androidManifest.manifest;
  const queries = manifest.queries ?? [];

  const alreadyQueried = queries.some((query) =>
    query.intent?.some((intent) =>
      intent.action?.some((action) => action.$?.['android:name'] === 'android.intent.action.MAIN'),
    ),
  );

  if (!alreadyQueried) {
    queries.push({
      intent: [
        {
          action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
          category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
        },
      ],
    });
  }

  manifest.queries = queries;
  return androidManifest;
}

/** @type {import('expo/config-plugins').ConfigPlugin} */
const withUsageStats = (config) =>
  withAndroidManifest(config, (androidConfig) => {
    androidConfig.modResults = addUsageStatsPermission(androidConfig.modResults);
    androidConfig.modResults = addLauncherQueries(androidConfig.modResults);
    return androidConfig;
  });

module.exports = withUsageStats;
