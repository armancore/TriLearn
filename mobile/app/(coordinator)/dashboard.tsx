import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  EmptyState,
  ProgressBar,
  QuickLinks,
  Screen,
  Section,
  SkeletonCard,
  StatTile,
  Text,
} from '@/src/components/ui';
import { useAuth } from '@/src/hooks/useAuth';
import { api } from '@/src/services/api';
import { useTheme } from '@/src/theme/ThemeProvider';
import type { CoordinatorDepartmentReport, DepartmentsResponse } from '@/src/types/admin';
import type { ProfileResponse } from '@/src/types/profile';

const ATTENDANCE_MINIMUM = 75;

const currentMonth = () => new Date().toISOString().slice(0, 7);

const toPercentage = (value: string) => {
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export default function CoordinatorDashboardScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const month = currentMonth();

  const profileQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => (await api.get<ProfileResponse>('/auth/me')).data,
  });

  const departmentsQuery = useQuery({
    queryKey: ['departments'],
    queryFn: async () => (await api.get<DepartmentsResponse>('/departments')).data,
  });

  /*
   * A coordinator's actual job is spotting students who will fall below the
   * attendance requirement, so the dashboard leads with that rather than with
   * a count of how many people exist. Semester 1 is the default view; the
   * report screen covers the rest.
   */
  const reportQuery = useQuery({
    queryKey: ['coordinator', 'attendance-report', month, '1'],
    queryFn: async () =>
      (
        await api.get<CoordinatorDepartmentReport>(
          `/attendance/coordinator/department-report?month=${month}&semester=1`,
        )
      ).data,
  });

  const atRisk = useMemo(
    () =>
      (reportQuery.data?.students ?? [])
        .filter((student) => toPercentage(student.monthlyAverage) < ATTENDANCE_MINIMUM)
        .sort((left, right) => toPercentage(left.monthlyAverage) - toPercentage(right.monthlyAverage)),
    [reportQuery.data?.students],
  );

  const totalStudents = reportQuery.data?.students.length ?? 0;
  const summary = reportQuery.data?.summary;
  const attended = (summary?.present ?? 0) + (summary?.late ?? 0);
  const departmentAverage = summary?.total ? Math.round((attended / summary.total) * 100) : 0;

  const onRefresh = useCallback(
    async () => Promise.all([profileQuery.refetch(), departmentsQuery.refetch(), reportQuery.refetch()]),
    [departmentsQuery, profileQuery, reportQuery],
  );

  return (
    <Screen header={{ title: 'Home', showBack: false }} onRefresh={onRefresh}>
      <Card padding="lg" style={{ backgroundColor: colors.primary, borderColor: colors.primary }}>
        <Text style={{ color: 'rgba(255,255,255,0.82)' }} tone="inherit" variant="caption">
          Coordinator · {user?.name ?? 'Coordinator'}
        </Text>
        <Text numberOfLines={2} style={{ color: '#FFFFFF', marginTop: 4 }} tone="inherit" variant="heading">
          {profileQuery.data?.user.coordinator?.department ?? 'Department not assigned'}
        </Text>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
          <StatTile icon="people-outline" label="Students" onPrimary value={totalStudents} />
          <StatTile icon="stats-chart-outline" label="Avg attendance" onPrimary value={`${departmentAverage}%`} />
          <StatTile icon="business-outline" label="Departments" onPrimary value={departmentsQuery.data?.total ?? 0} />
        </View>
      </Card>

      <View style={{ marginTop: 16 }}>
        <QuickLinks
          label="Coordinator shortcuts"
          links={[
            { label: 'Students', icon: 'people-outline', onPress: () => router.push('/(coordinator)/students') },
            { label: 'Report', icon: 'stats-chart-outline', onPress: () => router.push('/(coordinator)/attendance') },
            { label: 'Notices', icon: 'megaphone-outline', onPress: () => router.push('/(coordinator)/notices') },
          ]}
        />
      </View>

      <Section
        actionLabel="Full report"
        description={`${reportQuery.data?.monthLabel ?? month} · semester 1`}
        onAction={() => router.push('/(coordinator)/attendance')}
        title="Needs attention"
      >
        {reportQuery.isLoading ? (
          <SkeletonCard lines={2} />
        ) : atRisk.length === 0 ? (
          <EmptyState
            description={`Every student is at or above ${ATTENDANCE_MINIMUM}% this month.`}
            icon="checkmark-done-outline"
            title="No one at risk"
          />
        ) : (
          <Card padding="lg">
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <Text variant="subheading">
                {atRisk.length} below {ATTENDANCE_MINIMUM}%
              </Text>
              <Badge icon="warning" label="At risk" tone="warning" />
            </View>

            <View style={{ gap: 12, marginTop: 16 }}>
              {atRisk.slice(0, 4).map((student) => {
                const percentage = toPercentage(student.monthlyAverage);
                const isCritical = percentage < 60;

                return (
                  <View key={student.id}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} variant="caption">
                          {student.name}
                        </Text>
                        <Text numberOfLines={1} style={{ marginTop: 1 }} tone="subtle" variant="label">
                          {student.rollNumber}
                        </Text>
                      </View>
                      <Text
                        style={{ color: isCritical ? colors.danger : colors.warning, fontWeight: '700' }}
                        tone="inherit"
                        variant="caption"
                      >
                        {percentage}%
                      </Text>
                    </View>
                    <ProgressBar
                      color={isCritical ? colors.danger : colors.warning}
                      height={6}
                      label={`${student.name} attendance`}
                      style={{ marginTop: 6 }}
                      value={percentage}
                    />
                  </View>
                );
              })}
            </View>

            <Button
              accessibilityHint="Opens the department attendance report"
              label={atRisk.length > 4 ? `See all ${atRisk.length}` : 'Open report'}
              onPress={() => router.push('/(coordinator)/attendance')}
              size="sm"
              style={{ marginTop: 18 }}
              variant="tonal"
            />
          </Card>
        )}
      </Section>

      <Section description="Publish an announcement to your department" title="Notices">
        <Button
          accessibilityHint="Opens the notices screen"
          icon="megaphone-outline"
          label="Write a notice"
          onPress={() => router.push('/(coordinator)/notices')}
          variant="secondary"
        />
      </Section>
    </Screen>
  );
}
