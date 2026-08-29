import { Pressable, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';

import { Text } from './Text';

export interface SectionProps {
  title: string;
  /**
   * Settings-style group label: small, uppercase and muted instead of a large
   * heading. Use for lists of rows, where a 20px heading per group shouts and
   * wastes vertical space. Still exposed as a header for rotor navigation.
   */
  compact?: boolean;
  /** Optional supporting line under the title. */
  description?: string;
  /** Right-aligned text action, e.g. "See all". */
  actionLabel?: string;
  onAction?: () => void;
  children?: React.ReactNode;
  style?: ViewStyle;
}

/**
 * Titled content group. The title carries the `header` role so screen-reader
 * users can jump between sections with rotor / heading navigation.
 */
export function Section({
  title,
  description,
  actionLabel,
  onAction,
  children,
  compact = false,
  style,
}: SectionProps) {
  return (
    <View style={[{ marginTop: compact ? 22 : 24 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text
            accessibilityRole="header"
            style={compact ? { marginLeft: 4 } : undefined}
            tone={compact ? 'subtle' : 'default'}
            uppercase={compact}
            variant={compact ? 'label' : 'heading'}
          >
            {title}
          </Text>
          {description ? (
            <Text style={{ marginTop: 2 }} tone="muted" variant="caption">
              {description}
            </Text>
          ) : null}
        </View>

        {actionLabel && onAction ? (
          <Pressable
            accessibilityLabel={`${actionLabel}, ${title}`}
            accessibilityRole="button"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={onAction}
            // Real dimensions, since `hitSlop` does nothing on web.
            style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' }}
          >
            {({ pressed }) => (
              <Text style={{ opacity: pressed ? 0.6 : 1 }} tone="primary" variant="bodyStrong">
                {actionLabel}
              </Text>
            )}
          </Pressable>
        ) : null}
      </View>

      <View style={{ marginTop: compact ? 8 : 12 }}>{children}</View>
    </View>
  );
}

/** Hairline separator. Decorative, so it is hidden from assistive tech. */
export function Divider({ style }: { style?: ViewStyle }) {
  const { colors } = useTheme();

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[{ height: 1, backgroundColor: colors.border }, style]}
    />
  );
}
