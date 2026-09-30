import { Tabs } from 'expo-router';

import { AppGridIcon, MasksIcon, SettingsIcon } from '@/components/Icons';
import MomAvatar from '@/components/MomAvatar';
import { colors, fonts } from '@/lib/theme';
import { useActivePersona } from '@/store/personaStore';

/**
 * Tab navigator.
 *
 * Each tab has an SVG icon instead of a plain text label. The Home tab uses a
 * small {@link MomAvatar} whose body colour and facial expression track the
 * active persona, so switching mood is visible everywhere — even in the nav bar.
 *
 * Header titles and tab labels are drawn by React Navigation rather than by any
 * screen's StyleSheet, so the typeface has to be handed to it here or the chrome
 * stays on the system font while every screen switches to Nunito.
 */
export default function TabLayout() {
  const persona = useActivePersona();

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarShowLabel: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          height: 52,
        },
        headerTitleStyle: { fontFamily: fonts.bold, color: colors.text },
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarLabel: 'Home',
          headerShown: false,
          tabBarIcon: () => (
            <MomAvatar
              size={28}
              color={persona.accentColor}
              personaId={persona.id}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="supervise"
        options={{
          title: 'Supervise',
          tabBarLabel: 'Supervise',
          tabBarIcon: ({ color, size }) => <AppGridIcon size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="personas"
        options={{
          title: 'Personas',
          tabBarLabel: 'Personas',
          tabBarIcon: ({ color, size }) => <MasksIcon size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color, size }) => <SettingsIcon size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}

