import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { COLORS } from '@/src/constants/colors';
import { useNotifications } from '@/src/hooks/useNotifications';
import { useNotificationsStore } from '@/src/store/notifications.store';

type StudentTabIconName =
  | 'home-outline'
  | 'home'
  | 'calendar-outline'
  | 'calendar'
  | 'document-text-outline'
  | 'document-text'
  | 'notifications-outline'
  | 'notifications';

const getStudentTabIcon = (
  routeName: string,
  focused: boolean,
): StudentTabIconName => {
  if (routeName === 'attendance') {
    return focused ? 'calendar' : 'calendar-outline';
  }

  if (routeName === 'assignments') {
    return focused ? 'document-text' : 'document-text-outline';
  }

  if (routeName === 'notifications') {
    return focused ? 'notifications' : 'notifications-outline';
  }

  return focused ? 'home' : 'home-outline';
};

export default function StudentTabsLayout() {
  useNotifications();
  const unreadCount = useNotificationsStore((state) => state.unreadCount);

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerTintColor: '#FFFFFF',
        headerStyle: { backgroundColor: COLORS.primary },
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.muted,
        tabBarIcon: ({ color, focused, size }) => (
          <Ionicons color={color} name={getStudentTabIcon(route.name, focused)} size={size} />
        ),
      })}
    >
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="attendance" options={{ title: 'Attendance' }} />
      <Tabs.Screen name="assignments" options={{ title: 'Assignments' }} />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Notifications',
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
        }}
      />
    </Tabs>
  );
}
