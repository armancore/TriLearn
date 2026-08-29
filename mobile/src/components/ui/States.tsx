import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';
import { radius } from '@/src/theme/tokens';

import { Button } from './Button';
import { Card } from './Card';
import { Text } from './Text';

export interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** Shown when a request succeeded but returned nothing. */
export function EmptyState({ icon = 'file-tray-outline', title, description, actionLabel, onAction }: EmptyStateProps) {
  const { colors } = useTheme();

  return (
    <Card padding="lg" style={{ alignItems: 'center', paddingVertical: 40 }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: radius.full,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surfaceMuted,
        }}
      >
        <Ionicons color={colors.textSubtle} name={icon} size={28} />
      </View>
      <Text center style={{ marginTop: 16 }} variant="subheading">
        {title}
      </Text>
      {description ? (
        <Text center style={{ marginTop: 6, maxWidth: 320 }} tone="muted" variant="caption">
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button fullWidth={false} label={actionLabel} onPress={onAction} size="sm" style={{ marginTop: 18 }} variant="tonal" />
      ) : null}
    </Card>
  );
}

export interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

/**
 * Shown when a request failed. The whole block is a polite live region so the
 * failure is announced when it replaces a loading skeleton.
 */
export function ErrorState({
  title = 'Something went wrong',
  description = 'We could not load this content. Check your connection and try again.',
  onRetry,
  retryLabel = 'Try again',
}: ErrorStateProps) {
  const { colors } = useTheme();

  return (
    <Card accessibilityLiveRegion="polite" padding="lg" style={{ alignItems: 'center', paddingVertical: 36 }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: radius.full,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.dangerSoft,
        }}
      >
        <Ionicons color={colors.danger} name="cloud-offline-outline" size={28} />
      </View>
      <Text center style={{ marginTop: 16 }} variant="subheading">
        {title}
      </Text>
      <Text center style={{ marginTop: 6, maxWidth: 320 }} tone="muted" variant="caption">
        {description}
      </Text>
      {onRetry ? (
        <Button
          fullWidth={false}
          icon="refresh"
          label={retryLabel}
          onPress={onRetry}
          size="sm"
          style={{ marginTop: 18 }}
          variant="secondary"
        />
      ) : null}
    </Card>
  );
}

export interface InlineNoticeProps {
  tone?: 'info' | 'warning' | 'danger' | 'success';
  title: string;
  description?: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

/** Contextual banner inside a screen — permissions, temporary passwords, etc. */
export function InlineNotice({ tone = 'info', title, description, icon }: InlineNoticeProps) {
  const { colors } = useTheme();

  const tones = {
    info: { background: colors.infoSoft, text: colors.infoSoftText, accent: colors.info, icon: 'information-circle' },
    warning: { background: colors.warningSoft, text: colors.warningSoftText, accent: colors.warning, icon: 'warning' },
    danger: { background: colors.dangerSoft, text: colors.dangerSoftText, accent: colors.danger, icon: 'alert-circle' },
    success: { background: colors.successSoft, text: colors.successSoftText, accent: colors.success, icon: 'checkmark-circle' },
  } as const;

  const palette = tones[tone];

  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: 'row',
        gap: 12,
        padding: 14,
        borderRadius: radius.md,
        backgroundColor: palette.background,
        borderLeftWidth: 3,
        borderLeftColor: palette.accent,
      }}
    >
      <Ionicons
        color={palette.accent}
        name={(icon ?? palette.icon) as keyof typeof Ionicons.glyphMap}
        size={18}
        style={{ marginTop: 1 }}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ color: palette.text }} tone="inherit" variant="bodyStrong">
          {title}
        </Text>
        {description ? (
          <Text style={{ color: palette.text, marginTop: 3, opacity: 0.9 }} tone="inherit" variant="caption">
            {description}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
