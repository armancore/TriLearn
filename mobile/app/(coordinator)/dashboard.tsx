import { useQuery } from '@tanstack/react-query';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useCallback, useState } from 'react';

import { COLORS } from '@/src/constants/colors';
import { api } from '@/src/services/api';
import type { AdminStatsResponse, DepartmentsResponse, StudentApplicationsResponse } from '@/src/types/admin';
import type { ProfileResponse } from '@/src/types/profile';

const StatCard = ({ label, value }: { label: string; value: number }) => (
  <View className="flex-1 rounded-2xl bg-white p-5">
    <Text className="text-xs font-medium text-slate-500">{label}</Text>
    <Text className="mt-2 text-3xl font-bold text-slate-900">{value}</Text>
  </View>
);

export default function CoordinatorDashboardScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const statsQuery = useQuery({ queryKey: ['admin', 'stats'], queryFn: async () => (await api.get<AdminStatsResponse>('/admin/stats')).data });
  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: async () => (await api.get<DepartmentsResponse>('/departments')).data });
  const applicationsQuery = useQuery({ queryKey: ['applications', 'pending'], queryFn: async () => (await api.get<StudentApplicationsResponse>('/admin/student-applications?status=PENDING&page=1&limit=1')).data });
  const profileQuery = useQuery({ queryKey: ['auth', 'me'], queryFn: async () => (await api.get<ProfileResponse>('/auth/me')).data });

  const stats = statsQuery.data?.stats;
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([statsQuery.refetch(), departmentsQuery.refetch(), applicationsQuery.refetch(), profileQuery.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }, [applicationsQuery, departmentsQuery, profileQuery, statsQuery]);

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      contentContainerStyle={{ padding: 24, paddingBottom: 32 }}
      refreshControl={<RefreshControl colors={[COLORS.primary]} refreshing={refreshing} tintColor={COLORS.primary} onRefresh={onRefresh} />}
    >
      <View className="rounded-2xl bg-primary p-5">
        <Text className="text-sm font-semibold text-blue-100">Coordinator dashboard</Text>
        <Text className="mt-2 text-2xl font-bold text-white">{profileQuery.data?.user.coordinator?.department ?? 'Department not assigned'}</Text>
      </View>
      <View className="mt-6 gap-3">
        <View className="flex-row gap-3">
          <StatCard label="Students" value={stats?.totalStudents ?? 0} />
          <StatCard label="Instructors" value={stats?.totalInstructors ?? 0} />
        </View>
        <View className="flex-row gap-3">
          <StatCard label="Departments" value={departmentsQuery.data?.total ?? 0} />
          <StatCard label="Pending applications" value={applicationsQuery.data?.total ?? 0} />
        </View>
      </View>
    </ScrollView>
  );
}
