import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';

import {
  Button,
  EmptyState,
  ErrorState,
  PressableCard,
  SCREEN_GUTTER,
  Screen,
  SkeletonList,
  Text,
} from '@/src/components/ui';
import { announce } from '@/src/hooks/useA11y';
import { useNotifications } from '@/src/hooks/useNotifications';
import { useTheme } from '@/src/theme/ThemeProvider';
import { radius } from '@/src/theme/tokens';
import type { NotificationItem } from '@/src/types/notification';

const ICON_FOR_TYPE = (type: string): keyof typeof Ionicons.glyphMap => {
  const value = type.toUpperCase();
  if (value.includes('ATTENDANCE')) return 'calendar-outline';
  if (value.includes('MARK') || value.includes('RESULT')) return 'ribbon-outline';
  if (value.includes('ASSIGNMENT')) return 'document-text-outline';
  if (value.includes('NOTICE')) return 'megaphone-outline';
  return 'notifications-outline';
};

const formatTimestamp = (value: string) =>
  new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));

export interface NotificationsScreenProps {
  title: string;
  subtitle: string;
  emptyTitle: string;
  emptyDescription: string;
}

/**
 * Shared notification feed.
 *
 * Students and instructors read the same data with different framing, so the
 * list, its unread semantics and its accessibility wiring live here once.
 */
export default function NotificationsScreen({
  title,
  subtitle,
  emptyTitle,
  emptyDescription,
}: NotificationsScreenProps) {
  const { colors } = useTheme();
  const { notifications, unreadCount, isLoading, isError, refetch, markAsRead, markAllAsRead } =
    useNotifications();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [readingId, setReadingId] = useState<string | null>(null);
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch]);

  const handlePress = useCallback(
    async (item: NotificationItem) => {
      if (item.isRead || readingId) {
        return;
      }

      setReadingId(item.id);
      try {
        await markAsRead(item.id);
      } finally {
        setReadingId(null);
      }
    },
    [markAsRead, readingId],
  );

  const handleMarkAll = useCallback(async () => {
    setIsMarkingAll(true);
    try {
      await markAllAsRead();
      announce('All notifications marked as read');
    } finally {
      setIsMarkingAll(false);
    }
  }, [markAllAsRead]);

  return (
    <Screen
      header={{
        title,
        subtitle:
          unreadCount > 0
            ? `${unreadCount} unread ${unreadCount === 1 ? 'update' : 'updates'}`
            : subtitle,
      }}
      padded={false}
      scroll={false}
    >
      <FlatList
        contentContainerStyle={{
          gap: 10,
          paddingHorizontal: SCREEN_GUTTER,
          paddingTop: 8,
          paddingBottom: 32,
          flexGrow: 1,
        }}
        data={notifications}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          isLoading ? (
            <SkeletonList count={4} />
          ) : isError ? (
            <ErrorState onRetry={() => void refetch()} title="Could not load notifications" />
          ) : (
            <EmptyState description={emptyDescription} icon="notifications-off-outline" title={emptyTitle} />
          )
        }
        ListHeaderComponent={
          unreadCount > 0 ? (
            <View style={{ paddingBottom: 6 }}>
              <Button
                accessibilityHint={`Marks all ${unreadCount} unread notifications as read`}
                fullWidth={false}
                icon="checkmark-done"
                label="Mark all as read"
                loading={isMarkingAll}
                onPress={() => void handleMarkAll()}
                size="sm"
                variant="secondary"
              />
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl
            colors={[colors.primaryText]}
            onRefresh={handleRefresh}
            progressBackgroundColor={colors.surface}
            refreshing={isRefreshing}
            tintColor={colors.primaryText}
          />
        }
        renderItem={({ item }) => (
          <PressableCard
            accessibilityHint={item.isRead ? undefined : 'Marks this notification as read'}
            // Unread state is spoken, not just shown as a dot and a tinted edge.
            accessibilityLabel={`${item.isRead ? '' : 'Unread. '}${item.title}. ${item.message}. ${formatTimestamp(item.createdAt)}`}
            disabled={item.isRead}
            onPress={() => void handlePress(item)}
            padding="md"
            style={
              item.isRead
                ? undefined
                : { borderLeftWidth: 4, borderLeftColor: colors.primaryText, backgroundColor: colors.primarySoft }
            }
          >
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: radius.sm,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: item.isRead ? colors.surfaceMuted : colors.surface,
                }}
              >
                <Ionicons
                  color={item.isRead ? colors.textSubtle : colors.primaryText}
                  name={ICON_FOR_TYPE(item.type)}
                  size={17}
                />
              </View>

              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ flex: 1 }} variant={item.isRead ? 'bodyStrong' : 'subheading'}>
                    {item.title}
                  </Text>
                  {item.isRead ? null : (
                    <View
                      style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: colors.primaryText }}
                    />
                  )}
                </View>
                <Text style={{ marginTop: 3 }} tone="muted" variant="caption">
                  {item.message}
                </Text>
                <Text style={{ marginTop: 8 }} tone="subtle" variant="label">
                  {formatTimestamp(item.createdAt)}
                </Text>
              </View>
            </View>
          </PressableCard>
        )}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}
