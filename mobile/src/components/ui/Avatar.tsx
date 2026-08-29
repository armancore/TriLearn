import { View, type ViewStyle } from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';
import { radius } from '@/src/theme/tokens';

import { Text } from './Text';

export interface AvatarProps {
  name?: string | null;
  size?: number;
  /** Renders for placement on a primary-coloured surface. */
  onPrimary?: boolean;
  style?: ViewStyle;
}

export const getInitials = (name?: string | null) => {
  if (!name) {
    return 'U';
  }

  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] ?? '')
      .join('')
      .toUpperCase() || 'U'
  );
};

/**
 * Initials avatar. Decorative by design — the person's name is always shown
 * next to it, so it is hidden from assistive tech to avoid a duplicate read.
 */
export function Avatar({ name, size = 52, onPrimary = false, style }: AvatarProps) {
  const { colors } = useTheme();

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width: size,
          height: size,
          borderRadius: radius.full,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: onPrimary ? 'rgba(255,255,255,0.18)' : colors.primarySoft,
          borderWidth: onPrimary ? 1 : 0,
          borderColor: 'rgba(255,255,255,0.28)',
        },
        style,
      ]}
    >
      <Text
        style={{
          color: onPrimary ? '#FFFFFF' : colors.primarySoftText,
          fontSize: Math.round(size * 0.36),
          fontWeight: '700',
        }}
        tone="inherit"
      >
        {getInitials(name)}
      </Text>
    </View>
  );
}
