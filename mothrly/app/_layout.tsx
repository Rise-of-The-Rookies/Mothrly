import { Stack } from 'expo-router';

import { configureRevenueCat } from '@/lib/revenuecat';

// Configure RevenueCat once, at module load, before any screen renders.
configureRevenueCat();

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
