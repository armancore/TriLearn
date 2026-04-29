import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { COLORS } from '@/src/constants/colors';

type InstructorTabIconName =
  | 'home-outline'
  | 'home'
  | 'book-outline'
  | 'book'
  | 'notifications-outline'
  | 'notifications'
  | 'qr-code-outline'
  | 'qr-code'
  | 'ribbon-outline'
  | 'ribbon';

const getInstructorTabIcon = (routeName: string, focused: boolean): InstructorTabIconName => {
  if (routeName === 'courses') return focused ? 'book' : 'book-outline';
  if (routeName === 'updates') return focused ? 'notifications' : 'notifications-outline';
  if (routeName === 'qr') return focused ? 'qr-code' : 'qr-code-outline';
  if (routeName === 'marks') return focused ? 'ribbon' : 'ribbon-outline';

  return focused ? 'home' : 'home-outline';
};

export default function InstructorTabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerTintColor: '#FFFFFF',
        headerStyle: { backgroundColor: COLORS.primary },
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.muted,
        tabBarIcon: ({ color, focused, size }) => (
          <Ionicons color={color} name={getInstructorTabIcon(route.name, focused)} size={size} />
        ),
      })}
    >
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="courses" options={{ title: 'Courses' }} />
      <Tabs.Screen name="updates" options={{ title: 'Updates' }} />
      <Tabs.Screen name="qr" options={{ title: 'QR' }} />
      <Tabs.Screen name="marks" options={{ title: 'Marks' }} />
      <Tabs.Screen name="attendance" options={{ href: null }} />
    </Tabs>
  );
}
