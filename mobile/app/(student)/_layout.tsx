import { Tabs } from 'expo-router';

import { useTabScreenOptions, type TabIconResolver } from '@/src/components/ui/TabBarOptions';
import { useNotifications } from '@/src/hooks/useNotifications';
import { useNotificationsStore } from '@/src/store/notifications.store';

const getStudentTabIcon: TabIconResolver = (routeName, focused) => {
  if (routeName === 'attendance') return focused ? 'calendar' : 'calendar-outline';
  if (routeName === 'marks') return focused ? 'ribbon' : 'ribbon-outline';
  if (routeName === 'assignments') return focused ? 'document-text' : 'document-text-outline';
  if (routeName === 'more') return focused ? 'grid' : 'grid-outline';

  return focused ? 'home' : 'home-outline';
};

export default function StudentTabsLayout() {
  useNotifications();
  const unreadCount = useNotificationsStore((state) => state.unreadCount);
  const screenOptions = useTabScreenOptions(getStudentTabIcon);

  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen name="dashboard" options={{ title: 'Home' }} />
      <Tabs.Screen name="attendance" options={{ title: 'Attendance' }} />
      <Tabs.Screen name="marks" options={{ title: 'Marks' }} />
      <Tabs.Screen name="assignments" options={{ title: 'Work' }} />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarAccessibilityLabel:
            unreadCount > 0 ? `More, ${unreadCount} unread notifications` : 'More',
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
