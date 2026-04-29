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
  | 'ribbon-outline'
  | 'ribbon'
  | 'document-text-outline'
  | 'document-text'
  | 'megaphone-outline'
  | 'megaphone'
  | 'time-outline'
  | 'time'
  | 'notifications-outline'
  | 'notifications'
  | 'person-outline'
  | 'person'
  | 'card-outline'
  | 'card'
  | 'ticket-outline'
  | 'ticket'
  | 'folder-outline'
  | 'folder';

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

  if (routeName === 'marks') {
    return focused ? 'ribbon' : 'ribbon-outline';
  }

  if (routeName === 'notices') {
    return focused ? 'megaphone' : 'megaphone-outline';
  }

  if (routeName === 'routine') {
    return focused ? 'time' : 'time-outline';
  }

  if (routeName === 'notifications') {
    return focused ? 'notifications' : 'notifications-outline';
  }

  if (routeName === 'profile') {
    return focused ? 'person' : 'person-outline';
  }

  if (routeName === 'id-card') {
    return focused ? 'card' : 'card-outline';
  }

  if (routeName === 'tickets') {
    return focused ? 'ticket' : 'ticket-outline';
  }

  if (routeName === 'materials') {
    return focused ? 'folder' : 'folder-outline';
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
      <Tabs.Screen name="marks" options={{ title: 'Marks' }} />
      <Tabs.Screen name="assignments" options={{ title: 'Assignments' }} />
      <Tabs.Screen name="notices" options={{ title: 'Notices' }} />
      <Tabs.Screen name="routine" options={{ title: 'Routine' }} />
      <Tabs.Screen name="id-card" options={{ title: 'ID Card' }} />
      <Tabs.Screen name="tickets" options={{ title: 'Tickets' }} />
      <Tabs.Screen name="materials" options={{ title: 'Materials' }} />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Notifications',
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
        }}
      />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
