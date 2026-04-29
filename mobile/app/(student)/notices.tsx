import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, RefreshControl, Text, View } from 'react-native';

import { COLORS } from '@/src/constants/colors';
import { useAuth } from '@/src/hooks/useAuth';
import { api } from '@/src/services/api';
import type { Notice, NoticesResponse, NoticeType } from '@/src/types/notice';

const noticeTone: Record<NoticeType, { bg: string; text: string; bold?: boolean }> = {
  GENERAL: { bg: '#DBEAFE', text: '#1D4ED8' },
  EXAM: { bg: '#FEE2E2', text: '#B91C1C' },
  HOLIDAY: { bg: '#DCFCE7', text: '#166534' },
  EVENT: { bg: '#FEF3C7', text: '#92400E' },
  URGENT: { bg: '#FEE2E2', text: '#991B1B', bold: true },
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));

const previewContent = (content: string) => (content.length > 100 ? `${content.slice(0, 100).trim()}...` : content);

const NoticeSkeleton = () => (
  <View className="rounded-2xl bg-white p-5">
    <View className="h-5 w-2/3 rounded-full bg-slate-200" />
    <View className="mt-3 h-4 rounded-full bg-slate-100" />
    <View className="mt-2 h-4 w-5/6 rounded-full bg-slate-100" />
  </View>
);

export default function StudentNoticesScreen() {
  const { isAuthenticated } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);

  const noticesQuery = useInfiniteQuery({
    queryKey: ['notices', 'student'],
    queryFn: async ({ pageParam }) => {
      const page = Number(pageParam);
      const response = await api.get<NoticesResponse>(`/notices?page=${page}&limit=20`);
      return response.data;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.page * lastPage.limit < lastPage.total ? lastPage.page + 1 : undefined),
    enabled: isAuthenticated,
  });

  const notices = useMemo(
    () => noticesQuery.data?.pages.flatMap((page) => page.notices) ?? [],
    [noticesQuery.data?.pages],
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await noticesQuery.refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [noticesQuery]);

  return (
    <View className="flex-1 bg-slate-50">
      <FlatList
        contentContainerStyle={{ gap: 12, padding: 24, paddingBottom: 32 }}
        data={notices}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          noticesQuery.isLoading ? (
            <View className="gap-3">
              <NoticeSkeleton />
              <NoticeSkeleton />
              <NoticeSkeleton />
            </View>
          ) : (
            <View className="items-center rounded-2xl bg-white px-5 py-10">
              <Text className="text-lg font-bold text-slate-900">No notices</Text>
              <Text className="mt-2 text-center text-sm text-slate-500">Published notices will appear here.</Text>
            </View>
          )
        }
        ListFooterComponent={
          noticesQuery.isFetchingNextPage ? (
            <View className="py-4">
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : null
        }
        ListHeaderComponent={
          <View className="mb-2">
            <Text className="text-2xl font-bold text-primary">Notices</Text>
            <Text className="mt-2 text-sm text-slate-600">Official announcements and academic updates.</Text>
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
        renderItem={({ item }) => {
          const tone = noticeTone[item.type];

          return (
            <Pressable className="rounded-2xl bg-white p-5 active:opacity-80" onPress={() => setSelectedNotice(item)}>
              <View className="flex-row items-start justify-between gap-4">
                <Text className="flex-1 text-lg font-bold text-slate-900">{item.title}</Text>
                <View className="rounded-full px-3 py-1" style={{ backgroundColor: tone.bg }}>
                  <Text className={`text-xs ${tone.bold ? 'font-black' : 'font-bold'}`} style={{ color: tone.text }}>
                    {item.type}
                  </Text>
                </View>
              </View>
              <Text className="mt-2 text-xs font-medium text-slate-500">{formatDate(item.createdAt)}</Text>
              <Text className="mt-4 text-sm leading-6 text-slate-600">{previewContent(item.content)}</Text>
            </Pressable>
          );
        }}
        onEndReached={() => {
          if (noticesQuery.hasNextPage && !noticesQuery.isFetchingNextPage) {
            void noticesQuery.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.4}
      />

      <Modal animationType="slide" transparent visible={Boolean(selectedNotice)} onRequestClose={() => setSelectedNotice(null)}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setSelectedNotice(null)}>
          <Pressable className="max-h-[80%] rounded-t-3xl bg-white p-6" onPress={(event) => event.stopPropagation()}>
            {selectedNotice ? (
              <>
                <View className="h-1 w-12 self-center rounded-full bg-slate-200" />
                <Text className="mt-6 text-2xl font-bold text-slate-900">{selectedNotice.title}</Text>
                <Text className="mt-2 text-xs font-medium text-slate-500">{formatDate(selectedNotice.createdAt)}</Text>
                <Text className="mt-5 text-base leading-7 text-slate-700">{selectedNotice.content}</Text>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
