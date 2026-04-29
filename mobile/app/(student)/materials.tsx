import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';

import { COLORS } from '@/src/constants/colors';
import { useToast } from '@/src/hooks/useToast';
import { api } from '@/src/services/api';
import type { StudyMaterial, StudyMaterialsResponse } from '@/src/types/material';
import { openAuthenticatedUpload } from '@/src/utils/uploadFiles';

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));

export default function StudentMaterialsScreen() {
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('ALL');
  const [refreshing, setRefreshing] = useState(false);
  const toast = useToast();

  const query = useQuery({
    queryKey: ['materials', 'student'],
    queryFn: async () => (await api.get<StudyMaterialsResponse>('/materials?page=1&limit=100')).data,
  });

  const subjectChips = useMemo(() => {
    const subjects = new Map<string, { id: string; label: string }>();
    for (const material of query.data?.materials ?? []) {
      subjects.set(material.subjectId, {
        id: material.subjectId,
        label: material.subject?.code ?? 'Subject',
      });
    }
    return [{ id: 'ALL', label: 'All' }, ...subjects.values()];
  }, [query.data?.materials]);

  const materials = useMemo(
    () =>
      (query.data?.materials ?? []).filter((material) => (
        selectedSubjectId === 'ALL' || material.subjectId === selectedSubjectId
      )),
    [query.data?.materials, selectedSubjectId],
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await query.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const openMaterial = async (material: StudyMaterial) => {
    try {
      await openAuthenticatedUpload(material.fileUrl);
    } catch (error) {
      toast.error(error, 'Could not open this material.');
    }
  };

  const renderMaterial = ({ item }: { item: StudyMaterial }) => (
    <View className="rounded-2xl bg-white p-5">
      <View className="flex-row items-start gap-4">
        <View className="h-12 w-12 items-center justify-center rounded-2xl bg-blue-100">
          <Ionicons color={COLORS.primary} name="document-text-outline" size={24} />
        </View>
        <View className="flex-1">
          <Text className="text-lg font-bold text-slate-900">{item.title}</Text>
          <Text className="mt-1 text-sm font-semibold text-primary">
            {item.subject?.name ?? 'Subject'} {item.subject?.code ? `(${item.subject.code})` : ''}
          </Text>
        </View>
      </View>
      {item.description ? (
        <Text className="mt-4 text-sm leading-6 text-slate-600" numberOfLines={3}>
          {item.description}
        </Text>
      ) : null}
      <View className="mt-5 flex-row items-center justify-between">
        <Text className="text-xs text-slate-500">Uploaded {formatDate(item.createdAt)}</Text>
        <Pressable className="rounded-xl bg-primary px-4 py-2" onPress={() => void openMaterial(item)}>
          <Text className="text-sm font-bold text-white">Open</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-slate-50">
      <FlatList
        contentContainerStyle={{ gap: 12, padding: 24, paddingBottom: 32 }}
        data={materials}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View>
            <Text className="text-2xl font-bold text-primary">Study Materials</Text>
            <Text className="mt-2 text-sm text-slate-600">Open course files shared by instructors.</Text>
            <FlatList
              className="mt-5"
              data={subjectChips}
              horizontal
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
              renderItem={({ item }) => {
                const active = selectedSubjectId === item.id;
                return (
                  <Pressable
                    className={`mr-2 rounded-full px-4 py-2 ${active ? 'bg-primary' : 'bg-white'}`}
                    onPress={() => setSelectedSubjectId(item.id)}
                  >
                    <Text className={`text-xs font-bold ${active ? 'text-white' : 'text-slate-600'}`}>{item.label}</Text>
                  </Pressable>
                );
              }}
            />
          </View>
        }
        ListEmptyComponent={
          query.isLoading ? (
            <View className="h-24 rounded-2xl bg-white" />
          ) : query.isError ? (
            <Text className="rounded-2xl bg-white p-5 text-center text-red-600">Could not load study materials. Pull down to retry.</Text>
          ) : (
            <Text className="rounded-2xl bg-white p-5 text-center text-slate-500">No study materials found</Text>
          )
        }
        refreshControl={<RefreshControl colors={[COLORS.primary]} refreshing={refreshing} tintColor={COLORS.primary} onRefresh={onRefresh} />}
        renderItem={renderMaterial}
      />
    </View>
  );
}
