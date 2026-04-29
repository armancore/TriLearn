import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { FlatList, Modal, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';

import { COLORS } from '@/src/constants/colors';
import { api } from '@/src/services/api';
import type { Notice, NoticesResponse, NoticeAudience, NoticeType } from '@/src/types/notice';

const types: NoticeType[] = ['GENERAL', 'EXAM', 'HOLIDAY', 'EVENT', 'URGENT'];
const audiences: NoticeAudience[] = ['ALL', 'STUDENTS', 'INSTRUCTORS_ONLY'];

export default function CoordinatorNoticesScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', type: 'GENERAL' as NoticeType, audience: 'ALL' as NoticeAudience });
  const query = useQuery({ queryKey: ['notices', 'coordinator'], queryFn: async () => (await api.get<NoticesResponse>('/notices?page=1&limit=50')).data });
  const createMutation = useMutation({
    mutationFn: async () => api.post('/notices', form),
    onSuccess: async () => {
      setModalOpen(false);
      setForm({ title: '', content: '', type: 'GENERAL', audience: 'ALL' });
      await query.refetch();
    },
  });

  const onRefresh = async () => {
    setRefreshing(true);
    try { await query.refetch(); } finally { setRefreshing(false); }
  };

  return (
    <View className="flex-1 bg-slate-50">
      <FlatList
        contentContainerStyle={{ gap: 12, padding: 24, paddingBottom: 96 }}
        data={query.data?.notices ?? []}
        keyExtractor={(item: Notice) => item.id}
        ListHeaderComponent={<><Text className="text-2xl font-bold text-primary">Notices</Text><Text className="mt-2 text-sm text-slate-600">View and publish department notices.</Text></>}
        ListEmptyComponent={query.isLoading ? <View className="h-24 rounded-2xl bg-white" /> : <Text className="rounded-2xl bg-white p-5 text-center text-slate-500">No notices</Text>}
        refreshControl={<RefreshControl colors={[COLORS.primary]} refreshing={refreshing} tintColor={COLORS.primary} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <View className="rounded-2xl bg-white p-5">
            <Text className="text-lg font-bold text-slate-900">{item.title}</Text>
            <Text className="mt-1 text-xs font-bold text-primary">{item.type}</Text>
            <Text className="mt-3 text-sm text-slate-600" numberOfLines={3}>{item.content}</Text>
          </View>
        )}
      />
      <Pressable className="absolute bottom-6 right-6 h-14 w-14 items-center justify-center rounded-full bg-primary" onPress={() => setModalOpen(true)}>
        <Text className="text-3xl font-light text-white">+</Text>
      </Pressable>
      <Modal animationType="slide" transparent visible={modalOpen} onRequestClose={() => setModalOpen(false)}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setModalOpen(false)}>
          <Pressable className="rounded-t-3xl bg-white p-6" onPress={(event) => event.stopPropagation()}>
            <Text className="text-xl font-bold text-slate-900">Create notice</Text>
            <TextInput className="mt-4 rounded-xl bg-slate-100 px-4 py-3" placeholder="Title" value={form.title} onChangeText={(title) => setForm((f) => ({ ...f, title }))} />
            <TextInput className="mt-3 min-h-24 rounded-xl bg-slate-100 px-4 py-3" multiline placeholder="Content" value={form.content} onChangeText={(content) => setForm((f) => ({ ...f, content }))} />
            <FlatList horizontal className="mt-3" data={types} keyExtractor={(item) => item} renderItem={({ item }) => <Pressable className={`mr-2 rounded-full px-3 py-2 ${form.type === item ? 'bg-primary' : 'bg-slate-100'}`} onPress={() => setForm((f) => ({ ...f, type: item }))}><Text className={`text-xs font-bold ${form.type === item ? 'text-white' : 'text-slate-600'}`}>{item}</Text></Pressable>} />
            <FlatList horizontal className="mt-3" data={audiences} keyExtractor={(item) => item} renderItem={({ item }) => <Pressable className={`mr-2 rounded-full px-3 py-2 ${form.audience === item ? 'bg-primary' : 'bg-slate-100'}`} onPress={() => setForm((f) => ({ ...f, audience: item }))}><Text className={`text-xs font-bold ${form.audience === item ? 'text-white' : 'text-slate-600'}`}>{item}</Text></Pressable>} />
            <Pressable className="mt-5 rounded-xl bg-primary px-5 py-4" onPress={() => createMutation.mutate()}>
              <Text className="text-center font-bold text-white">{createMutation.isPending ? 'Creating...' : 'Create notice'}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
