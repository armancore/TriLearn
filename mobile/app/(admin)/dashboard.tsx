import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  EmptyState,
  PressableCard,
  Screen,
  Section,
  SkeletonCard,
  SkeletonList,
  StatTile,
  Text,
} from '@/src/components/ui';
import { useAuth } from '@/src/hooks/useAuth';
import { api } from '@/src/services/api';
import { useTheme } from '@/src/theme/ThemeProvider';
import type {
  AdminStatsResponse,
  AdminUsersResponse,
  StudentApplicationsResponse,
} from '@/src/types/admin';

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(value));

export default function AdminDashboardScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();

  const statsQuery = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: async () => (await api.get<AdminStatsResponse>('/admin/stats')).data,
  });

  // The dashboard shows the actual queue, not just its size, so the most
  // common admin task starts here instead of behind a tab.
  const applicationsQuery = useQuery({
    queryKey: ['admin', 'applications', 'dashboard'],
    queryFn: async () =>
      (await api.get<StudentApplicationsResponse>('/admin/student-applications?status=PENDING&page=1&limit=3'))
        .data,
  });

  const activeUsersQuery = useQuery({
    queryKey: ['admin', 'users', 'active-count'],
    queryFn: async () => (await api.get<AdminUsersResponse>('/admin/users?isActive=true&page=1&limit=1')).data,
  });

  const stats = statsQuery.data?.stats;
  const pendingTotal = applicationsQuery.data?.total ?? 0;
  const pending = applicationsQuery.data?.applications ?? [];
  const activeUsers = activeUsersQuery.data?.total ?? 0;
  const inactiveUsers = Math.max(0, (stats?.totalUsers ?? 0) - activeUsers);

  const onRefresh = useCallback(
    async () => Promise.all([statsQuery.refetch(), applicationsQuery.refetch(), activeUsersQuery.refetch()]),
    [activeUsersQuery, applicationsQuery, statsQuery],
  );

  return (
    <Screen header={{ title: 'Home', showBack: false }} onRefresh={onRefresh}>
      <Card padding="lg" style={{ backgroundColor: colors.primary, borderColor: colors.primary }}>
        <Text style={{ color: 'rgba(255,255,255,0.82)' }} tone="inherit" variant="caption">
          Administrator · {user?.name ?? 'Admin'}
        </Text>
        <Text style={{ color: '#FFFFFF', marginTop: 4 }} tone="inherit" variant="heading">
          {stats?.totalUsers ?? 0} accounts
        </Text>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
          <StatTile icon="checkmark-circle-outline" label="Active" onPrimary value={activeUsers} />
          <StatTile icon="pause-circle-outline" label="Disabled" onPrimary value={inactiveUsers} />
          <StatTile icon="library-outline" label="Subjects" onPrimary value={stats?.totalSubjects ?? 0} />
        </View>
      </Card>

      {/* The queue, front and centre */}
      <Section
        actionLabel={pendingTotal > 0 ? 'See all' : undefined}
        description="Student intake awaiting a decision"
        onAction={pendingTotal > 0 ? () => router.push('/(admin)/applications') : undefined}
        title="Pending applications"
      >
        {applicationsQuery.isLoading ? (
          <SkeletonList count={2} lines={1} />
        ) : pending.length === 0 ? (
          <EmptyState
            description="Nothing is waiting for review right now."
            icon="checkmark-done-outline"
            title="Queue is clear"
          />
        ) : (
          <View style={{ gap: 10 }}>
            {pending.map((application) => (
              <PressableCard
                accessibilityHint="Opens the applications queue"
                accessibilityLabel={`${application.name}, ${application.preferredDepartment}, semester ${application.preferredSemester}, applied ${formatDate(application.createdAt)}`}
                key={application.id}
                onPress={() => router.push('/(admin)/applications')}
                padding="md"
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} variant="bodyStrong">
                      {application.name}
                    </Text>
                    <Text numberOfLines={1} style={{ marginTop: 3 }} tone="muted" variant="caption">
                      {application.preferredDepartment} · Semester {application.preferredSemester}
                    </Text>
                  </View>
                  <Badge label={formatDate(application.createdAt)} tone="warning" />
                </View>
              </PressableCard>
            ))}

            {pendingTotal > pending.length ? (
              <Button
                accessibilityHint="Opens the full applications queue"
                label={`Review all ${pendingTotal}`}
                onPress={() => router.push('/(admin)/applications')}
                size="sm"
                variant="tonal"
              />
            ) : null}
          </View>
        )}
      </Section>

      <Section description="Accounts by role" title="People">
        {statsQuery.isLoading ? (
          <SkeletonCard lines={1} showFooter />
        ) : (
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <StatTile icon="people-outline" label="Students" value={stats?.totalStudents ?? 0} />
              <StatTile icon="school-outline" label="Instructors" value={stats?.totalInstructors ?? 0} />
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <StatTile icon="briefcase-outline" label="Coordinators" value={stats?.totalCoordinators ?? 0} />
              <StatTile icon="shield-outline" label="Gatekeepers" value={stats?.totalGatekeepers ?? 0} />
            </View>
            <Button
              accessibilityHint="Opens the user directory"
              icon="search-outline"
              label="Search and manage users"
              onPress={() => router.push('/(admin)/users')}
              variant="secondary"
            />
          </View>
        )}
      </Section>
    </Screen>
  );
}
