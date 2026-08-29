import { View, type ViewStyle } from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';
import { radius } from '@/src/theme/tokens';

export interface ProgressBarProps {
  /** 0–100. Values outside the range are clamped. */
  value: number;
  /** Bar fill colour. Defaults to the theme primary. */
  color?: string;
  /** Track colour. Defaults to a muted surface. */
  trackColor?: string;
  height?: number;
  /** What the bar measures, e.g. "Overall attendance". */
  label: string;
  style?: ViewStyle;
}

/**
 * Determinate progress indicator exposed as a native `progressbar` so
 * VoiceOver / TalkBack read the percentage instead of skipping the graphic.
 */
export function ProgressBar({ value, color, trackColor, height = 10, label, style }: ProgressBarProps) {
  const { colors } = useTheme();
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;

  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(safeValue), text: `${Math.round(safeValue)} percent` }}
      style={[
        {
          height,
          borderRadius: radius.full,
          backgroundColor: trackColor ?? colors.surfaceMuted,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <View
        style={{
          width: `${safeValue}%`,
          height: '100%',
          borderRadius: radius.full,
          backgroundColor: color ?? colors.primaryText,
        }}
      />
    </View>
  );
}
