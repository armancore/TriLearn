import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';
import { MAX_FONT_SCALE, MAX_FONT_SCALE_DISPLAY } from '@/src/theme/tokens';

export type TextVariant =
  | 'display'
  | 'title'
  | 'heading'
  | 'subheading'
  | 'body'
  | 'bodyStrong'
  | 'caption'
  | 'label';

export type TextTone =
  | 'default'
  | 'muted'
  | 'subtle'
  | 'primary'
  | 'onPrimary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'inherit';

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  tone?: TextTone;
  /** Uppercase eyebrow styling for `label` variant headings. */
  uppercase?: boolean;
  /** Centres the line box. */
  center?: boolean;
}

const VARIANT_STYLE: Record<TextVariant, TextStyle> = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '700', letterSpacing: -0.6 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700', letterSpacing: -0.4 },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: -0.2 },
  subheading: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
};

/**
 * The single text primitive. Screens choose a semantic variant and tone rather
 * than font sizes and hex values, which keeps the type scale consistent and
 * guarantees a readable contrast ratio in both themes.
 */
export function Text({
  variant = 'body',
  tone = 'default',
  uppercase = false,
  center = false,
  style,
  ...props
}: TextProps) {
  const { colors } = useTheme();

  const toneColor: Record<TextTone, string | undefined> = {
    default: colors.text,
    muted: colors.textMuted,
    subtle: colors.textSubtle,
    primary: colors.primaryText,
    onPrimary: colors.textOnPrimary,
    success: colors.successSoftText,
    warning: colors.warningSoftText,
    danger: colors.danger,
    inherit: undefined,
  };

  return (
    <RNText
      // Display type gets a tighter cap so headline numerals do not blow the
      // layout apart at the largest accessibility text sizes.
      maxFontSizeMultiplier={variant === 'display' || variant === 'title' ? MAX_FONT_SCALE_DISPLAY : MAX_FONT_SCALE}
      style={[
        VARIANT_STYLE[variant],
        { color: toneColor[tone] },
        uppercase ? { textTransform: 'uppercase', letterSpacing: 0.6 } : null,
        center ? { textAlign: 'center' } : null,
        style,
      ]}
      {...props}
    />
  );
}
