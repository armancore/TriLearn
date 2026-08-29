import { Tabs } from 'expo-router';

import { useTabScreenOptions, type TabIconResolver } from '@/src/components/ui/TabBarOptions';

const getInstructorTabIcon: TabIconResolver = (routeName, focused) => {
  if (routeName === 'courses') return focused ? 'book' : 'book-outline';
  if (routeName === 'updates') return focused ? 'megaphone' : 'megaphone-outline';
  if (routeName === 'qr') return focused ? 'qr-code' : 'qr-code-outline';
  if (routeName === 'marks') return focused ? 'ribbon' : 'ribbon-outline';
  if (routeName === 'attendance') return focused ? 'calendar' : 'calendar-outline';
  if (routeName === 'profile') return focused ? 'person-circle' : 'person-circle-outline';

  return focused ? 'home' : 'home-outline';
};

export default function InstructorTabsLayout() {
  const screenOptions = useTabScreenOptions(getInstructorTabIcon);

  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen name="dashboard" options={{ title: 'Home' }} />
      <Tabs.Screen name="courses" options={{ title: 'Courses' }} />
      <Tabs.Screen name="attendance" options={{ title: 'Attendance' }} />
      <Tabs.Screen name="marks" options={{ title: 'Marks' }} />
      <Tabs.Screen name="qr" options={{ title: 'QR' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />

      <Tabs.Screen name="updates" options={{ href: null, title: 'Updates' }} />
    </Tabs>
  );
}
