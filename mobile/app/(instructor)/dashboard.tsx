import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { COLORS } from '@/src/constants/colors';
import { useAuth } from '@/src/hooks/useAuth';
import { api } from '@/src/services/api';
import type { AssignmentsResponse, AssignmentSubmission } from '@/src/types/assignment';
import type { AttendanceBySubjectResponse } from '@/src/types/instructorOps';
import type { RoutinesResponse } from '@/src/types/routine';
import type { Subject, SubjectsResponse } from '@/src/types/subject';

type ReviewSubmission = AssignmentSubmission & {
  student?: {
    rollNumber?: string | null;
    user?: {
      name?: string | null;
    } | null;
  } | null;
};

type AssignmentDetailResponse = {
  assignment: {
    id: string;
    title: string;
    subject?: {
      name: string;
      code: string;
    } | null;
    submissions?: ReviewSubmission[];
  };
};

const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;

const getTodayDate = () => new Date().toISOString().slice(0, 10);
const getTodayDayName = () => dayNames[new Date().getDay()];

const getSubjects = async (): Promise<Subject[]> => {
  const response = await api.get<Subject[] | SubjectsResponse>('/subjects');

  return Array.isArray(response.data) ? response.data : response.data.subjects;
};

const StatCard = ({ label, value }: { label: string; value: string | number }) => (
  <View className="flex-1 rounded-2xl bg-white p-4">
    <Text className="text-xs font-semibold uppercase text-slate-500">{label}</Text>
    <Text className="mt-2 text-2xl font-bold text-slate-900">{value}</Text>
  </View>
);

const SectionHeader = ({ title, subtitle }: { title: string; subtitle?: string }) => (
  <View className="mb-3 mt-6">
    <Text className="text-lg font-bold text-slate-900">{title}</Text>
    {subtitle ? <Text className="mt-1 text-sm text-slate-500">{subtitle}</Text> : null}
  </View>
);

const EmptyPanel = ({ text }: { text: string }) => (
  <View className="rounded-2xl bg-white p-5">
    <Text className="text-center text-sm font-semibold text-slate-500">{text}</Text>
  </View>
);

export default function InstructorDashboardScreen() {
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
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

  const attendanceQuery = useQuery({
    queryKey: ['attendance', 'instructor', 'dashboard', todayDate, subjectsQuery.data?.map((subject) => subject.id).join(',')],
    enabled: Boolean(subjectsQuery.data?.length),
    queryFn: async () => {
      const subjects = subjectsQuery.data ?? [];
      const summaries = await Promise.all(
        subjects.slice(0, 6).map(async (subject) => {
          const response = await api.get<AttendanceBySubjectResponse>(
            `/attendance/subject/${subject.id}?date=${todayDate}&limit=1`,
          );

          return response.data.summary;
        }),
      );

      return summaries.reduce(
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
    queryKey: ['assignments', 'instructor', 'pending-review', assignmentsQuery.data?.assignments.map((assignment) => assignment.id).join(',')],
    enabled: Boolean(assignmentsQuery.data?.assignments.length),
    queryFn: async () => {
      const details = await Promise.all(
        (assignmentsQuery.data?.assignments ?? []).map(async (assignment) => (
          await api.get<AssignmentDetailResponse>(`/assignments/${assignment.id}`)
        ).data),
      );

      return details.flatMap(({ assignment }) => (
        (assignment.submissions ?? [])
          .filter((submission) => submission.status === 'SUBMITTED' || submission.status === 'LATE')
          .map((submission) => ({ ...submission, assignment }))
      ));
    },
  });

  const todayRoutines = useMemo(
    () => [...(routineQuery.data?.routines ?? [])].sort((left, right) => left.startTime.localeCompare(right.startTime)),
    [routineQuery.data?.routines],
  );
  const attendance = attendanceQuery.data ?? { present: 0, absent: 0, late: 0, total: 0 };
  const pendingReviews = reviewQuery.data ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        routineQuery.refetch(),
        subjectsQuery.refetch(),
        assignmentsQuery.refetch(),
        attendanceQuery.refetch(),
        reviewQuery.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [assignmentsQuery, attendanceQuery, reviewQuery, routineQuery, subjectsQuery]);

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      contentContainerStyle={{ padding: 24, paddingBottom: 32 }}
      refreshControl={<RefreshControl colors={[COLORS.primary]} refreshing={refreshing} tintColor={COLORS.primary} onRefresh={onRefresh} />}
    >
      <View className="rounded-3xl bg-primary p-5">
        <Text className="text-sm font-semibold text-blue-100">Instructor dashboard</Text>
        <Text className="mt-2 text-2xl font-bold text-white">{user?.name ?? 'Instructor'}</Text>
        <Text className="mt-2 text-sm text-blue-100">{todayRoutines.length} class{todayRoutines.length === 1 ? '' : 'es'} scheduled today</Text>
      </View>

      <View className="mt-4 flex-row gap-3">
        <StatCard label="Present today" value={attendance.present} />
        <StatCard label="Pending review" value={pendingReviews.length} />
      </View>

      <View className="mt-3 flex-row gap-3">
        <StatCard label="Absent today" value={attendance.absent} />
        <StatCard label="Late today" value={attendance.late} />
      </View>

      <SectionHeader title="Today's Schedule" subtitle={todayDayName.toLowerCase()} />
      {routineQuery.isLoading ? (
        <EmptyPanel text="Loading schedule..." />
      ) : todayRoutines.length === 0 ? (
        <EmptyPanel text="No classes scheduled today" />
      ) : (
        <View className="gap-3">
          {todayRoutines.map((routine) => (
            <View className="rounded-2xl bg-white p-5" key={routine.id}>
              <View className="flex-row items-start justify-between gap-4">
                <View className="flex-1">
                  <Text className="text-base font-bold text-slate-900">{routine.subject?.name ?? 'Subject'}</Text>
                  <Text className="mt-1 text-sm font-semibold text-primary">{routine.subject?.code ?? 'N/A'}</Text>
                </View>
                <View className="rounded-full bg-slate-100 px-3 py-1">
                  <Text className="text-xs font-bold text-slate-600">{routine.startTime}-{routine.endTime}</Text>
                </View>
              </View>
              <Text className="mt-3 text-sm text-slate-500">
                Semester {routine.semester}{routine.section ? `, Section ${routine.section}` : ''}{routine.room ? `, Room ${routine.room}` : ''}
              </Text>
            </View>
          ))}
        </View>
      )}

      <SectionHeader title="Attendance Snapshot" subtitle="Recorded across assigned subjects today" />
      {attendanceQuery.isLoading ? (
        <EmptyPanel text="Loading attendance..." />
      ) : attendance.total === 0 ? (
        <EmptyPanel text="No attendance recorded yet today" />
      ) : (
        <View className="rounded-2xl bg-white p-5">
          <Text className="text-sm font-semibold text-slate-500">Total records</Text>
          <Text className="mt-2 text-3xl font-bold text-slate-900">{attendance.total}</Text>
          <View className="mt-4 flex-row justify-between">
            <Text className="font-bold text-green-700">Present {attendance.present}</Text>
            <Text className="font-bold text-red-700">Absent {attendance.absent}</Text>
            <Text className="font-bold text-amber-700">Late {attendance.late}</Text>
          </View>
        </View>
      )}

      <SectionHeader title="Pending Submissions" subtitle="Latest ungraded submissions" />
      {reviewQuery.isLoading ? (
        <EmptyPanel text="Loading submissions..." />
      ) : pendingReviews.length === 0 ? (
        <EmptyPanel text="No submissions waiting for review" />
      ) : (
        <View className="gap-3">
          {pendingReviews.slice(0, 5).map((submission) => (
            <Pressable className="rounded-2xl bg-white p-5" key={submission.id}>
              <Text className="text-base font-bold text-slate-900">{submission.assignment.title}</Text>
              <Text className="mt-1 text-sm font-semibold text-primary">
                {submission.assignment.subject?.code ?? 'Assignment'}
              </Text>
              <Text className="mt-3 text-sm text-slate-500">
                {submission.student?.user?.name ?? 'Student'} submitted {new Date(submission.submittedAt).toLocaleDateString()}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
