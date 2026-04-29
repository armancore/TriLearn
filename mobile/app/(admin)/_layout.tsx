import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { COLORS } from '@/src/constants/colors';

type IconName = 'home-outline' | 'home' | 'people-outline' | 'people' | 'document-text-outline' | 'document-text' | 'person-outline' | 'person';

const iconFor = (routeName: string, focused: boolean): IconName => {
  if (routeName === 'users') return focused ? 'people' : 'people-outline';
  if (routeName === 'applications') return focused ? 'document-text' : 'document-text-outline';
  if (routeName === 'profile') return focused ? 'person' : 'person-outline';
  return focused ? 'home' : 'home-outline';
};

export default function AdminTabsLayout() {
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
      <Tabs.Screen name="users" options={{ title: 'Users' }} />
      <Tabs.Screen name="applications" options={{ title: 'Applications' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
