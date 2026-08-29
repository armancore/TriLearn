import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconButton,
  InlineNotice,
  PressableCard,
  Screen,
  Section,
  SkeletonList,
  StatTile,
  Text,
} from '@/src/components/ui';
import { useAuth } from '@/src/hooks/useAuth';
import { api } from '@/src/services/api';
import { useTheme } from '@/src/theme/ThemeProvider';
import type { AssignmentsResponse, AssignmentSubmission } from '@/src/types/assignment';
import type { AttendanceBulkSummaryResponse } from '@/src/types/instructorOps';
import type { RoutinesResponse } from '@/src/types/routine';
import type { Subject, SubjectsResponse } from '@/src/types/subject';

type ReviewSubmission = AssignmentSubmission & {
  student?: {
    rollNumber?: string | null;
    user?: { name?: string | null } | null;
  } | null;
};

type AssignmentDetailResponse = {
  assignment: {
    id: string;
    title: string;
    subject?: { name: string; code: string } | null;
    submissions?: ReviewSubmission[];
  };
};

const DAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;

const classTypeLabel = (value?: string) => {
  if (value === 'WORKSHOP') return 'Workshop';
  if (value === 'TUTORIAL') return 'Tutorial';
  return 'Lecture';
};

const getTodayDate = () => new Date().toISOString().slice(0, 10);
const getTodayDayName = () => DAY_NAMES[new Date().getDay()];

const titleCase = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();

const getSubjects = async (): Promise<Subject[]> => {
  const response = await api.get<Subject[] | SubjectsResponse>('/subjects');
  return Array.isArray(response.data) ? response.data : response.data.subjects;
};

export default function InstructorDashboardScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const todayDate = getTodayDate();
  const todayDayName = getTodayDayName();

  const routineQuery = useQuery({
    queryKey: ['routines', 'instructor', todayDayName],
    queryFn: async () => (await api.get<RoutinesResponse>(`/routines?dayOfWeek=${todayDayName}`)).data,
  });

  const subjectsQuery = useQuery({
    queryKey: ['subjects', 'instructor', 'dashboard'],
    queryFn: getSubjects,
  });

  const assignmentsQuery = useQuery({
    queryKey: ['assignments', 'instructor', 'dashboard'],
    queryFn: async () => (await api.get<AssignmentsResponse>('/assignments?page=1&limit=5')).data,
  });

  const subjectIds = useMemo(
    () => (subjectsQuery.data ?? []).slice(0, 6).map((subject) => subject.id),
    [subjectsQuery.data],
  );
  const subjectIdsKey = subjectIds.join(',');

  const attendanceQuery = useQuery({
    queryKey: ['attendance-bulk', subjectIdsKey],
    enabled: subjectIds.length > 0,
    queryFn: async () => {
      const response = await api.get<AttendanceBulkSummaryResponse>(
        `/attendance/bulk-summary?subjectIds=${encodeURIComponent(subjectIdsKey)}&date=${todayDate}`,
      );

      return Object.values(response.data).reduce(
        (total, summary) => ({
          present: total.present + summary.present,
          absent: total.absent + summary.absent,
          late: total.late + summary.late,
          total: total.total + summary.total,
        }),
        { present: 0, absent: 0, late: 0, total: 0 },
      );
    },
  });

  const reviewQuery = useQuery({
    queryKey: [
      'assignments',
      'instructor',
      'pending-review',
      assignmentsQuery.data?.assignments.map((assignment) => assignment.id).join(','),
    ],
    enabled: Boolean(assignmentsQuery.data?.assignments.length),
    queryFn: async () => {
      const details = await Promise.all(
        (assignmentsQuery.data?.assignments ?? []).map(
          async (assignment) => (await api.get<AssignmentDetailResponse>(`/assignments/${assignment.id}`)).data,
        ),
      );

      return details.flatMap(({ assignment }) =>
        (assignment.submissions ?? [])
          .filter((submission) => submission.status === 'SUBMITTED' || submission.status === 'LATE')
          .map((submission) => ({ ...submission, assignment })),
      );
    },
  });

  const todayRoutines = useMemo(
    () =>
      [...(routineQuery.data?.routines ?? [])].sort((left, right) =>
        left.startTime.localeCompare(right.startTime),
      ),
    [routineQuery.data?.routines],
  );

  const attendance = attendanceQuery.data ?? { present: 0, absent: 0, late: 0, total: 0 };
  const pendingReviews = reviewQuery.data ?? [];

  const onRefresh = useCallback(
    async () =>
      Promise.all([
        routineQuery.refetch(),
        subjectsQuery.refetch(),
        assignmentsQuery.refetch(),
        attendanceQuery.refetch(),
        reviewQuery.refetch(),
      ]),
    [assignmentsQuery, attendanceQuery, reviewQuery, routineQuery, subjectsQuery],
  );

  return (
    <Screen
      header={{
        title: 'Home',
        showBack: false,
        actions: (
          <IconButton
            accessibilityLabel="Announcements and updates"
            icon="megaphone-outline"
            onPress={() => router.push('/(instructor)/updates')}
            variant="soft"
          />
        ),
      }}
      onRefresh={onRefresh}
    >
      <Card padding="lg" style={{ backgroundColor: colors.primary, borderColor: colors.primary }}>
        <Text style={{ color: 'rgba(255,255,255,0.82)' }} tone="inherit" variant="caption">
          Instructor dashboard
        </Text>
        <Text numberOfLines={1} style={{ color: '#FFFFFF', marginTop: 3 }} tone="inherit" variant="heading">
          {user?.name ?? 'Instructor'}
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.82)', marginTop: 8 }} tone="inherit" variant="caption">
          {todayRoutines.length} {todayRoutines.length === 1 ? 'class' : 'classes'} scheduled today ·{' '}
          {titleCase(todayDayName)}
        </Text>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
          <StatTile icon="checkmark-outline" label="Present" onPrimary value={attendance.present} />
          <StatTile icon="close-outline" label="Absent" onPrimary value={attendance.absent} />
          <StatTile icon="time-outline" label="Late" onPrimary value={attendance.late} />
        </View>
      </Card>

      {pendingReviews.length > 0 ? (
        <View style={{ marginTop: 14 }}>
          <InlineNotice
            description={`${pendingReviews.length} ${pendingReviews.length === 1 ? 'submission is' : 'submissions are'} waiting for a grade.`}
            title="Submissions to review"
            tone="info"
          />
        </View>
      ) : null}

      <Section description={titleCase(todayDayName)} title="Today's schedule">
        {routineQuery.isLoading ? (
          <SkeletonList count={2} />
        ) : routineQuery.isError ? (
          <ErrorState onRetry={() => void routineQuery.refetch()} title="Could not load your schedule" />
        ) : todayRoutines.length === 0 ? (
          <EmptyState
            description="Enjoy the quiet day — nothing is on your timetable."
            icon="cafe-outline"
            title="No classes today"
          />
        ) : (
          <View style={{ gap: 12 }}>
            {todayRoutines.map((routine) => (
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
                  <Badge label={`${routine.startTime}–${routine.endTime}`} tone="primary" />
                </View>

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                  <StatTile label="Type" value={classTypeLabel(routine.classType)} />
                  <StatTile
                    label="Group"
                    value={`Sem ${routine.semester}${routine.section ? ` · ${routine.section}` : ''}`}
                  />
                  <StatTile label="Room" value={routine.room || '—'} />
                </View>

                {routine.note ? (
                  <View style={{ marginTop: 14 }}>
                    <InlineNotice title={routine.note} tone="warning" />
                  </View>
                ) : null}

                {/*
                  Taking attendance is the daily job, so it is one tap from the
                  class rather than a tab plus a subject picker plus a date.
                */}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      accessibilityHint={`Opens the roster for ${routine.subject?.name ?? 'this class'}`}
                      accessibilityLabel={`Take attendance for ${routine.subject?.name ?? 'this class'}`}
                      icon="checkbox-outline"
                      label="Take attendance"
                      onPress={() =>
                        router.push({
                          pathname: '/(instructor)/attendance',
                          params: { subjectId: routine.subjectId },
                        })
                      }
                      size="sm"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      accessibilityHint={`Opens QR generation for ${routine.subject?.name ?? 'this class'}`}
                      accessibilityLabel={`Show QR for ${routine.subject?.name ?? 'this class'}`}
                      icon="qr-code-outline"
                      label="Class QR"
                      onPress={() =>
                        router.push({
                          pathname: '/(instructor)/qr',
                          params: { subjectId: routine.subjectId },
                        })
                      }
                      size="sm"
                      variant="secondary"
                    />
                  </View>
                </View>
              </Card>
            ))}
          </View>
        )}
      </Section>

      <Section description="Recorded across your subjects today" title="Attendance snapshot">
        {attendanceQuery.isLoading ? (
          <SkeletonList count={1} />
        ) : attendanceQuery.isError ? (
          <ErrorState onRetry={() => void attendanceQuery.refetch()} title="Could not load attendance" />
        ) : attendance.total === 0 ? (
          <EmptyState
            description="Take attendance from the Attendance tab to see today's totals."
            icon="clipboard-outline"
            title="Nothing recorded yet"
          />
        ) : (
          <Card padding="lg">
            <Text tone="muted" variant="caption">
              Total records today
            </Text>
            <Text style={{ marginTop: 4 }} variant="display">
              {attendance.total}
            </Text>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
              <StatTile label="Present" value={attendance.present} valueColor={colors.success} />
              <StatTile label="Absent" value={attendance.absent} valueColor={colors.danger} />
              <StatTile label="Late" value={attendance.late} valueColor={colors.warning} />
            </View>
          </Card>
        )}
      </Section>

      <Section description="Latest ungraded work" title="Pending submissions">
        {reviewQuery.isLoading ? (
          <SkeletonList count={2} />
        ) : pendingReviews.length === 0 ? (
          <EmptyState
            description="Everything submitted so far has been graded."
            icon="checkmark-done-outline"
            title="Nothing to review"
          />
        ) : (
          <View style={{ gap: 12 }}>
            {pendingReviews.slice(0, 5).map((submission) => (
              <PressableCard
                accessibilityHint="Opens marks entry"
                accessibilityLabel={`${submission.assignment.title}, submitted by ${submission.student?.user?.name ?? 'a student'}`}
                key={submission.id}
                onPress={() => router.push('/(instructor)/marks')}
              >
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={2} variant="subheading">
                      {submission.assignment.title}
                    </Text>
                    <Text style={{ marginTop: 3 }} tone="muted" variant="caption">
                      {submission.assignment.subject?.code ?? 'Assignment'}
                    </Text>
                  </View>
                  <Badge
                    label={submission.status}
                    tone={submission.status === 'LATE' ? 'warning' : 'info'}
                  />
                </View>
                <Text style={{ marginTop: 12 }} tone="subtle" variant="caption">
                  {submission.student?.user?.name ?? 'Student'}
                  {submission.student?.rollNumber ? ` · ${submission.student.rollNumber}` : ''} · submitted{' '}
                  {new Date(submission.submittedAt).toLocaleDateString()}
                </Text>
              </PressableCard>
            ))}
          </View>
        )}
      </Section>
    </Screen>
  );
}
