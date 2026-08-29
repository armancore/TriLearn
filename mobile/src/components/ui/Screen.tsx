import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
  type ScrollViewProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/src/theme/ThemeProvider';
import { MIN_TOUCH_TARGET, spacing } from '@/src/theme/tokens';

import { Text } from './Text';

export const SCREEN_GUTTER = spacing.xl;

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  /** Shows a back control. Defaults to on when the navigator can go back. */
  showBack?: boolean;
  /** Trailing controls, typically `IconButton`s. */
  actions?: ReactNode;
  /** Compact headers drop the subtitle row and shrink the title. */
  compact?: boolean;
}

/**
 * In-app screen header.
 *
 * Replaces the native navigation bar so the title, subtitle and actions share
 * one consistent layout across every role. The title is a `header` for
 * assistive tech and the back control keeps a full 48pt target.
 */
export function ScreenHeader({ title, subtitle, showBack, actions, compact = false }: ScreenHeaderProps) {
  const { colors } = useTheme();
  const canGoBack = router.canGoBack();
  const withBack = showBack ?? canGoBack;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: SCREEN_GUTTER,
        paddingTop: compact ? 10 : 14,
        paddingBottom: compact ? 10 : 14,
        backgroundColor: colors.background,
      }}
    >
      {withBack ? (
        <Pressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => ({
            width: MIN_TOUCH_TARGET - 8,
            height: MIN_TOUCH_TARGET - 8,
            marginLeft: -8,
            borderRadius: 999,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? colors.surfacePressed : 'transparent',
          })}
        >
          <Ionicons color={colors.text} name="chevron-back" size={26} />
        </Pressable>
      ) : null}

      <View style={{ flex: 1 }}>
        <Text accessibilityRole="header" numberOfLines={1} variant={compact ? 'heading' : 'title'}>
          {title}
        </Text>
        {subtitle && !compact ? (
          <Text numberOfLines={2} style={{ marginTop: 3 }} tone="muted" variant="caption">
            {subtitle}
          </Text>
        ) : null}
      </View>

      {actions ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>{actions}</View> : null}
    </View>
  );
}

export interface ScreenProps extends Omit<ScrollViewProps, 'refreshControl' | 'style'> {
  children: ReactNode;
  /** Header configuration. Omit to render content only. */
  header?: ScreenHeaderProps;
  /** Wire up pull-to-refresh. The promise drives the spinner. */
  onRefresh?: () => Promise<unknown> | void;
  /** Renders children in a plain `View` — for screens with their own list. */
  scroll?: boolean;
  /** Removes the default horizontal gutter, e.g. for edge-to-edge lists. */
  padded?: boolean;
  contentStyle?: ViewStyle;
  /** Pinned below the scroll area, e.g. a primary submit button. */
  footer?: ReactNode;
}

/**
 * Standard screen shell: themed canvas, consistent gutters, a header, safe-area
 * aware bottom padding, and pull-to-refresh wiring in one place.
 */
export function Screen({
  children,
  header,
  onRefresh,
  scroll = true,
  padded = true,
  contentStyle,
  footer,
  contentContainerStyle,
  ...props
}: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (!onRefresh) {
      return;
    }

    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  }, [onRefresh]);

  const gutter = padded ? SCREEN_GUTTER : 0;
  const bottomPadding = (footer ? spacing.lg : spacing['3xl']) + (Platform.OS === 'web' ? 0 : insets.bottom / 2);

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[
        { paddingHorizontal: gutter, paddingBottom: bottomPadding, paddingTop: header ? 4 : spacing.lg },
        contentContainerStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            colors={[colors.primaryText]}
            onRefresh={handleRefresh}
            progressBackgroundColor={colors.surface}
            refreshing={isRefreshing}
            tintColor={colors.primaryText}
          />
        ) : undefined
      }
      showsVerticalScrollIndicator={false}
      style={{ flex: 1 }}
      {...props}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1, paddingHorizontal: gutter }, contentStyle]}>{children}</View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {header ? <ScreenHeader {...header} /> : null}
      {body}
      {footer ? (
        <View
          style={{
            paddingHorizontal: SCREEN_GUTTER,
            paddingTop: spacing.md,
            paddingBottom: spacing.md + insets.bottom / 2,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.surface,
          }}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}
