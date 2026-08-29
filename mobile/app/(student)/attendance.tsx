import { useCallback, useMemo } from 'react';
import { View } from 'react-native';

import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  ProgressBar,
  Screen,
  SkeletonList,
  StatTile,
  Text,
} from '@/src/components/ui';
import { useAttendance } from '@/src/hooks/useAttendance';
import { useTheme } from '@/src/theme/ThemeProvider';
import type { AttendanceSummary } from '@/src/types/attendance';

type Standing = {
  tone: 'success' | 'warning' | 'danger';
  label: string;
  icon: 'checkmark-circle' | 'alert-circle' | 'warning';
};

/** 75% is the usual minimum requirement; below 60% is treated as critical. */
const getStanding = (percentage: number): Standing => {
  if (percentage >= 75) return { tone: 'success', label: 'On track', icon: 'checkmark-circle' };
  if (percentage >= 60) return { tone: 'warning', label: 'Watch', icon: 'alert-circle' };
  return { tone: 'danger', label: 'At risk', icon: 'warning' };
};

const toNumber = (value: string) => {
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

function AttendanceCard({ item }: { item: AttendanceSummary }) {
  const { colors } = useTheme();
  const percentage = toNumber(item.percentage);
  const standing = getStanding(percentage);
  const barColor = colors[standing.tone === 'success' ? 'success' : standing.tone === 'warning' ? 'warning' : 'danger'];

  return (
    <Card padding="lg">
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={2} variant="subheading">
            {item.subject}
          </Text>
          <Text style={{ marginTop: 3 }} tone="muted" variant="caption">
            {item.code}
          </Text>
        </View>
        <Badge icon={standing.icon} label={standing.label} tone={standing.tone} />
      </View>

      <View style={{ marginTop: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <Text tone="muted" variant="caption">
            Attendance
          </Text>
          <Text style={{ color: barColor }} tone="inherit" variant="title">
            {percentage}%
          </Text>
        </View>
        <ProgressBar
          color={barColor}
          label={`${item.subject} attendance`}
          style={{ marginTop: 10 }}
          value={percentage}
        />
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
        <StatTile icon="checkmark-outline" label="Present" value={item.present} />
        <StatTile icon="close-outline" label="Absent" value={item.absent} />
        <StatTile icon="time-outline" label="Late" value={item.late} />
      </View>

      <Text style={{ marginTop: 14 }} tone="subtle" variant="caption">
        {item.total} total {item.total === 1 ? 'session' : 'sessions'} recorded
      </Text>
    </Card>
  );
}

export default function StudentAttendanceScreen() {
  const { summary, isLoading, isError, error, refetch } = useAttendance();

  const onRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const atRisk = useMemo(
    () => summary.filter((item) => toNumber(item.percentage) < 75).length,
    [summary],
  );

  return (
    <Screen
      header={{
        title: 'Attendance',
        subtitle: 'Attendance by subject against the 75% minimum requirement.',
        showBack: false,
      }}
      onRefresh={onRefresh}
    >
      {!isLoading && !isError && summary.length > 0 ? (
        <Card padding="md" style={{ marginBottom: 16 }} variant="muted">
          <Text tone="muted" variant="caption">
            {atRisk === 0
              ? `All ${summary.length} subjects are meeting the minimum requirement.`
              : `${atRisk} of ${summary.length} subjects ${atRisk === 1 ? 'is' : 'are'} below 75%.`}
          </Text>
        </Card>
      ) : null}

      <View style={{ gap: 14 }}>
        {isLoading ? (
          <SkeletonList count={3} showFooter />
        ) : isError ? (
          <ErrorState
            description={error instanceof Error ? error.message : 'Pull down to retry.'}
            onRetry={() => void refetch()}
            title="Could not load attendance"
          />
        ) : summary.length === 0 ? (
          <EmptyState
            description="Attendance summaries appear here once your subjects are assigned."
            icon="calendar-outline"
            title="No enrolled subjects"
          />
        ) : (
          summary.map((item) => <AttendanceCard item={item} key={item.subjectId ?? item.code} />)
        )}
      </View>
    </Screen>
  );
}
