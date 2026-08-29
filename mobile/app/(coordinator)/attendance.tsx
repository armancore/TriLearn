import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';

import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  FilterChips,
  ProgressBar,
  SCREEN_GUTTER,
  Screen,
  SkeletonList,
  StatTile,
  Text,
} from '@/src/components/ui';
import { api } from '@/src/services/api';
import { useTheme } from '@/src/theme/ThemeProvider';
import type { CoordinatorDepartmentReport } from '@/src/types/admin';

const SEMESTERS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;

const currentMonth = () => new Date().toISOString().slice(0, 7);

/** 75% is the minimum requirement; below 60% needs intervention. */
const getStanding = (percentage: number) => {
  if (percentage >= 75) return { tone: 'success' as const, label: 'On track', icon: 'checkmark-circle' as const };
  if (percentage >= 60) return { tone: 'warning' as const, label: 'Watch', icon: 'alert-circle' as const };
  return { tone: 'danger' as const, label: 'At risk', icon: 'warning' as const };
};

export default function CoordinatorAttendanceScreen() {
  const { colors } = useTheme();
  const [semester, setSemester] = useState<(typeof SEMESTERS)[number]>('1');
  const [refreshing, setRefreshing] = useState(false);
  const month = currentMonth();

  const query = useQuery({
    queryKey: ['coordinator', 'attendance-report', month, semester],
    queryFn: async () =>
      (
        await api.get<CoordinatorDepartmentReport>(
          `/attendance/coordinator/department-report?month=${month}&semester=${semester}`,
        )
      ).data,
  });

  const subjects = useMemo(() => {
    const grouped = new Map<
      string,
      { name: string; code: string; present: number; late: number; absent: number; total: number }
    >();

    for (const record of query.data?.records ?? []) {
      const key = record.subject.code;
      const item = grouped.get(key) ?? {
        name: record.subject.name,
        code: record.subject.code,
        present: 0,
        late: 0,
        absent: 0,
        total: 0,
      };

      item.total += 1;
      if (record.status === 'PRESENT') item.present += 1;
      if (record.status === 'LATE') item.late += 1;
      if (record.status === 'ABSENT') item.absent += 1;

      grouped.set(key, item);
    }

    return [...grouped.values()].map((item) => ({
      ...item,
      // Late still counts as attended for the monthly percentage.
      percentage: item.total ? Number((((item.present + item.late) / item.total) * 100).toFixed(1)) : 0,
    }));
  }, [query.data?.records]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await query.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [query]);

  return (
    <Screen
      header={{
        title: 'Attendance',
        subtitle: `${query.data?.department ?? 'Department'} · ${query.data?.monthLabel ?? month}`,
        showBack: false,
      }}
      padded={false}
      scroll={false}
    >
      <FlatList
        contentContainerStyle={{
          gap: 12,
          paddingHorizontal: SCREEN_GUTTER,
          paddingTop: 8,
          paddingBottom: 32,
          flexGrow: 1,
        }}
        data={subjects}
        keyExtractor={(item) => item.code}
        ListEmptyComponent={
          query.isLoading ? (
            <SkeletonList count={3} />
          ) : query.isError ? (
            <ErrorState onRetry={() => void query.refetch()} title="Could not load the report" />
          ) : (
            <EmptyState
              description={`No attendance was recorded for semester ${semester} this month.`}
              icon="stats-chart-outline"
              title="No records"
            />
          )
        }
        ListHeaderComponent={
          <View style={{ gap: 14, paddingBottom: 4 }}>
            <FilterChips
              formatLabel={(value) => `Sem ${value}`}
              label="Semester"
              onChange={setSemester}
              options={SEMESTERS}
              value={semester}
            />

            {query.data ? (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <StatTile icon="people-outline" label="Students" value={query.data.totalStudents} />
                <StatTile
                  icon="checkmark-outline"
                  label="Present"
                  value={query.data.summary.present}
                  valueColor={colors.success}
                />
                <StatTile
                  icon="close-outline"
                  label="Absent"
                  value={query.data.summary.absent}
                  valueColor={colors.danger}
                />
              </View>
            ) : null}
          </View>
        }
        refreshControl={
          <RefreshControl
            colors={[colors.primaryText]}
            onRefresh={onRefresh}
            progressBackgroundColor={colors.surface}
            refreshing={refreshing}
            tintColor={colors.primaryText}
          />
        }
        renderItem={({ item }) => {
          const standing = getStanding(item.percentage);
          const barColor =
            colors[standing.tone === 'success' ? 'success' : standing.tone === 'warning' ? 'warning' : 'danger'];

          return (
            <Card padding="lg">
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={2} variant="subheading">
                    {item.name}
                  </Text>
                  <Text style={{ marginTop: 3 }} tone="muted" variant="caption">
                    {item.code}
                  </Text>
                </View>
                <Badge icon={standing.icon} label={standing.label} tone={standing.tone} />
              </View>

              <Text style={{ marginTop: 14, color: barColor }} tone="inherit" variant="title">
                {item.percentage}%
              </Text>
              <ProgressBar
                color={barColor}
                label={`${item.name} attendance`}
                style={{ marginTop: 10 }}
                value={item.percentage}
              />

              <Text style={{ marginTop: 12 }} tone="subtle" variant="caption">
                {item.present} present · {item.late} late · {item.absent} absent
              </Text>
            </Card>
          );
        }}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}
