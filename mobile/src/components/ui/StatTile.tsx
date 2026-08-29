import { Ionicons } from '@expo/vector-icons';
import { View, type ViewStyle } from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';
import { radius } from '@/src/theme/tokens';

import { Text } from './Text';

export interface StatTileProps {
  label: string;
  value: string | number;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Renders for placement on a primary-coloured card. */
  onPrimary?: boolean;
  /** Overrides the value colour, e.g. to flag a risk threshold. */
  valueColor?: string;
  style?: ViewStyle;
}

/**
 * Compact label/value pair. The two lines are merged into one accessible node
 * so a screen reader reads "Semester, 5" instead of two orphaned fragments.
 */
export function StatTile({ label, value, icon, onPrimary = false, valueColor, style }: StatTileProps) {
  const { colors } = useTheme();

  return (
    <View
      accessibilityLabel={`${label}: ${value}`}
      accessible
      style={[
        {
          flex: 1,
          minWidth: 96,
          padding: 12,
          borderRadius: radius.md,
          backgroundColor: onPrimary ? 'rgba(255,255,255,0.14)' : colors.surfaceMuted,
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon ? (
          <Ionicons color={onPrimary ? 'rgba(255,255,255,0.85)' : colors.textSubtle} name={icon} size={13} />
        ) : null}
        <Text
          numberOfLines={1}
          style={onPrimary ? { color: 'rgba(255,255,255,0.85)' } : undefined}
          tone={onPrimary ? 'inherit' : 'subtle'}
          variant="label"
        >
          {label}
        </Text>
      </View>
      <Text
        numberOfLines={1}
        style={{ marginTop: 4, color: valueColor ?? (onPrimary ? '#FFFFFF' : undefined) }}
        tone={valueColor || onPrimary ? 'inherit' : 'default'}
        variant="subheading"
      >
        {value}
      </Text>
    </View>
  );
}
