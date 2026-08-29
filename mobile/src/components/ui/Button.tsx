import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  View,
  type GestureResponderEvent,
  type PressableProps,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';
import { MIN_TOUCH_TARGET, radius } from '@/src/theme/tokens';

import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'tonal' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: 'leading' | 'trailing';
  /** Stretches the button to fill its row. */
  fullWidth?: boolean;
  style?: ViewStyle;
}

const SIZE: Record<ButtonSize, { height: number; paddingHorizontal: number; icon: number }> = {
  // Even `sm` is a real 44pt target — `hitSlop` is ignored on web, so it can
  // never be the only thing keeping a control tappable.
  sm: { height: 44, paddingHorizontal: 14, icon: 16 },
  md: { height: MIN_TOUCH_TARGET, paddingHorizontal: 18, icon: 18 },
  lg: { height: 54, paddingHorizontal: 22, icon: 20 },
};

const TEXT_VARIANT: Record<ButtonSize, 'caption' | 'bodyStrong' | 'subheading'> = {
  sm: 'caption',
  md: 'bodyStrong',
  lg: 'subheading',
};

/**
 * Primary action control.
 *
 * Accessibility notes: the busy state is announced rather than only shown as a
 * spinner, disabled buttons stay in the focus order with an explicit state, and
 * every size keeps a >= 44pt effective target via `hitSlop`.
 */
export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconPosition = 'leading',
  fullWidth = true,
  disabled,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  style,
  ...props
}: ButtonProps) {
  const { colors } = useTheme();
  const isInactive = Boolean(disabled) || loading;

  const fills: Record<ButtonVariant, { background: string; border: string; content: string }> = {
    primary: { background: colors.primary, border: colors.primary, content: colors.textOnPrimary },
    secondary: { background: colors.surface, border: colors.borderStrong, content: colors.text },
    tonal: { background: colors.primarySoft, border: colors.primarySoft, content: colors.primarySoftText },
    ghost: { background: 'transparent', border: 'transparent', content: colors.primaryText },
    danger: { background: colors.danger, border: colors.danger, content: '#FFFFFF' },
  };

  const fill = fills[variant];
  const dimensions = SIZE[size];

  const handlePress = (event: GestureResponderEvent) => {
    if (Platform.OS !== 'web') {
      void Haptics.selectionAsync().catch(() => {});
    }

    onPress?.(event);
  };

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ disabled: isInactive, busy: loading }}
      disabled={isInactive}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      onPress={handlePress}
      style={({ pressed }) => [
        {
          height: dimensions.height,
          paddingHorizontal: dimensions.paddingHorizontal,
          backgroundColor: fill.background,
          borderColor: fill.border,
          borderWidth: 1,
          borderRadius: radius.md,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          opacity: isInactive ? 0.55 : 1,
        },
        pressed ? { opacity: 0.8, transform: [{ scale: 0.985 }] } : null,
        style,
      ]}
      {...props}
    >
      {loading ? <ActivityIndicator color={fill.content} size="small" /> : null}
      {!loading && icon && iconPosition === 'leading' ? (
        <Ionicons color={fill.content} name={icon} size={dimensions.icon} />
      ) : null}
      <Text numberOfLines={1} style={{ color: fill.content }} tone="inherit" variant={TEXT_VARIANT[size]}>
        {loading ? 'Working…' : label}
      </Text>
      {!loading && icon && iconPosition === 'trailing' ? (
        <Ionicons color={fill.content} name={icon} size={dimensions.icon} />
      ) : null}
    </Pressable>
  );
}

export interface IconButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  icon: keyof typeof Ionicons.glyphMap;
  /** Required — an icon alone gives assistive tech nothing to read. */
  accessibilityLabel: string;
  variant?: 'solid' | 'soft' | 'ghost' | 'onPrimary';
  size?: number;
  badgeCount?: number;
  style?: ViewStyle;
}

/** Compact icon-only control with a guaranteed 48pt target. */
export function IconButton({
  icon,
  accessibilityLabel,
  variant = 'soft',
  size = MIN_TOUCH_TARGET,
  badgeCount,
  disabled,
  onPress,
  style,
  ...props
}: IconButtonProps) {
  const { colors } = useTheme();

  const fills = {
    solid: { background: colors.primary, content: colors.textOnPrimary },
    soft: { background: colors.primarySoft, content: colors.primarySoftText },
    ghost: { background: 'transparent', content: colors.text },
    onPrimary: { background: 'rgba(255,255,255,0.16)', content: '#FFFFFF' },
  } as const;

  const fill = fills[variant];

  const handlePress = (event: GestureResponderEvent) => {
    if (Platform.OS !== 'web') {
      void Haptics.selectionAsync().catch(() => {});
    }

    onPress?.(event);
  };

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={handlePress}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: radius.full,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: fill.background,
          opacity: disabled ? 0.5 : 1,
        },
        pressed ? { opacity: 0.75 } : null,
        style,
      ]}
      {...props}
    >
      <Ionicons color={fill.content} name={icon} size={Math.round(size * 0.46)} />
      {badgeCount && badgeCount > 0 ? (
        <View
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            minWidth: 18,
            height: 18,
            paddingHorizontal: 5,
            borderRadius: radius.full,
            backgroundColor: colors.danger,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: fill.background === 'transparent' ? colors.surface : fill.background,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }} tone="inherit">
            {badgeCount > 99 ? '99+' : badgeCount}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
