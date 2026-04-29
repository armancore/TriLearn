import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';

import { COLORS } from '@/src/constants/colors';
import { useAuth } from '@/src/hooks/useAuth';
import { api } from '@/src/services/api';

interface Assignment {
  id: string;
  title: string;
  description?: string | null;
  dueDate: string;
  totalMarks: number;
  subject?: {
    name: string;
    code: string;
  } | null;
  submissions?: unknown[];
  submission?: unknown | null;
}

interface AssignmentsResponse {
  assignments: Assignment[];
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));

const AssignmentSkeleton = () => (
  <View className="rounded-2xl bg-white p-5">
    <View className="h-5 w-2/3 rounded-full bg-slate-200" />
    <View className="mt-3 h-4 w-1/2 rounded-full bg-slate-100" />
    <View className="mt-5 h-4 w-24 rounded-full bg-slate-100" />
  </View>
);

export default function StudentAssignmentsScreen() {
  const { isAuthenticated } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const query = useQuery({
    queryKey: ['assignments', 'student'],
    queryFn: async () => {
      const response = await api.get<AssignmentsResponse>('/assignments?page=1&limit=20');
      return response.data;
    },
    enabled: isAuthenticated,
  });

  const assignments = useMemo(
    () =>
      (query.data?.assignments ?? [])
        .filter((assignment) => !assignment.submission && !assignment.submissions?.length)
        .sort((left, right) => new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime()),
    [query.data?.assignments],
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await query.refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [query]);

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
      <Text className="text-2xl font-bold text-primary">Assignments</Text>
      <Text className="mt-2 text-sm text-slate-600">Track pending coursework and upcoming due dates.</Text>

      <View className="mt-6 gap-4">
        {query.isLoading ? (
          <>
            <AssignmentSkeleton />
            <AssignmentSkeleton />
            <AssignmentSkeleton />
          </>
        ) : assignments.length === 0 ? (
          <View className="items-center rounded-2xl bg-white px-5 py-10">
            <Text className="text-lg font-bold text-slate-900">No pending assignments</Text>
            <Text className="mt-2 text-center text-sm text-slate-500">
              New coursework will appear here when instructors publish it.
            </Text>
          </View>
        ) : (
          assignments.map((assignment) => (
            <View className="rounded-2xl bg-white p-5" key={assignment.id}>
              <View className="flex-row items-start justify-between gap-4">
                <View className="flex-1">
                  <Text className="text-lg font-bold text-slate-900">{assignment.title}</Text>
                  <Text className="mt-1 text-sm font-medium text-slate-500">
                    {assignment.subject?.name ?? 'Subject'} {assignment.subject?.code ? `(${assignment.subject.code})` : ''}
                  </Text>
                </View>
                <View className="rounded-full bg-amber-100 px-3 py-1">
                  <Text className="text-xs font-bold text-amber-700">{assignment.totalMarks} marks</Text>
                </View>
              </View>
              {assignment.description ? (
                <Text className="mt-4 text-sm text-slate-600" numberOfLines={3}>
                  {assignment.description}
                </Text>
              ) : null}
              <Text className="mt-4 text-sm font-semibold text-primary">Due {formatDate(assignment.dueDate)}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}
