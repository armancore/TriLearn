import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';

import {
  Avatar,
  Badge,
  EmptyState,
  ErrorState,
  Input,
  PressableCard,
  SCREEN_GUTTER,
  Screen,
  Sheet,
  SkeletonList,
  StatTile,
  Text,
} from '@/src/components/ui';
import { api } from '@/src/services/api';
import { useTheme } from '@/src/theme/ThemeProvider';
import type { AdminUser, AdminUsersResponse, CoordinatorDepartmentReport } from '@/src/types/admin';

const currentMonth = () => new Date().toISOString().slice(0, 7);

export default function CoordinatorStudentsScreen() {
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const usersQuery = useQuery({
    queryKey: ['coordinator', 'students'],
    queryFn: async () =>
      (await api.get<AdminUsersResponse>('/admin/users?role=STUDENT&page=1&limit=100')).data,
  });

  const reportQuery = useQuery({
    queryKey: ['coordinator', 'student-attendance', selected?.student?.semester],
    queryFn: async () =>
      (
        await api.get<CoordinatorDepartmentReport>(
          `/attendance/coordinator/department-report?month=${currentMonth()}&semester=${selected?.student?.semester ?? 1}`,
        )
      ).data,
    enabled: Boolean(selected?.student?.semester),
  });

  const students = useMemo(() => {
    const query = search.trim().toLowerCase();

    return (usersQuery.data?.users ?? []).filter(
      (user) =>
        !query ||
        user.name.toLowerCase().includes(query) ||
        user.student?.rollNumber?.toLowerCase().includes(query),
    );
  }, [search, usersQuery.data?.users]);

  const selectedAttendance =
    reportQuery.data?.students.find((student) => student.id === selected?.student?.id)?.monthlyAverage ?? null;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await usersQuery.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [usersQuery]);

  return (
    <>
      <Screen
        header={{
          title: 'Students',
          subtitle: usersQuery.data ? `${usersQuery.data.total} enrolled` : 'Search the student roster.',
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
          data={students}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            usersQuery.isLoading ? (
              <SkeletonList count={4} lines={1} />
            ) : usersQuery.isError ? (
              <ErrorState onRetry={() => void usersQuery.refetch()} title="Could not load students" />
            ) : (
              <EmptyState
                description={
                  search ? `Nothing matches “${search.trim()}”.` : 'Students in your department will appear here.'
                }
                icon="people-outline"
                title="No students found"
              />
            )
          }
          ListHeaderComponent={
            <Input
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
              icon="search-outline"
              label="Search"
              onChangeText={setSearch}
              placeholder="Name or roll number"
              returnKeyType="search"
              value={search}
            />
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
          renderItem={({ item }) => (
            <PressableCard
              accessibilityHint="Opens student details"
              accessibilityLabel={`${item.name}, roll number ${item.student?.rollNumber ?? 'unknown'}, semester ${item.student?.semester ?? 'unknown'}`}
              onPress={() => setSelected(item)}
              padding="md"
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Avatar name={item.name} size={42} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} variant="bodyStrong">
                    {item.name}
                  </Text>
                  <Text numberOfLines={1} style={{ marginTop: 2 }} tone="muted" variant="caption">
                    {item.student?.rollNumber ?? '—'}
                    {item.student?.department ? ` · ${item.student.department}` : ''}
                  </Text>
                </View>
                <Badge label={`Sem ${item.student?.semester ?? '—'}`} tone="primary" />
              </View>
            </PressableCard>
          )}
          showsVerticalScrollIndicator={false}
        />
      </Screen>

      <Sheet
        onClose={() => setSelected(null)}
        subtitle={selected?.email}
        title={selected?.name ?? ''}
        visible={Boolean(selected)}
      >
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <StatTile icon="id-card-outline" label="Roll number" value={selected?.student?.rollNumber ?? '—'} />
          <StatTile icon="layers-outline" label="Semester" value={selected?.student?.semester ?? '—'} />
          <StatTile icon="grid-outline" label="Section" value={selected?.student?.section ?? '—'} />
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <StatTile icon="call-outline" label="Phone" value={selected?.phone ?? '—'} />
          <StatTile
            icon="calendar-outline"
            label="Attendance this month"
            value={reportQuery.isLoading ? '…' : selectedAttendance ? `${selectedAttendance}%` : '—'}
          />
        </View>

        {selected?.student?.department ? (
          <Text style={{ marginTop: 16 }} tone="muted" variant="caption">
            {selected.student.department}
          </Text>
        ) : null}
      </Sheet>
    </>
  );
}
