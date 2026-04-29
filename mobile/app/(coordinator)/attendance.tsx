import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, Text, TextInput, View } from 'react-native';

import { COLORS } from '@/src/constants/colors';
import { api } from '@/src/services/api';
import type { CoordinatorDepartmentReport } from '@/src/types/admin';

const currentMonth = () => new Date().toISOString().slice(0, 7);

const toneFor = (percentage: number) => {
  if (percentage >= 75) return { bg: '#DCFCE7', text: '#166534', label: 'On track' };
  if (percentage >= 60) return { bg: '#FEF3C7', text: '#92400E', label: 'Watch' };
  return { bg: '#FEE2E2', text: '#B91C1C', label: 'At risk' };
};

export default function CoordinatorAttendanceScreen() {
  const [semester, setSemester] = useState('1');
  const [refreshing, setRefreshing] = useState(false);
  const month = currentMonth();

  const query = useQuery({
    queryKey: ['coordinator', 'attendance-report', month, semester],
    queryFn: async () => (await api.get<CoordinatorDepartmentReport>(`/attendance/coordinator/department-report?month=${month}&semester=${semester}`)).data,
  });

  const subjects = useMemo(() => {
    const grouped = new Map<string, { name: string; code: string; present: number; late: number; absent: number; total: number }>();
    for (const record of query.data?.records ?? []) {
      const key = record.subject.code;
      const item = grouped.get(key) ?? { name: record.subject.name, code: record.subject.code, present: 0, late: 0, absent: 0, total: 0 };
      item.total += 1;
      if (record.status === 'PRESENT') item.present += 1;
      if (record.status === 'LATE') item.late += 1;
      if (record.status === 'ABSENT') item.absent += 1;
      grouped.set(key, item);
    }
    return [...grouped.values()].map((item) => ({
      ...item,
      percentage: item.total ? Number((((item.present + item.late) / item.total) * 100).toFixed(1)) : 0,
    }));
  }, [query.data?.records]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await query.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <FlatList
      className="flex-1 bg-slate-50"
      contentContainerStyle={{ gap: 12, padding: 24, paddingBottom: 32 }}
      data={subjects}
      keyExtractor={(item) => item.code}
      ListHeaderComponent={
        <View>
          <Text className="text-2xl font-bold text-primary">Attendance</Text>
          <Text className="mt-2 text-sm text-slate-600">{query.data?.department ?? 'Department'} • {query.data?.monthLabel ?? month}</Text>
          <View className="mt-5 rounded-2xl bg-white p-4">
            <Text className="text-xs font-medium text-slate-500">Semester</Text>
            <TextInput className="mt-1 text-base font-bold text-slate-900" keyboardType="number-pad" value={semester} onChangeText={setSemester} />
          </View>
        </View>
      }
      ListEmptyComponent={query.isLoading ? <View className="h-24 rounded-2xl bg-white" /> : <Text className="rounded-2xl bg-white p-5 text-center text-slate-500">No attendance records</Text>}
      refreshControl={<RefreshControl colors={[COLORS.primary]} refreshing={refreshing} tintColor={COLORS.primary} onRefresh={onRefresh} />}
      renderItem={({ item }) => {
        const tone = toneFor(item.percentage);
        return (
          <View className="rounded-2xl bg-white p-5">
            <View className="flex-row items-start justify-between gap-4">
              <View className="flex-1">
                <Text className="text-lg font-bold text-slate-900">{item.name}</Text>
                <Text className="mt-1 text-sm font-semibold text-primary">{item.code}</Text>
              </View>
              <View className="rounded-full px-3 py-1" style={{ backgroundColor: tone.bg }}>
                <Text className="text-xs font-bold" style={{ color: tone.text }}>{tone.label}</Text>
              </View>
            </View>
            <Text className="mt-4 text-3xl font-bold text-slate-900">{item.percentage}%</Text>
            <Text className="mt-1 text-sm text-slate-500">{item.present} present • {item.late} late • {item.absent} absent</Text>
          </View>
        );
      }}
    />
  );
}
