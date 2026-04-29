import { useQuery } from '@tanstack/react-query';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useCallback, useState } from 'react';

import { COLORS } from '@/src/constants/colors';
import { api } from '@/src/services/api';
import type { AdminStatsResponse, AdminUsersResponse, StudentApplicationsResponse } from '@/src/types/admin';

const StatCard = ({ label, value }: { label: string; value: number }) => (
  <View className="flex-1 rounded-2xl bg-white p-5">
    <Text className="text-xs font-medium text-slate-500">{label}</Text>
    <Text className="mt-2 text-3xl font-bold text-slate-900">{value}</Text>
  </View>
);

export default function AdminDashboardScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const query = useQuery({ queryKey: ['admin', 'stats'], queryFn: async () => (await api.get<AdminStatsResponse>('/admin/stats')).data });
  const applicationsQuery = useQuery({ queryKey: ['applications', 'pending'], queryFn: async () => (await api.get<StudentApplicationsResponse>('/admin/student-applications?status=PENDING&page=1&limit=1')).data });
  const activeUsersQuery = useQuery({ queryKey: ['admin', 'users', 'active-count'], queryFn: async () => (await api.get<AdminUsersResponse>('/admin/users?isActive=true&page=1&limit=1')).data });
  const stats = query.data?.stats;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([query.refetch(), applicationsQuery.refetch(), activeUsersQuery.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }, [activeUsersQuery, applicationsQuery, query]);

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      contentContainerStyle={{ padding: 24, paddingBottom: 32 }}
      refreshControl={<RefreshControl colors={[COLORS.primary]} refreshing={refreshing} tintColor={COLORS.primary} onRefresh={onRefresh} />}
    >
      <Text className="text-2xl font-bold text-primary">Admin Dashboard</Text>
      <Text className="mt-2 text-sm text-slate-600">System users, applications, and active accounts.</Text>
      <View className="mt-6 gap-3">
        <View className="flex-row gap-3">
          <StatCard label="Students" value={stats?.totalStudents ?? 0} />
          <StatCard label="Instructors" value={stats?.totalInstructors ?? 0} />
        </View>
        <View className="flex-row gap-3">
          <StatCard label="Coordinators" value={stats?.totalCoordinators ?? 0} />
          <StatCard label="Gatekeepers" value={stats?.totalGatekeepers ?? 0} />
        </View>
        <View className="flex-row gap-3">
          <StatCard label="Pending applications" value={applicationsQuery.data?.total ?? 0} />
          <StatCard label="Active users" value={activeUsersQuery.data?.total ?? 0} />
        </View>
      </View>
    </ScrollView>
  );
}
