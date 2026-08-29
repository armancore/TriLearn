import { Ionicons } from '@expo/vector-icons';
import { View, type ViewStyle } from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';
import { radius } from '@/src/theme/tokens';

import { Text } from './Text';

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Screen-reader text when the visual label is an abbreviation. */
  accessibilityLabel?: string;
  style?: ViewStyle;
}

/**
 * Status pill. Every tone pairs a tinted fill with a text colour that clears
 * 4.5:1 against it, and an optional icon so status is never colour-only.
 */
export function Badge({ label, tone = 'neutral', icon, accessibilityLabel, style }: BadgeProps) {
  const { colors } = useTheme();

  const tones: Record<BadgeTone, { background: string; text: string }> = {
    neutral: { background: colors.surfaceMuted, text: colors.textMuted },
    primary: { background: colors.primarySoft, text: colors.primarySoftText },
    success: { background: colors.successSoft, text: colors.successSoftText },
    warning: { background: colors.warningSoft, text: colors.warningSoftText },
    danger: { background: colors.dangerSoft, text: colors.dangerSoftText },
    info: { background: colors.infoSoft, text: colors.infoSoftText },
    accent: { background: colors.accentSoft, text: colors.accentSoftText },
  };

  const palette = tones[tone];

  return (
    <View
      accessibilityLabel={accessibilityLabel ?? label}
      accessible
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          alignSelf: 'flex-start',
          paddingHorizontal: 10,
          paddingVertical: 5,
          borderRadius: radius.full,
          backgroundColor: palette.background,
        },
        style,
      ]}
    >
      {icon ? <Ionicons color={palette.text} name={icon} size={12} /> : null}
      <Text numberOfLines={1} style={{ color: palette.text, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 }} tone="inherit">
        {label}
      </Text>
    </View>
  );
}
