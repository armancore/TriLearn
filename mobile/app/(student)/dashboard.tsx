import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { View } from 'react-native';

import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  IconButton,
  PressableCard,
  ProgressBar,
  QuickLinks,
  Screen,
  Section,
  SkeletonCard,
  SkeletonList,
  StatTile,
  Text,
} from '@/src/components/ui';
import { useAuth } from '@/src/hooks/useAuth';
import { useNotificationsStore } from '@/src/store/notifications.store';
import { api } from '@/src/services/api';
import { useTheme } from '@/src/theme/ThemeProvider';
import { radius } from '@/src/theme/tokens';
import type { AttendanceSummaryResponse } from '@/src/types/attendance';
import type { RoutinesResponse } from '@/src/types/routine';

interface Assignment {
  id: string;
  title: string;
  dueDate: string;
  totalMarks: number;
  subject?: { name: string; code: string } | null;
  submissions?: unknown[];
  submission?: unknown | null;
}

interface MarksSummaryResponse {
  examType: string | null;
  resultSheet: {
    subjects: { id: string }[];
    totals: { obtainedMarks: number; totalMarks: number };
    overallPercentage: number;
    overallGrade: string;
    overallGpa: number;
  };
}

const DAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;

/** The college flags attendance under 75%; under 60% is critical. */
const ATTENDANCE_MINIMUM = 75;

const parsePercentage = (percentage: string) => {
  const value = parseFloat(percentage);
  return Number.isNaN(value) ? 0 : value;
};

const formatDueDate = (value: string) =>
  new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(value));

const daysUntil = (value: string) =>
  Math.ceil((new Date(value).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

/** "HH:MM" → minutes since midnight, for comparing against the current time. */
const toMinutes = (time: string) => {
  const [hours, minutes] = time.split(':').map((part) => Number.parseInt(part, 10));
  return Number.isNaN(hours) ? -1 : hours * 60 + (Number.isNaN(minutes) ? 0 : minutes);
};

export default function StudentDashboardScreen() {
  const { colors } = useTheme();
  const { isAuthenticated, user } = useAuth();
  const unreadCount = useNotificationsStore((state) => state.unreadCount);

  const attendanceQuery = useQuery({
    queryKey: ['attendance', 'my'],
    queryFn: async () => (await api.get<AttendanceSummaryResponse>('/attendance/my')).data,
    enabled: isAuthenticated,
  });

  const assignmentsQuery = useQuery({
    queryKey: ['assignments', 'student', 'dashboard'],
    queryFn: async () => (await api.get<{ assignments: Assignment[] }>('/assignments?page=1&limit=5')).data,
    enabled: isAuthenticated,
  });

  const marksQuery = useQuery({
    queryKey: ['marks', 'my', 'summary'],
    queryFn: async () => (await api.get<MarksSummaryResponse>('/marks/my/summary')).data,
    enabled: isAuthenticated,
  });

  const todayName = DAY_NAMES[new Date().getDay()];
  const routineQuery = useQuery({
    queryKey: ['routines', 'student', 'today', todayName],
    queryFn: async () => (await api.get<RoutinesResponse>(`/routines?dayOfWeek=${todayName}`)).data,
    enabled: isAuthenticated,
  });

  /** The next class that has not finished yet, or null once the day is over. */
  const nextClass = useMemo(() => {
    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();

    return (
      (routineQuery.data?.routines ?? [])
        .filter((routine) => routine.dayOfWeek === todayName)
        .filter((routine) => toMinutes(routine.endTime) >= nowMinutes)
        .sort((left, right) => toMinutes(left.startTime) - toMinutes(right.startTime))[0] ?? null
    );
  }, [routineQuery.data?.routines, todayName]);

  const isInProgress = useMemo(() => {
    if (!nextClass) {
      return false;
    }

    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
    return toMinutes(nextClass.startTime) <= nowMinutes && toMinutes(nextClass.endTime) >= nowMinutes;
  }, [nextClass]);

  // Memoised: a fresh `[]` fallback each render would defeat the two useMemos
  // below that depend on it.
  const summary = useMemo(() => attendanceQuery.data?.summary ?? [], [attendanceQuery.data?.summary]);

  const overallAttendance = useMemo(() => {
    if (summary.length === 0) {
      return 0;
    }

    const total = summary.reduce((sum, item) => sum + parsePercentage(item.percentage), 0);
    return Number((total / summary.length).toFixed(1));
  }, [summary]);

  /** Only subjects below the requirement — the ones worth acting on. */
  const atRiskSubjects = useMemo(
    () =>
      summary
        .filter((item) => parsePercentage(item.percentage) < ATTENDANCE_MINIMUM)
        .sort((left, right) => parsePercentage(left.percentage) - parsePercentage(right.percentage)),
    [summary],
  );

  const upcomingAssignments = useMemo(() => {
    const now = Date.now();
    return (assignmentsQuery.data?.assignments ?? [])
      .filter((assignment) => !assignment.submission && !assignment.submissions?.length)
      .filter((assignment) => new Date(assignment.dueDate).getTime() >= now)
      .sort((left, right) => new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime())
      .slice(0, 3);
  }, [assignmentsQuery.data?.assignments]);

  const handleRefresh = useCallback(
    async () =>
      Promise.all([
        attendanceQuery.refetch(),
        assignmentsQuery.refetch(),
        marksQuery.refetch(),
        routineQuery.refetch(),
      ]),
    [assignmentsQuery, attendanceQuery, marksQuery, routineQuery],
  );

  const student = user?.student;
  const marks = marksQuery.data;

  return (
    <Screen
      header={{
        title: 'Home',
        showBack: false,
        actions: (
          <>
            <IconButton
              accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
              badgeCount={unreadCount}
              icon="notifications-outline"
              onPress={() => router.push('/(student)/notifications')}
              variant="ghost"
            />
            <IconButton
              accessibilityLabel="Scan attendance QR code"
              icon="qr-code-outline"
              onPress={() => router.push('/(student)/scanner')}
              variant="solid"
            />
          </>
        ),
      }}
      onRefresh={handleRefresh}
    >
      {/* Identity */}
      <Card padding="lg" style={{ backgroundColor: colors.primary, borderColor: colors.primary }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar name={user?.name} onPrimary size={52} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: 'rgba(255,255,255,0.82)' }} tone="inherit" variant="caption">
              Welcome back
            </Text>
            <Text numberOfLines={1} style={{ color: '#FFFFFF', marginTop: 2 }} tone="inherit" variant="heading">
              {user?.name ?? 'Student'}
            </Text>
            <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.78)', marginTop: 3 }} tone="inherit" variant="caption">
              {[student?.department, student?.semester ? `Semester ${student.semester}` : null, student?.rollNumber]
                .filter(Boolean)
                .join(' · ') || 'Student'}
            </Text>
          </View>
        </View>
      </Card>

      {/* What's happening right now — the reason to open the app */}
      <Section title="Today">
        {routineQuery.isLoading ? (
          <SkeletonCard lines={1} />
        ) : nextClass ? (
          <PressableCard
            accessibilityHint="Opens your full weekly routine"
            accessibilityLabel={`${isInProgress ? 'In progress' : 'Next class'}: ${nextClass.subject?.name ?? 'Class'}, ${nextClass.startTime} to ${nextClass.endTime}${nextClass.room ? `, room ${nextClass.room}` : ''}`}
            onPress={() => router.push('/(student)/routine')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Badge
                  icon={isInProgress ? 'radio-button-on' : 'time-outline'}
                  label={isInProgress ? 'In progress' : 'Next class'}
                  tone={isInProgress ? 'success' : 'primary'}
                />
                <Text numberOfLines={2} style={{ marginTop: 10 }} variant="subheading">
                  {nextClass.subject?.name ?? 'Class'}
                </Text>
                <Text numberOfLines={1} style={{ marginTop: 3 }} tone="muted" variant="caption">
                  {nextClass.subject?.code ?? ''}
                  {nextClass.instructor?.user?.name ? ` · ${nextClass.instructor.user.name}` : ''}
                </Text>
              </View>

              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: colors.primaryText }} tone="inherit" variant="heading">
                  {nextClass.startTime}
                </Text>
                <Text style={{ marginTop: 2 }} tone="subtle" variant="caption">
                  to {nextClass.endTime}
                </Text>
                {nextClass.room ? (
                  <Text style={{ marginTop: 6 }} tone="subtle" variant="caption">
                    Room {nextClass.room}
                  </Text>
                ) : null}
              </View>
            </View>
          </PressableCard>
        ) : (
          <EmptyState
            description="Nothing left on your timetable today."
            icon="cafe-outline"
            title="No more classes"
          />
        )}
      </Section>

      {/* Shortcuts — only destinations that are NOT already tabs */}
      <View style={{ marginTop: 16 }}>
        <QuickLinks
          label="Student shortcuts"
          links={[
            { label: 'Routine', icon: 'time-outline', onPress: () => router.push('/(student)/routine') },
            { label: 'Materials', icon: 'folder-outline', onPress: () => router.push('/(student)/materials') },
            { label: 'Notices', icon: 'megaphone-outline', onPress: () => router.push('/(student)/notices') },
            { label: 'ID card', icon: 'card-outline', onPress: () => router.push('/(student)/id-card') },
            { label: 'Tickets', icon: 'ticket-outline', onPress: () => router.push('/(student)/tickets') },
          ]}
        />
      </View>

      {/* Attendance — lead with risk, not a bare average */}
      <Section actionLabel="Details" onAction={() => router.push('/(student)/attendance')} title="Attendance">
        {attendanceQuery.isLoading ? (
          <SkeletonCard lines={2} />
        ) : attendanceQuery.isError ? (
          <EmptyState
            actionLabel="Retry"
            description="We could not load your attendance summary."
            icon="cloud-offline-outline"
            onAction={() => void attendanceQuery.refetch()}
            title="Attendance unavailable"
          />
        ) : (
          <Card padding="lg">
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <View>
                <Text tone="muted" variant="caption">
                  Overall
                </Text>
                <Text style={{ marginTop: 4 }} variant="display">
                  {overallAttendance}%
                </Text>
              </View>
              <Badge
                icon={atRiskSubjects.length === 0 ? 'checkmark-circle' : 'warning'}
                label={atRiskSubjects.length === 0 ? 'All on track' : `${atRiskSubjects.length} below ${ATTENDANCE_MINIMUM}%`}
                tone={atRiskSubjects.length === 0 ? 'success' : 'warning'}
              />
            </View>

            <ProgressBar
              color={overallAttendance >= ATTENDANCE_MINIMUM ? colors.success : colors.warning}
              label="Overall attendance"
              style={{ marginTop: 16 }}
              value={overallAttendance}
            />

            {atRiskSubjects.length > 0 ? (
              <View style={{ marginTop: 16, gap: 8 }}>
                {atRiskSubjects.slice(0, 3).map((item) => {
                  const percentage = parsePercentage(item.percentage);

                  return (
                    <View
                      key={item.subjectId ?? item.code}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                        padding: 10,
                        borderRadius: radius.md,
                        backgroundColor: colors.surfaceMuted,
                      }}
                    >
                      <Text numberOfLines={1} style={{ flex: 1 }} variant="caption">
                        {item.subject}
                      </Text>
                      <Text
                        style={{ color: percentage < 60 ? colors.danger : colors.warning, fontWeight: '700' }}
                        tone="inherit"
                        variant="caption"
                      >
                        {percentage}%
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={{ marginTop: 12 }} tone="subtle" variant="caption">
                Averaged across {summary.length} {summary.length === 1 ? 'subject' : 'subjects'}.
              </Text>
            )}
          </Card>
        )}
      </Section>

      {/* Due soon */}
      <Section
        actionLabel="See all"
        onAction={() => router.push('/(student)/assignments')}
        title="Due soon"
      >
        {assignmentsQuery.isLoading ? (
          <SkeletonList count={2} />
        ) : upcomingAssignments.length === 0 ? (
          <EmptyState
            description="Submitted work and past deadlines are not shown here."
            icon="checkmark-done-outline"
            title="Nothing due right now"
          />
        ) : (
          <View style={{ gap: 12 }}>
            {upcomingAssignments.map((assignment) => {
              const days = daysUntil(assignment.dueDate);

              return (
                <PressableCard
                  accessibilityHint="Opens the assignment list"
                  accessibilityLabel={`${assignment.title}, ${assignment.subject?.name ?? 'subject'}, due ${formatDueDate(assignment.dueDate)}`}
                  key={assignment.id}
                  onPress={() => router.push('/(student)/assignments')}
                  padding="md"
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={2} variant="bodyStrong">
                        {assignment.title}
                      </Text>
                      <Text numberOfLines={1} style={{ marginTop: 3 }} tone="muted" variant="caption">
                        {assignment.subject?.name ?? 'Subject'} · {assignment.totalMarks} marks
                      </Text>
                    </View>
                    <Badge
                      icon="time-outline"
                      label={days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : formatDueDate(assignment.dueDate)}
                      tone={days <= 1 ? 'danger' : days <= 3 ? 'warning' : 'neutral'}
                    />
                  </View>
                </PressableCard>
              );
            })}
          </View>
        )}
      </Section>

      {/* Results */}
      <Section actionLabel="See all" onAction={() => router.push('/(student)/marks')} title="Latest results">
        {marksQuery.isLoading ? (
          <SkeletonCard lines={1} showFooter />
        ) : (
          <Card padding="lg">
            <Text tone="muted" variant="caption">
              {marks?.examType ?? 'No published exam yet'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 16, marginTop: 8 }}>
              <View style={{ flex: 1 }}>
                <Text variant="display">{marks?.resultSheet.overallPercentage ?? 0}%</Text>
                <Text style={{ marginTop: 2 }} tone="subtle" variant="caption">
                  Overall score
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: colors.primaryText }} tone="inherit" variant="display">
                  {marks?.resultSheet.overallGrade ?? '—'}
                </Text>
                <Text style={{ marginTop: 2 }} tone="subtle" variant="caption">
                  Grade
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
              <StatTile icon="school-outline" label="GPA" value={marks?.resultSheet.overallGpa ?? 0} />
              <StatTile icon="book-outline" label="Subjects" value={marks?.resultSheet.subjects.length ?? 0} />
            </View>
          </Card>
        )}
      </Section>
    </Screen>
  );
}
