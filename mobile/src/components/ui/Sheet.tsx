import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReduceMotion } from '@/src/hooks/useA11y';
import { useTheme } from '@/src/theme/ThemeProvider';
import { MIN_TOUCH_TARGET, radius, spacing } from '@/src/theme/tokens';

import { Text } from './Text';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Pinned action area at the bottom of the sheet. */
  footer?: ReactNode;
}

/**
 * Bottom sheet for detail views.
 *
 * Uses a real `Modal` so focus is trapped and the Android back button closes
 * it, exposes an explicit close button (a scrim tap alone is not discoverable
 * by keyboard or screen-reader users), and drops the slide-in when the OS asks
 * for reduced motion.
 */
export function Sheet({ visible, onClose, title, subtitle, children, footer }: SheetProps) {
  const { colors, elevation } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();

  return (
    <Modal
      animationType={reduceMotion ? 'fade' : 'slide'}
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim }}>
        <Pressable
          accessibilityLabel="Close"
          accessibilityRole="button"
          onPress={onClose}
          style={{ flex: 1 }}
        />

        <View
          accessibilityViewIsModal
          style={[
            {
              backgroundColor: colors.surface,
              borderTopLeftRadius: radius['2xl'],
              borderTopRightRadius: radius['2xl'],
              paddingBottom: insets.bottom,
              maxHeight: '88%',
            },
            elevation.lg,
          ]}
        >
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              alignSelf: 'center',
              width: 40,
              height: 4,
              borderRadius: radius.full,
              backgroundColor: colors.borderStrong,
              marginTop: 10,
            }}
          />

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 12,
              paddingHorizontal: spacing.xl,
              paddingTop: spacing.lg,
              paddingBottom: spacing.md,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text accessibilityRole="header" variant="heading">
                {title}
              </Text>
              {subtitle ? (
                <Text style={{ marginTop: 4 }} tone="muted" variant="caption">
                  {subtitle}
                </Text>
              ) : null}
            </View>

            <Pressable
              accessibilityLabel="Close"
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => ({
                width: MIN_TOUCH_TARGET - 8,
                height: MIN_TOUCH_TARGET - 8,
                marginTop: -6,
                marginRight: -8,
                borderRadius: radius.full,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed ? colors.surfacePressed : colors.surfaceMuted,
              })}
            >
              <Ionicons color={colors.textMuted} name="close" size={20} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xl }}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>

          {footer ? (
            <View
              style={{
                paddingHorizontal: spacing.xl,
                paddingTop: spacing.md,
                paddingBottom: spacing.md,
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}
            >
              {footer}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
