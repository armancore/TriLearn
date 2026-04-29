import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';

import { COLORS } from '@/src/constants/colors';
import { api } from '@/src/services/api';
import type { AdminUser, AdminUsersResponse, CoordinatorDepartmentReport } from '@/src/types/admin';

const monthValue = () => new Date().toISOString().slice(0, 7);

export default function CoordinatorStudentsScreen() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const usersQuery = useQuery({
    queryKey: ['coordinator', 'students'],
    queryFn: async () => (await api.get<AdminUsersResponse>('/admin/users?role=STUDENT&page=1&limit=100')).data,
  });

  const reportQuery = useQuery({
    queryKey: ['coordinator', 'student-attendance', selected?.student?.semester],
    queryFn: async () => (await api.get<CoordinatorDepartmentReport>(`/attendance/coordinator/department-report?month=${monthValue()}&semester=${selected?.student?.semester ?? 1}`)).data,
    enabled: Boolean(selected?.student?.semester),
  });

  const students = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (usersQuery.data?.users ?? []).filter((user) => (
      !q || user.name.toLowerCase().includes(q) || user.student?.rollNumber?.toLowerCase().includes(q)
    ));
  }, [search, usersQuery.data?.users]);

  const selectedAttendance = reportQuery.data?.students.find((student) => student.id === selected?.student?.id)?.monthlyAverage ?? '-';

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await usersQuery.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <View className="flex-1 bg-slate-50">
      <FlatList
        contentContainerStyle={{ gap: 12, padding: 24, paddingBottom: 32 }}
        data={students}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View>
            <Text className="text-2xl font-bold text-primary">Students</Text>
            <TextInput className="mt-4 rounded-2xl bg-white px-4 py-3 text-slate-900" placeholder="Search name or roll number" value={search} onChangeText={setSearch} />
          </View>
        }
        ListEmptyComponent={usersQuery.isLoading ? <View className="h-24 rounded-2xl bg-white" /> : <Text className="rounded-2xl bg-white p-5 text-center text-slate-500">No students found</Text>}
        refreshControl={<RefreshControl colors={[COLORS.primary]} refreshing={refreshing} tintColor={COLORS.primary} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <Pressable className="rounded-2xl bg-white p-5 active:opacity-80" onPress={() => setSelected(item)}>
            <Text className="text-base font-bold text-slate-900">{item.name}</Text>
            <Text className="mt-1 text-sm text-slate-500">{item.student?.rollNumber ?? '-'} • Sem {item.student?.semester ?? '-'}</Text>
            <Text className="mt-2 text-sm text-slate-600">{item.student?.department ?? '-'} {item.student?.section ? `• Section ${item.student.section}` : ''}</Text>
          </Pressable>
        )}
      />
      <Modal animationType="slide" transparent visible={Boolean(selected)} onRequestClose={() => setSelected(null)}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setSelected(null)}>
          <Pressable className="rounded-t-3xl bg-white p-6" onPress={(event) => event.stopPropagation()}>
            <View className="h-1 w-12 self-center rounded-full bg-slate-200" />
            <Text className="mt-6 text-2xl font-bold text-slate-900">{selected?.name}</Text>
            <Text className="mt-2 text-sm text-slate-500">{selected?.email}</Text>
            <Text className="mt-1 text-sm text-slate-500">{selected?.phone ?? 'No contact number'}</Text>
            <View className="mt-5 rounded-2xl bg-slate-100 p-4">
              <Text className="text-xs font-medium text-slate-500">Attendance this month</Text>
              <Text className="mt-1 text-2xl font-bold text-slate-900">{selectedAttendance}{selectedAttendance !== '-' ? '%' : ''}</Text>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
