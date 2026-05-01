import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

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
  | 'ellipsis-horizontal-circle-outline'
  | 'ellipsis-horizontal-circle';

const getStudentTabIcon = (
  routeName: string,
  focused: boolean,
): StudentTabIconName => {
  if (routeName === 'attendance') {
    return focused ? 'calendar' : 'calendar-outline';
  }

  if (routeName === 'marks') {
    return focused ? 'ribbon' : 'ribbon-outline';
  }

  if (routeName === 'assignments') {
    return focused ? 'document-text' : 'document-text-outline';
  }

  if (routeName === 'more') {
    return focused ? 'ellipsis-horizontal-circle' : 'ellipsis-horizontal-circle-outline';
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
        tabBarActiveTintColor: COLORS.accent,
        tabBarInactiveTintColor: '#6B7280',
        tabBarLabelPosition: 'below-icon',
        tabBarStyle: {
          borderTopColor: '#E5E7EB',
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
        },
        tabBarIcon: ({ color, focused, size }) => (
          <Ionicons color={color} name={getStudentTabIcon(route.name, focused)} size={size} />
        ),
      })}
    >
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="attendance" options={{ title: 'Attendance' }} />
      <Tabs.Screen name="marks" options={{ title: 'Marks' }} />
      <Tabs.Screen name="assignments" options={{ title: 'Assignments' }} />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
        }}
      />

      <Tabs.Screen name="routine" options={{ href: null, title: 'Routine' }} />
      <Tabs.Screen name="notices" options={{ href: null, title: 'Notices' }} />
      <Tabs.Screen name="materials" options={{ href: null, title: 'Materials' }} />
      <Tabs.Screen name="id-card" options={{ href: null, title: 'ID Card' }} />
      <Tabs.Screen name="tickets" options={{ href: null, title: 'Tickets' }} />
      <Tabs.Screen name="notifications" options={{ href: null, title: 'Notifications' }} />
      <Tabs.Screen name="scanner" options={{ href: null, title: 'Scanner' }} />
      <Tabs.Screen name="profile" options={{ href: null, title: 'Profile' }} />
    </Tabs>
  );
}
