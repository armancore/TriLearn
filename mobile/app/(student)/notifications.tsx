import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';

import { COLORS } from '@/src/constants/colors';
import { useNotifications } from '@/src/hooks/useNotifications';
import type { NotificationItem } from '@/src/types/notification';

const NotificationSkeleton = () => (
  <View className="rounded-2xl bg-white p-4">
    <View className="h-5 w-2/3 rounded-full bg-slate-200" />
    <View className="mt-3 h-4 rounded-full bg-slate-100" />
    <View className="mt-2 h-4 w-5/6 rounded-full bg-slate-100" />
    <View className="mt-4 h-3 w-32 rounded-full bg-slate-100" />
  </View>
);

const EmptyState = () => (
  <View className="items-center rounded-2xl bg-white px-5 py-10">
    <Text className="text-lg font-bold text-slate-900">No notifications</Text>
    <Text className="mt-2 text-center text-sm text-slate-500">
      Updates from your courses will appear here.
    </Text>
  </View>
);

export default function StudentNotificationsScreen() {
  const {
    notifications,
    unreadCount,
    isLoading,
    isError,
    refetch,
    markAsRead,
    markAllAsRead,
  } = useNotifications();
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

  const handleNotificationPress = useCallback(
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

  const handleMarkAllAsRead = useCallback(async () => {
    setIsMarkingAll(true);
    try {
      await markAllAsRead();
    } finally {
      setIsMarkingAll(false);
    }
  }, [markAllAsRead]);

  if (isLoading) {
    return (
      <View className="flex-1 bg-slate-50 p-6">
        <View className="mb-6">
          <Text className="text-2xl font-bold text-primary">Notifications</Text>
          <Text className="mt-2 text-sm text-slate-600">Recent course updates and alerts.</Text>
        </View>
        <View className="gap-3">
          <NotificationSkeleton />
          <NotificationSkeleton />
          <NotificationSkeleton />
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 p-6">
        <Text className="text-lg font-bold text-slate-900">Could not load notifications</Text>
        <Text className="mt-2 text-center text-sm text-slate-500">
          Check your connection and try again.
        </Text>
        <Pressable className="mt-5 rounded-xl bg-primary px-5 py-3" onPress={() => void refetch()}>
          <Text className="font-bold text-white">Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50 p-6">
      <FlatList
        contentContainerStyle={{ gap: 10, paddingBottom: 24 }}
        data={notifications}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<EmptyState />}
        ListHeaderComponent={
          <View className="mb-4 flex-row items-start justify-between gap-4">
            <View className="flex-1">
              <Text className="text-2xl font-bold text-primary">Notifications</Text>
              <Text className="mt-2 text-sm text-slate-600">Recent course updates and alerts.</Text>
            </View>
            {unreadCount > 0 ? (
              <Pressable
                className="rounded-xl px-3 py-2"
                disabled={isMarkingAll}
                style={{ backgroundColor: COLORS.primary }}
                onPress={handleMarkAllAsRead}
              >
                <Text className="text-xs font-bold text-white">
                  {isMarkingAll ? 'Marking...' : 'Mark all as read'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        }
        refreshControl={
          <RefreshControl
            colors={[COLORS.primary]}
            refreshing={isRefreshing}
            tintColor={COLORS.primary}
            onRefresh={handleRefresh}
          />
        }
        renderItem={({ item }) => (
          <Pressable
            className={`rounded-2xl p-4 ${item.isRead ? 'bg-white' : 'border-l-4 bg-blue-50'}`}
            style={!item.isRead ? { borderLeftColor: COLORS.primary } : undefined}
            onPress={() => void handleNotificationPress(item)}
          >
            <Text className="text-base font-semibold text-primary">{item.title}</Text>
            <Text className="mt-1 text-slate-700">{item.message}</Text>
            <Text className="mt-2 text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}
