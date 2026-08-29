import { Pressable, View, type PressableProps, type ViewProps } from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';
import { radius as radiusTokens, spacing } from '@/src/theme/tokens';

type CardVariant = 'surface' | 'muted' | 'primary' | 'outline';
type CardPadding = 'none' | 'sm' | 'md' | 'lg';

const PADDING: Record<CardPadding, number> = {
  none: 0,
  sm: spacing.md,
  md: spacing.lg,
  lg: spacing.xl,
};

export interface CardProps extends ViewProps {
  variant?: CardVariant;
  padding?: CardPadding;
  /** Raised cards use a soft shadow; flat ones rely on the border alone. */
  raised?: boolean;
}

const useCardStyle = (variant: CardVariant, raised: boolean) => {
  const { colors, elevation } = useTheme();

  const background: Record<CardVariant, string> = {
    surface: colors.surface,
    muted: colors.surfaceMuted,
    primary: colors.primary,
    outline: 'transparent',
  };

  const border: Record<CardVariant, string> = {
    surface: colors.border,
    muted: colors.border,
    primary: colors.primary,
    outline: colors.border,
  };

  return {
    backgroundColor: background[variant],
    borderColor: border[variant],
    borderWidth: 1,
    borderRadius: radiusTokens.lg,
    ...(raised && variant !== 'outline' ? elevation.sm : elevation.none),
  };
};

/** Static content container. */
export function Card({ variant = 'surface', padding = 'lg', raised = true, style, ...props }: CardProps) {
  const cardStyle = useCardStyle(variant, raised);

  return <View style={[cardStyle, { padding: PADDING[padding] }, style]} {...props} />;
}

export interface PressableCardProps extends Omit<PressableProps, 'style'> {
  variant?: CardVariant;
  padding?: CardPadding;
  raised?: boolean;
  style?: ViewProps['style'];
}

/**
 * Tappable card. Always announces itself as a button and dims on press so the
 * affordance is visible without relying on colour alone.
 */
export function PressableCard({
  variant = 'surface',
  padding = 'lg',
  raised = true,
  style,
  accessibilityRole = 'button',
  disabled,
  ...props
}: PressableCardProps) {
  const cardStyle = useCardStyle(variant, raised);
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      style={({ pressed }) => [
        cardStyle,
        { padding: PADDING[padding] },
        pressed && variant !== 'primary' ? { backgroundColor: colors.surfacePressed } : null,
        pressed && variant === 'primary' ? { opacity: 0.9 } : null,
        disabled ? { opacity: 0.5 } : null,
        style,
      ]}
      {...props}
    />
  );
}
