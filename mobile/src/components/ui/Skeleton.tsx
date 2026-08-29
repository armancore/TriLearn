import { useEffect } from 'react';
import { View, type DimensionValue, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useReduceMotion } from '@/src/hooks/useA11y';
import { useTheme } from '@/src/theme/ThemeProvider';
import { radius } from '@/src/theme/tokens';

import { Card } from './Card';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  style?: ViewStyle;
}

/**
 * Placeholder block for pending content.
 *
 * The pulse is suppressed when the OS reports "reduce motion", and skeleton
 * groups are hidden from assistive tech — a screen reader hears the loading
 * announcement from the screen instead of a run of empty boxes.
 */
export function Skeleton({ width = '100%', height = 14, style }: SkeletonProps) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const progress = useSharedValue(0.6);

  useEffect(() => {
    if (reduceMotion) {
      progress.value = 0.75;
      return undefined;
    }

    progress.value = withRepeat(withTiming(1, { duration: 850 }), -1, true);

    return () => {
      cancelAnimation(progress);
    };
  }, [progress, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius.sm, backgroundColor: colors.skeleton },
        animatedStyle,
        style,
      ]}
    />
  );
}

/** Card-shaped placeholder matching the common "title + meta + stats" layout. */
export function SkeletonCard({ lines = 2, showFooter = false }: { lines?: number; showFooter?: boolean }) {
  return (
    <Card>
      <Skeleton height={18} width="65%" />
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} height={12} style={{ marginTop: index === 0 ? 12 : 8 }} width={index % 2 === 0 ? '90%' : '55%'} />
      ))}
      {showFooter ? (
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
          <Skeleton height={52} style={{ flex: 1, borderRadius: radius.md }} />
          <Skeleton height={52} style={{ flex: 1, borderRadius: radius.md }} />
        </View>
      ) : null}
    </Card>
  );
}

/** Repeats `SkeletonCard` and hides the whole group from screen readers. */
export function SkeletonList({ count = 3, lines = 2, showFooter = false }: { count?: number; lines?: number; showFooter?: boolean }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ gap: 14 }}>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={index} lines={lines} showFooter={showFooter} />
      ))}
    </View>
  );
}
