import NetInfo from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Text } from '@/src/components/ui';
import { useTheme } from '@/src/theme/ThemeProvider';

/**
 * Connectivity banner.
 *
 * Announced as a live region so screen-reader users learn the app went offline
 * without having to discover the banner by touch, and it pairs an icon with the
 * colour so the state is not communicated by hue alone.
 */
export default function OfflineBanner() {
  const { colors } = useTheme();
  const [isConnected, setIsConnected] = useState<boolean | null>(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected);
    });

    return unsubscribe;
  }, []);

  if (isConnected !== false) {
    return null;
  }

  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        paddingHorizontal: 20,
        paddingVertical: 10,
        backgroundColor: colors.warningSoft,
        borderBottomWidth: 1,
        borderBottomColor: colors.warning,
      }}
    >
      <Ionicons color={colors.warningSoftText} name="cloud-offline" size={16} />
      <Text style={{ color: colors.warningSoftText, flex: 1 }} tone="inherit" variant="caption">
        You are offline — showing the last data we loaded.
      </Text>
    </View>
  );
}
