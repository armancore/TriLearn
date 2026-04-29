import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { COLORS } from '@/src/constants/colors';

type GatekeeperTabIconName = 'home-outline' | 'home' | 'person-outline' | 'person';

const getGatekeeperTabIcon = (routeName: string, focused: boolean): GatekeeperTabIconName => {
  if (routeName === 'profile') {
    return focused ? 'person' : 'person-outline';
  }

  return focused ? 'home' : 'home-outline';
};

export default function GatekeeperTabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerTintColor: '#FFFFFF',
        headerStyle: { backgroundColor: COLORS.primary },
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.muted,
        tabBarIcon: ({ color, focused, size }) => (
          <Ionicons color={color} name={getGatekeeperTabIcon(route.name, focused)} size={size} />
        ),
      })}
    >
      <Tabs.Screen name="dashboard" options={{ title: 'Gate QR' }} />
      <Tabs.Screen name="scanner" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
