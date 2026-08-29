import { Tabs } from 'expo-router';

import { useTabScreenOptions, type TabIconResolver } from '@/src/components/ui/TabBarOptions';

const getCoordinatorTabIcon: TabIconResolver = (routeName, focused) => {
  if (routeName === 'students') return focused ? 'people' : 'people-outline';
  if (routeName === 'attendance') return focused ? 'stats-chart' : 'stats-chart-outline';
  if (routeName === 'notices') return focused ? 'megaphone' : 'megaphone-outline';
  if (routeName === 'profile') return focused ? 'person-circle' : 'person-circle-outline';

  return focused ? 'home' : 'home-outline';
};

export default function CoordinatorTabsLayout() {
  const screenOptions = useTabScreenOptions(getCoordinatorTabIcon);

  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen name="dashboard" options={{ title: 'Home' }} />
      <Tabs.Screen name="students" options={{ title: 'Students' }} />
      <Tabs.Screen name="attendance" options={{ title: 'Attendance' }} />
      <Tabs.Screen name="notices" options={{ title: 'Notices' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
