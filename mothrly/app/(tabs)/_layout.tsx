import { Tabs } from 'expo-router';

import { colors, fonts } from '@/lib/theme';

/**
 * Tab navigator.
 *
 * Header titles and tab labels are drawn by React Navigation rather than by any
 * screen's StyleSheet, so the typeface has to be handed to it here or the chrome
 * stays on the system font while every screen switches to Nunito.
 */
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontFamily: fonts.medium },
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border },
        headerTitleStyle: { fontFamily: fonts.bold, color: colors.text },
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        // Home draws its own greeting row and handles the top inset itself, so a
        // native header on top of it would just repeat the title.
        options={{ title: 'Home', tabBarLabel: 'Home', headerShown: false }}
      />
      <Tabs.Screen name="supervise" options={{ title: 'Supervise', tabBarLabel: 'Supervise' }} />
      <Tabs.Screen name="personas" options={{ title: 'Personas', tabBarLabel: 'Personas' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarLabel: 'Settings' }} />
    </Tabs>
  );
}
