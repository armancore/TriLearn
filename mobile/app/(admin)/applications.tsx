import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { FlatList, Modal, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';

import { COLORS } from '@/src/constants/colors';
import { api } from '@/src/services/api';
import type { StudentApplication, StudentApplicationsResponse } from '@/src/types/admin';

export default function AdminApplicationsScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<StudentApplication | null>(null);
  const [form, setForm] = useState({ studentId: '', department: '', semester: '', section: '' });
  const query = useQuery({
    queryKey: ['admin', 'applications', 'PENDING'],
    queryFn: async () => (await api.get<StudentApplicationsResponse>('/admin/student-applications?status=PENDING&page=1&limit=50')).data,
  });

  const reviewMutation = useMutation({
    mutationFn: async (id: string) => api.patch(`/admin/student-applications/${id}/status`, { status: 'REVIEWED' }),
    onSuccess: async () => query.refetch(),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      await api.post(`/admin/student-applications/${selected.id}/create-account`, {
        studentId: form.studentId,
        department: form.department || selected.preferredDepartment,
        semester: Number(form.semester || selected.preferredSemester),
        section: form.section || selected.preferredSection || '',
      });
    },
    onSuccess: async () => {
      setSelected(null);
      await query.refetch();
    },
  });

  const openCreate = (application: StudentApplication) => {
    setSelected(application);
    setForm({
      studentId: '',
      department: application.preferredDepartment,
      semester: String(application.preferredSemester),
      section: application.preferredSection ?? '',
    });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try { await query.refetch(); } finally { setRefreshing(false); }
  };

  return (
    <View className="flex-1 bg-slate-50">
      <FlatList
        contentContainerStyle={{ gap: 12, padding: 24, paddingBottom: 32 }}
        data={query.data?.applications ?? []}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={<><Text className="text-2xl font-bold text-primary">Applications</Text><Text className="mt-2 text-sm text-slate-600">Pending student intake requests.</Text></>}
        ListEmptyComponent={query.isLoading ? <View className="h-24 rounded-2xl bg-white" /> : <Text className="rounded-2xl bg-white p-5 text-center text-slate-500">No pending applications</Text>}
        refreshControl={<RefreshControl colors={[COLORS.primary]} refreshing={refreshing} tintColor={COLORS.primary} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <View className="rounded-2xl bg-white p-5">
            <Text className="text-lg font-bold text-slate-900">{item.name}</Text>
            <Text className="mt-1 text-sm text-slate-500">{item.email}</Text>
            <Text className="mt-2 text-sm text-slate-600">{item.preferredDepartment} • Sem {item.preferredSemester}</Text>
            <View className="mt-4 flex-row gap-3">
              <Pressable className="flex-1 rounded-xl bg-slate-100 px-4 py-3" onPress={() => reviewMutation.mutate(item.id)}>
                <Text className="text-center font-bold text-primary">Review</Text>
              </Pressable>
              <Pressable className="flex-1 rounded-xl bg-primary px-4 py-3" onPress={() => openCreate(item)}>
                <Text className="text-center font-bold text-white">Create account</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
      <Modal animationType="slide" transparent visible={Boolean(selected)} onRequestClose={() => setSelected(null)}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setSelected(null)}>
          <Pressable className="rounded-t-3xl bg-white p-6" onPress={(event) => event.stopPropagation()}>
            <Text className="text-xl font-bold text-slate-900">Create account</Text>
            <TextInput className="mt-4 rounded-xl bg-slate-100 px-4 py-3" placeholder="Student ID / roll number" value={form.studentId} onChangeText={(studentId) => setForm((f) => ({ ...f, studentId }))} />
            <TextInput className="mt-3 rounded-xl bg-slate-100 px-4 py-3" placeholder="Department" value={form.department} onChangeText={(department) => setForm((f) => ({ ...f, department }))} />
            <View className="mt-3 flex-row gap-3">
              <TextInput className="flex-1 rounded-xl bg-slate-100 px-4 py-3" placeholder="Semester" keyboardType="number-pad" value={form.semester} onChangeText={(semester) => setForm((f) => ({ ...f, semester }))} />
              <TextInput className="flex-1 rounded-xl bg-slate-100 px-4 py-3" placeholder="Section" value={form.section} onChangeText={(section) => setForm((f) => ({ ...f, section }))} />
            </View>
            <Pressable className="mt-5 rounded-xl bg-primary px-5 py-4" onPress={() => createMutation.mutate()}>
              <Text className="text-center font-bold text-white">{createMutation.isPending ? 'Creating...' : 'Create account'}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
