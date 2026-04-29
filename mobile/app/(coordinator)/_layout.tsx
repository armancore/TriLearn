import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { COLORS } from '@/src/constants/colors';

type IconName =
  | 'home-outline'
  | 'home'
  | 'people-outline'
  | 'people'
  | 'stats-chart-outline'
  | 'stats-chart'
  | 'megaphone-outline'
  | 'megaphone'
  | 'person-outline'
  | 'person';

const iconFor = (routeName: string, focused: boolean): IconName => {
  if (routeName === 'students') return focused ? 'people' : 'people-outline';
  if (routeName === 'attendance') return focused ? 'stats-chart' : 'stats-chart-outline';
  if (routeName === 'notices') return focused ? 'megaphone' : 'megaphone-outline';
  if (routeName === 'profile') return focused ? 'person' : 'person-outline';
  return focused ? 'home' : 'home-outline';
};

export default function CoordinatorTabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerTintColor: '#FFFFFF',
        headerStyle: { backgroundColor: COLORS.primary },
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.muted,
        tabBarIcon: ({ color, focused, size }) => <Ionicons color={color} name={iconFor(route.name, focused)} size={size} />,
      })}
    >
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="students" options={{ title: 'Students' }} />
      <Tabs.Screen name="attendance" options={{ title: 'Attendance' }} />
      <Tabs.Screen name="notices" options={{ title: 'Notices' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
