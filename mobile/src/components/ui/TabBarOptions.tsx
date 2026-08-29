import { Ionicons } from '@expo/vector-icons';
import type { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/src/theme/ThemeProvider';

export type TabIconResolver = (routeName: string, focused: boolean) => keyof typeof Ionicons.glyphMap;

/**
 * Shared bottom-tab styling for every role.
 *
 * Keeping this in one place means the five role navigators cannot drift apart,
 * and it guarantees the accessible details each of them needs: the active tab
 * is marked by a filled icon as well as colour, labels are always visible
 * (icon-only tabs are a common WCAG 1.3.1/2.4.6 failure), and the bar respects
 * the device's bottom inset so targets are never under the home indicator.
 */
export const useTabScreenOptions = (
  getIcon: TabIconResolver,
): ((props: { route: { name: string } }) => BottomTabNavigationOptions) => {
  const { colors, elevation } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === 'web' ? 0 : insets.bottom;

  return ({ route }) => ({
    // Screens render their own `ScreenHeader`.
    headerShown: false,
    tabBarActiveTintColor: colors.tabBarActive,
    tabBarInactiveTintColor: colors.tabBarInactive,
    tabBarLabelPosition: 'below-icon',
    tabBarAllowFontScaling: true,
    tabBarStyle: {
      backgroundColor: colors.tabBarBackground,
      borderTopColor: colors.tabBarBorder,
      borderTopWidth: 1,
      height: 60 + bottomInset,
      paddingTop: 8,
      paddingBottom: 8 + bottomInset,
      ...elevation.none,
    },
    tabBarItemStyle: {
      // Keeps each tab above the 48dp minimum target height.
      minHeight: 48,
      paddingVertical: 2,
    },
    tabBarLabelStyle: {
      fontSize: 11,
      fontWeight: '600',
      marginTop: 2,
    },
    tabBarBadgeStyle: {
      backgroundColor: colors.danger,
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '700',
    },
    tabBarIcon: ({ color, focused, size }) => (
      <Ionicons color={color} name={getIcon(route.name, focused)} size={size ?? 22} />
    ),
  });
};
