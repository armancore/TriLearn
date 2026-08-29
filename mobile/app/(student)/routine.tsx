import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  InlineNotice,
  Screen,
  SkeletonList,
  StatTile,
  Text,
} from '@/src/components/ui';
import { useAuth } from '@/src/hooks/useAuth';
import { api } from '@/src/services/api';
import { useTheme } from '@/src/theme/ThemeProvider';
import { radius } from '@/src/theme/tokens';
import type { DayOfWeek, Routine, RoutinesResponse } from '@/src/types/routine';

const DAYS: { short: string; long: string; value: DayOfWeek }[] = [
  { short: 'Sun', long: 'Sunday', value: 'SUNDAY' },
  { short: 'Mon', long: 'Monday', value: 'MONDAY' },
  { short: 'Tue', long: 'Tuesday', value: 'TUESDAY' },
  { short: 'Wed', long: 'Wednesday', value: 'WEDNESDAY' },
  { short: 'Thu', long: 'Thursday', value: 'THURSDAY' },
  { short: 'Fri', long: 'Friday', value: 'FRIDAY' },
  { short: 'Sat', long: 'Saturday', value: 'SATURDAY' },
];

const getToday = (): DayOfWeek => DAYS[new Date().getDay()]?.value ?? 'SUNDAY';

const classTypeLabel = (value?: Routine['classType']) => {
  if (value === 'WORKSHOP') return 'Workshop';
  if (value === 'TUTORIAL') return 'Tutorial';
  return 'Lecture';
};

/**
 * Day selector.
 *
 * Built as a tab list rather than plain buttons so the selected day is
 * announced, and "today" is marked with a dot plus an accessible label instead
 * of a colour tint alone.
 */
function DayPicker({
  activeDay,
  onChange,
  today,
}: {
  activeDay: DayOfWeek;
  onChange: (day: DayOfWeek) => void;
  today: DayOfWeek;
}) {
  const { colors } = useTheme();

  return (
    <ScrollView accessibilityLabel="Day of week" accessibilityRole="tablist" horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', gap: 8, paddingRight: 4 }}>
        {DAYS.map((day) => {
          const isActive = activeDay === day.value;
          const isToday = today === day.value;

          return (
            <Pressable
              accessibilityLabel={isToday ? `${day.long}, today` : day.long}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              key={day.value}
              onPress={() => onChange(day.value)}
              style={({ pressed }) => ({
                width: 52,
                height: 60,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                borderRadius: radius.md,
                borderWidth: 1,
                backgroundColor: isActive ? colors.primary : colors.surface,
                borderColor: isActive ? colors.primary : colors.border,
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <Text
                style={{
                  color: isActive ? colors.textOnPrimary : colors.textMuted,
                  fontSize: 13,
                  fontWeight: '600',
                }}
                tone="inherit"
              >
                {day.short}
              </Text>
              <View
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 999,
                  backgroundColor: isToday ? (isActive ? '#FFFFFF' : colors.accent) : 'transparent',
                }}
              />
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

export default function StudentRoutineScreen() {
  const { isAuthenticated, user } = useAuth();
  const [activeDay, setActiveDay] = useState<DayOfWeek>(getToday);
  const today = getToday();

  const student = user?.student;

  const routineQuery = useQuery({
    queryKey: ['routines', 'student'],
    queryFn: async () => (await api.get<RoutinesResponse>('/routines')).data,
    enabled: isAuthenticated,
  });

  const dayRoutines = useMemo(
    () =>
      (routineQuery.data?.routines ?? [])
        .filter((routine) => routine.dayOfWeek === activeDay)
        .sort((left, right) => left.startTime.localeCompare(right.startTime)),
    [activeDay, routineQuery.data?.routines],
  );

  const onRefresh = useCallback(async () => {
    await routineQuery.refetch();
  }, [routineQuery]);

  const subtitle = [
    student?.department,
    student?.semester ? `Semester ${student.semester}` : null,
    student?.section ? `Section ${student.section}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Screen header={{ title: 'Routine', subtitle: subtitle || 'Your weekly class timetable.' }} onRefresh={onRefresh}>
      <DayPicker activeDay={activeDay} onChange={setActiveDay} today={today} />

      <View accessibilityLiveRegion="polite" style={{ gap: 14, marginTop: 20 }}>
        {routineQuery.isLoading ? (
          <SkeletonList count={3} showFooter />
        ) : routineQuery.isError ? (
          <ErrorState onRetry={() => void routineQuery.refetch()} title="Could not load your routine" />
        ) : dayRoutines.length === 0 ? (
          <EmptyState
            description={`No classes are scheduled for ${DAYS.find((day) => day.value === activeDay)?.long ?? 'this day'}.`}
            icon="cafe-outline"
            title="No classes scheduled"
          />
        ) : (
          dayRoutines.map((routine) => (
            <Card key={routine.id} padding="lg">
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={2} variant="subheading">
                    {routine.subject?.name ?? 'Subject'}
                  </Text>
                  <Text style={{ marginTop: 3 }} tone="muted" variant="caption">
                    {routine.subject?.code ?? 'N/A'}
                  </Text>
                </View>
                <Badge label={classTypeLabel(routine.classType)} tone="primary" />
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <StatTile icon="time-outline" label="Time" value={`${routine.startTime}–${routine.endTime}`} />
                <StatTile icon="location-outline" label="Room" value={routine.room || '—'} />
              </View>

              <Text style={{ marginTop: 14 }} tone="muted" variant="caption">
                Instructor: {routine.instructor?.user?.name ?? 'To be announced'}
              </Text>

              {routine.note ? (
                <View style={{ marginTop: 14 }}>
                  <InlineNotice title={routine.note} tone="warning" />
                </View>
              ) : null}
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}
