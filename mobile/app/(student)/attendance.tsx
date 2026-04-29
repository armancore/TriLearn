import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';

import { COLORS } from '@/src/constants/colors';
import { useAttendance } from '@/src/hooks/useAttendance';
import type { AttendanceSummary } from '@/src/types/attendance';

const getAttendanceTone = (percentage: number) => {
  if (percentage >= 75) {
    return {
      bar: '#16A34A',
      bg: '#DCFCE7',
      text: '#166534',
      label: 'On track',
    };
  }

  if (percentage >= 60) {
    return {
      bar: COLORS.accent,
      bg: '#FEF3C7',
      text: '#92400E',
      label: 'Watch',
    };
  }

  return {
    bar: COLORS.danger,
    bg: '#FEE2E2',
    text: COLORS.danger,
    label: 'At risk',
  };
};

const CountBadge = ({ label, value }: { label: string; value: number }) => (
  <View className="min-w-[72px] rounded-lg bg-slate-100 px-3 py-2">
    <Text className="text-xs font-medium text-slate-500">{label}</Text>
    <Text className="mt-1 text-base font-bold text-slate-900">{value}</Text>
  </View>
);

const AttendanceCard = ({ item }: { item: AttendanceSummary }) => {
  const tone = useMemo(() => getAttendanceTone(item.percentage), [item.percentage]);
  const clampedPercentage = Math.max(0, Math.min(100, item.percentage));

  return (
    <View className="rounded-2xl bg-white p-5">
      <View className="flex-row items-start justify-between gap-4">
        <View className="flex-1">
          <Text className="text-lg font-bold text-slate-900">{item.subjectName}</Text>
          <Text className="mt-1 text-sm font-medium text-slate-500">{item.subjectCode}</Text>
        </View>
        <View className="rounded-full px-3 py-1" style={{ backgroundColor: tone.bg }}>
          <Text className="text-xs font-bold" style={{ color: tone.text }}>
            {tone.label}
          </Text>
        </View>
      </View>

      <View className="mt-5">
        <View className="flex-row items-end justify-between">
          <Text className="text-sm font-medium text-slate-500">Attendance</Text>
          <Text className="text-2xl font-bold" style={{ color: tone.text }}>
            {Math.round(item.percentage)}%
          </Text>
        </View>
        <View className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
          <View
            className="h-full rounded-full"
            style={{ backgroundColor: tone.bar, width: `${clampedPercentage}%` }}
          />
        </View>
      </View>

      <View className="mt-5 flex-row gap-2">
        <CountBadge label="Present" value={item.present} />
        <CountBadge label="Absent" value={item.absent} />
        <CountBadge label="Late" value={item.late} />
      </View>

      <Text className="mt-4 text-xs text-slate-500">{item.total} total sessions recorded</Text>
    </View>
  );
};

const SkeletonCard = () => (
  <View className="rounded-2xl bg-white p-5">
    <View className="h-5 w-2/3 rounded-full bg-slate-200" />
    <View className="mt-2 h-4 w-24 rounded-full bg-slate-100" />
    <View className="mt-6 h-3 rounded-full bg-slate-100" />
    <View className="mt-5 flex-row gap-2">
      <View className="h-14 flex-1 rounded-lg bg-slate-100" />
      <View className="h-14 flex-1 rounded-lg bg-slate-100" />
      <View className="h-14 flex-1 rounded-lg bg-slate-100" />
    </View>
  </View>
);

export default function StudentAttendanceScreen() {
  const { summary, isLoading, refetch } = useAttendance();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch]);

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
      <View>
        <Text className="text-2xl font-bold text-primary">Attendance</Text>
        <Text className="mt-2 text-sm text-slate-600">
          Review attendance by subject and monitor minimum percentage requirements.
        </Text>
      </View>

      <View className="mt-6 gap-4">
        {isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : summary.length === 0 ? (
          <View className="items-center rounded-2xl bg-white px-5 py-10">
            <Text className="text-lg font-bold text-slate-900">No enrolled subjects</Text>
            <Text className="mt-2 text-center text-sm text-slate-500">
              Attendance summaries will appear here after subjects are assigned.
            </Text>
          </View>
        ) : (
          summary.map((item) => <AttendanceCard item={item} key={item.subjectId} />)
        )}
      </View>
    </ScrollView>
  );
}
