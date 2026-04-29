import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { COLORS } from '@/src/constants/colors';
import { useAuth } from '@/src/hooks/useAuth';
import { api } from '@/src/services/api';
import type { ExamType, MarksResponse, MarksSummaryResponse } from '@/src/types/marks';

const examTypes: ExamType[] = ['INTERNAL', 'MIDTERM', 'FINAL', 'PRACTICAL'];

const formatDate = (value?: string | null) => {
  if (!value) return 'Not published';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
};

const MarkSkeleton = () => (
  <View className="rounded-2xl bg-white p-5">
    <View className="h-5 w-2/3 rounded-full bg-slate-200" />
    <View className="mt-3 h-4 w-1/2 rounded-full bg-slate-100" />
    <View className="mt-5 h-4 w-24 rounded-full bg-slate-100" />
  </View>
);

export default function StudentMarksScreen() {
  const { isAuthenticated } = useAuth();
  const [activeExamType, setActiveExamType] = useState<ExamType>('INTERNAL');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const marksQuery = useQuery({
    queryKey: ['marks', 'my', activeExamType],
    queryFn: async () => {
      const response = await api.get<MarksResponse>(`/marks/my?examType=${activeExamType}&page=1&limit=50`);
      return response.data;
    },
    enabled: isAuthenticated,
  });

  const summaryQuery = useQuery({
    queryKey: ['marks', 'my', 'summary'],
    queryFn: async () => {
      const response = await api.get<MarksSummaryResponse>('/marks/my/summary');
      return response.data;
    },
    enabled: isAuthenticated,
  });

  const publishedMarks = useMemo(
    () => (marksQuery.data?.marks ?? []).filter((mark) => mark.isPublished && mark.examType === activeExamType),
    [activeExamType, marksQuery.data?.marks],
  );

  const availableExamTypes = useMemo(() => {
    const available = new Set<ExamType>([...examTypes, ...(marksQuery.data?.availableExamTypes ?? []), ...(summaryQuery.data?.availableExamTypes ?? [])]);
    return examTypes.filter((type) => available.has(type));
  }, [marksQuery.data?.availableExamTypes, summaryQuery.data?.availableExamTypes]);

  const summary = summaryQuery.data?.resultSheet;

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([marksQuery.refetch(), summaryQuery.refetch()]);
    } finally {
      setIsRefreshing(false);
    }
  }, [marksQuery, summaryQuery]);

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      contentContainerStyle={{ padding: 24, paddingBottom: 32 }}
      refreshControl={
        <RefreshControl
          colors={[COLORS.primary]}
          refreshing={isRefreshing}
          tintColor={COLORS.primary}
          onRefresh={handleRefresh}
        />
      }
    >
      <Text className="text-2xl font-bold text-primary">Marks</Text>
      <Text className="mt-2 text-sm text-slate-600">Published results grouped by exam type.</Text>

      {summaryQuery.isLoading ? (
        <View className="mt-6 rounded-2xl bg-white p-5">
          <View className="h-4 w-32 rounded-full bg-slate-200" />
          <View className="mt-4 h-10 w-24 rounded-full bg-slate-100" />
          <View className="mt-4 h-3 rounded-full bg-slate-100" />
        </View>
      ) : (
        <View className="mt-6 rounded-2xl bg-primary p-5">
          <Text className="text-sm font-semibold text-blue-100">Semester summary</Text>
          <View className="mt-3 flex-row items-end justify-between">
            <View>
              <Text className="text-5xl font-bold text-white">{summary?.overallGpa?.toFixed(2) ?? '0.00'}</Text>
              <Text className="mt-1 text-sm text-blue-100">Overall GPA</Text>
            </View>
            <View className="items-end">
              <Text className="text-2xl font-bold text-white">{summary?.overallPercentage ?? 0}%</Text>
              <Text className="mt-1 text-sm text-blue-100">Overall</Text>
            </View>
          </View>
          <Text className="mt-4 text-sm text-blue-100">
            {summary?.totals.obtainedMarks ?? 0}/{summary?.totals.totalMarks ?? 0} marks across {summary?.subjects.length ?? 0} subjects
          </Text>
        </View>
      )}

      <ScrollView className="mt-5" horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-2">
          {availableExamTypes.map((type) => {
            const active = activeExamType === type;
            return (
              <Pressable
                className={`rounded-full px-4 py-2 ${active ? 'bg-primary' : 'bg-white'}`}
                key={type}
                onPress={() => setActiveExamType(type)}
              >
                <Text className={`text-xs font-bold ${active ? 'text-white' : 'text-slate-600'}`}>{type}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View className="mt-6 gap-4">
        {marksQuery.isLoading ? (
          <>
            <MarkSkeleton />
            <MarkSkeleton />
            <MarkSkeleton />
          </>
        ) : publishedMarks.length === 0 ? (
          <View className="items-center rounded-2xl bg-white px-5 py-10">
            <Text className="text-lg font-bold text-slate-900">No published marks</Text>
            <Text className="mt-2 text-center text-sm text-slate-500">Published {activeExamType.toLowerCase()} marks will appear here.</Text>
          </View>
        ) : (
          publishedMarks.map((mark) => (
            <View className="rounded-2xl bg-white p-5" key={mark.id}>
              <View className="flex-row items-start justify-between gap-4">
                <View className="flex-1">
                  <Text className="text-lg font-bold text-slate-900">{mark.subject?.name ?? 'Subject'}</Text>
                  <Text className="mt-1 text-sm font-medium text-slate-500">
                    {mark.subject?.code ?? 'N/A'} • {mark.examType}
                  </Text>
                </View>
                <View className="rounded-full bg-blue-100 px-3 py-1">
                  <Text className="text-xs font-bold text-blue-700">{mark.grade}</Text>
                </View>
              </View>
              <View className="mt-5 flex-row gap-3">
                <View className="flex-1 rounded-xl bg-slate-100 p-3">
                  <Text className="text-xs font-medium text-slate-500">Marks</Text>
                  <Text className="mt-1 text-base font-bold text-slate-900">
                    {mark.obtainedMarks}/{mark.totalMarks}
                  </Text>
                </View>
                <View className="flex-1 rounded-xl bg-slate-100 p-3">
                  <Text className="text-xs font-medium text-slate-500">Grade point</Text>
                  <Text className="mt-1 text-base font-bold text-slate-900">{mark.gradePoint.toFixed(1)}</Text>
                </View>
              </View>
              <Text className="mt-4 text-xs text-slate-500">Published {formatDate(mark.publishedAt)}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}
