import { Tabs } from 'expo-router';

import { useTabScreenOptions, type TabIconResolver } from '@/src/components/ui/TabBarOptions';

const getGatekeeperTabIcon: TabIconResolver = (routeName, focused) => {
  if (routeName === 'scanner') return focused ? 'scan-circle' : 'scan-circle-outline';
  if (routeName === 'profile') return focused ? 'person-circle' : 'person-circle-outline';

  return focused ? 'qr-code' : 'qr-code-outline';
};

export default function GatekeeperTabsLayout() {
  const screenOptions = useTabScreenOptions(getGatekeeperTabIcon);

  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen name="dashboard" options={{ title: 'Gate QR' }} />
      <Tabs.Screen name="scanner" options={{ title: 'Scanner' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
