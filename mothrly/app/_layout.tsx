// Imported from the per-weight subpaths, not the package root. The root module
// `require`s all sixteen Nunito faces, and Metro bundles without tree-shaking, so
// importing it ships ~2.1MB of fonts to use three of them. These three are ~400KB.
import { Nunito_400Regular } from '@expo-google-fonts/nunito/400Regular';
import { Nunito_600SemiBold } from '@expo-google-fonts/nunito/600SemiBold';
import { Nunito_700Bold } from '@expo-google-fonts/nunito/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { View } from 'react-native';

import SuperviseNudgeAlert from '@/components/SuperviseNudgeAlert';
import { configureRevenueCat } from '@/lib/revenuecat';
import { useNotificationRouting } from '@/lib/useNotificationRouting';
import { useReminderDelivery } from '@/lib/useReminderDelivery';
import { useUsageSync } from '@/lib/useUsageSync';
import { refreshAllReminders } from '@/store/reminderStore';

// Configure RevenueCat once, at module load, before any screen renders.
configureRevenueCat();

// Hold the splash screen until Nunito is ready, so the first frame the user sees
// is already in the right typeface rather than flashing the system font and
// reflowing. Rejects only if the splash has already gone, which is harmless.
SplashScreen.preventAutoHideAsync().catch(() => {
  // No-op: nothing to hold means nothing to do.
});

export default function RootLayout() {
  /**
   * Loaded at runtime rather than embedded with the `expo-font` config plugin,
   * because the plugin needs a development build and this project still has to
   * run in Expo Go.
   *
   * Each weight is registered as its own family name — declaring several faces
   * under one family needs SDK 58, and this project is on 57. That is why the
   * styles below set `fontFamily` and never `fontWeight`: with one file per
   * family, asking for a weight on top of an already-bold face is what triggers
   * synthetic (faux) bolding.
   */
  const [fontsLoaded, fontError] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
  });

  // Requests notification permission on first launch and sends notification
  // taps to the Home screen.
  useNotificationRouting();

  // Records deliveries here rather than on Home, so a reminder that arrives
  // while the user is on another tab is still captured.
  useReminderDelivery();

  // Pulls real per-app times from Android's usage records on launch and on every
  // return to the foreground. A no-op on iOS and wherever the native module is
  // missing, which leaves demo mode as the only source there.
  useUsageSync();

  useEffect(() => {
    // Reminders are scheduled as batches covering a rolling horizon, so they
    // need topping up every launch. Fire and forget — it never rejects.
    refreshAllReminders();
  }, []);

  useEffect(() => {
    if (!fontsLoaded && !fontError) return;

    if (fontError) {
      console.warn('[fonts] Nunito failed to load — falling back to the system font', fontError);
    }

    SplashScreen.hideAsync().catch(() => {
      // Already hidden, or no splash to hide.
    });
  }, [fontsLoaded, fontError]);

  // Every hook above runs before this point, so the early return is safe.
  // A font that fails to load is not worth blocking the app over: the app renders
  // in the system font instead, which is why `fontError` lets us through rather
  // than holding the splash forever.
  if (!fontsLoaded && !fontError) return null;

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
        <Stack.Screen name="usage-access" options={{ presentation: 'modal' }} />
      </Stack>

      {/* Above the navigator rather than inside a screen, so a nudge raised on
          any tab draws over the whole app. */}
      <SuperviseNudgeAlert />
    </View>
  );
}
