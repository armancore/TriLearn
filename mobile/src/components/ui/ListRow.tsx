import { Ionicons } from '@expo/vector-icons';
import { Pressable, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';
import { MIN_TOUCH_TARGET, radius } from '@/src/theme/tokens';

import { Text } from './Text';

export interface ListRowProps {
  title: string;
  description?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconTone?: 'primary' | 'danger' | 'neutral';
  /** Right-hand text, e.g. a count or a date. */
  meta?: string;
  onPress?: () => void;
  /** Hides the chevron on rows that are not navigational. */
  showChevron?: boolean;
  /** Draws a hairline under the row; omit for the last item in a group. */
  divider?: boolean;
  accessibilityHint?: string;
  style?: ViewStyle;
}

/** Settings-style row used for menus and detail lists. */
export function ListRow({
  title,
  description,
  icon,
  iconTone = 'primary',
  meta,
  onPress,
  showChevron = true,
  divider = true,
  accessibilityHint,
  style,
}: ListRowProps) {
  const { colors } = useTheme();

  const iconColors = {
    primary: { background: colors.primarySoft, foreground: colors.primarySoftText },
    danger: { background: colors.dangerSoft, foreground: colors.danger },
    neutral: { background: colors.surfaceMuted, foreground: colors.textMuted },
  }[iconTone];

  const content = (
    <>
      {icon ? (
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: radius.md,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: iconColors.background,
          }}
        >
          <Ionicons color={iconColors.foreground} name={icon} size={19} />
        </View>
      ) : null}

      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} tone={iconTone === 'danger' ? 'danger' : 'default'} variant="bodyStrong">
          {title}
        </Text>
        {description ? (
          <Text numberOfLines={2} style={{ marginTop: 2 }} tone="muted" variant="caption">
            {description}
          </Text>
        ) : null}
      </View>

      {meta ? (
        <Text tone="subtle" variant="caption">
          {meta}
        </Text>
      ) : null}

      {onPress && showChevron ? <Ionicons color={colors.textSubtle} name="chevron-forward" size={18} /> : null}
    </>
  );

  const rowStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: MIN_TOUCH_TARGET + 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: divider ? 1 : 0,
    borderBottomColor: colors.border,
  };

  if (!onPress) {
    return <View style={[rowStyle, style]}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={description ? `${title}. ${description}` : title}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [rowStyle, pressed ? { backgroundColor: colors.surfacePressed } : null, style]}
    >
      {content}
    </Pressable>
  );
}
