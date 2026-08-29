import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';

import {
  Badge,
  EmptyState,
  ErrorState,
  PressableCard,
  SCREEN_GUTTER,
  Screen,
  Sheet,
  SkeletonList,
  Text,
  type BadgeTone,
} from '@/src/components/ui';
import { useAuth } from '@/src/hooks/useAuth';
import { api } from '@/src/services/api';
import { useTheme } from '@/src/theme/ThemeProvider';
import type { Notice, NoticesResponse, NoticeType } from '@/src/types/notice';

const NOTICE_TONE: Record<NoticeType, { tone: BadgeTone; icon: keyof typeof Ionicons.glyphMap }> = {
  GENERAL: { tone: 'neutral', icon: 'information-circle-outline' },
  EXAM: { tone: 'info', icon: 'school-outline' },
  HOLIDAY: { tone: 'success', icon: 'sunny-outline' },
  EVENT: { tone: 'accent', icon: 'calendar-outline' },
  URGENT: { tone: 'danger', icon: 'alert-circle' },
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));

export default function StudentNoticesScreen() {
  const { colors } = useTheme();
  const { isAuthenticated } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);

  const noticesQuery = useInfiniteQuery({
    queryKey: ['notices', 'student'],
    queryFn: async ({ pageParam }) => {
      const response = await api.get<NoticesResponse>(`/notices?page=${Number(pageParam)}&limit=20`);
      return response.data;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page * lastPage.limit < lastPage.total ? lastPage.page + 1 : undefined,
    enabled: isAuthenticated,
  });

  const notices = useMemo(
    () => noticesQuery.data?.pages.flatMap((page) => page.notices) ?? [],
    [noticesQuery.data?.pages],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await noticesQuery.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [noticesQuery]);

  return (
    <>
      <Screen
        header={{ title: 'Notices', subtitle: 'Official announcements and academic updates.' }}
        padded={false}
        scroll={false}
      >
        <FlatList
          contentContainerStyle={{
            gap: 12,
            paddingHorizontal: SCREEN_GUTTER,
            paddingTop: 8,
            paddingBottom: 32,
            flexGrow: 1,
          }}
          data={notices}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            noticesQuery.isLoading ? (
              <SkeletonList count={4} />
            ) : noticesQuery.isError ? (
              <ErrorState onRetry={() => void noticesQuery.refetch()} title="Could not load notices" />
            ) : (
              <EmptyState
                description="Published notices from your college will appear here."
                icon="megaphone-outline"
                title="No notices yet"
              />
            )
          }
          ListFooterComponent={
            noticesQuery.isFetchingNextPage ? (
              <View accessibilityLabel="Loading more notices" style={{ paddingVertical: 20 }}>
                <ActivityIndicator color={colors.primaryText} />
              </View>
            ) : null
          }
          onEndReached={() => {
            if (noticesQuery.hasNextPage && !noticesQuery.isFetchingNextPage) {
              void noticesQuery.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.4}
          refreshControl={
            <RefreshControl
              colors={[colors.primaryText]}
              onRefresh={onRefresh}
              progressBackgroundColor={colors.surface}
              refreshing={refreshing}
              tintColor={colors.primaryText}
            />
          }
          renderItem={({ item }) => {
            const style = NOTICE_TONE[item.type] ?? NOTICE_TONE.GENERAL;

            return (
              <PressableCard
                accessibilityHint="Opens the full notice"
                accessibilityLabel={`${item.type} notice: ${item.title}, posted ${formatDate(item.createdAt)}`}
                onPress={() => setSelectedNotice(item)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                  <Text style={{ flex: 1 }} variant="subheading">
                    {item.title}
                  </Text>
                  <Badge icon={style.icon} label={item.type} tone={style.tone} />
                </View>
                <Text style={{ marginTop: 6 }} tone="subtle" variant="caption">
                  {formatDate(item.createdAt)}
                </Text>
                <Text numberOfLines={2} style={{ marginTop: 10 }} tone="muted" variant="caption">
                  {item.content}
                </Text>
              </PressableCard>
            );
          }}
          showsVerticalScrollIndicator={false}
        />
      </Screen>

      <Sheet
        onClose={() => setSelectedNotice(null)}
        subtitle={selectedNotice ? `${selectedNotice.type} · ${formatDate(selectedNotice.createdAt)}` : undefined}
        title={selectedNotice?.title ?? ''}
        visible={Boolean(selectedNotice)}
      >
        <Text style={{ lineHeight: 24 }} tone="muted">
          {selectedNotice?.content}
        </Text>
      </Sheet>
    </>
  );
}
