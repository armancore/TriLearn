import { Tabs } from 'expo-router';

import { useTabScreenOptions, type TabIconResolver } from '@/src/components/ui/TabBarOptions';

const getAdminTabIcon: TabIconResolver = (routeName, focused) => {
  if (routeName === 'users') return focused ? 'people' : 'people-outline';
  if (routeName === 'applications') return focused ? 'document-text' : 'document-text-outline';
  if (routeName === 'profile') return focused ? 'person-circle' : 'person-circle-outline';

  return focused ? 'home' : 'home-outline';
};

export default function AdminTabsLayout() {
  const screenOptions = useTabScreenOptions(getAdminTabIcon);

  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen name="dashboard" options={{ title: 'Home' }} />
      <Tabs.Screen name="users" options={{ title: 'Users' }} />
      <Tabs.Screen name="applications" options={{ title: 'Applications' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
