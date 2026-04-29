import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { COLORS } from '@/src/constants/colors';

type GatekeeperTabIconName = 'scan-outline' | 'qr-code' | 'home-outline' | 'home' | 'person-outline' | 'person';

const getGatekeeperTabIcon = (routeName: string, focused: boolean): GatekeeperTabIconName => {
  if (routeName === 'scanner') {
    return focused ? 'qr-code' : 'scan-outline';
  }

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
      <Tabs.Screen name="scanner" options={{ title: 'Scanner' }} />
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
