import { router } from 'expo-router';
import { View } from 'react-native';

import { Button, Text } from '@/src/components/ui';
import { useTheme } from '@/src/theme/ThemeProvider';
import { radius } from '@/src/theme/tokens';
import { Ionicons } from '@expo/vector-icons';

export default function NotFoundScreen() {
  const { colors } = useTheme();

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 28,
        backgroundColor: colors.background,
      }}
    >
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: radius.full,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surfaceMuted,
        }}
      >
        <Ionicons color={colors.textSubtle} name="compass-outline" size={32} />
      </View>

      <Text accessibilityRole="header" center style={{ marginTop: 18 }} variant="title">
        Page not found
      </Text>
      <Text center style={{ marginTop: 8, maxWidth: 320 }} tone="muted" variant="caption">
        This screen does not exist, or the link that brought you here is out of date.
      </Text>

      <Button
        fullWidth={false}
        icon="arrow-back"
        label={router.canGoBack() ? 'Go back' : 'Go to sign in'}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(auth)/login'))}
        style={{ marginTop: 22 }}
      />
    </View>
  );
}
