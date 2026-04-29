import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { COLORS } from '@/src/constants/colors';
import { useAuth } from '@/src/hooks/useAuth';
import { api } from '@/src/services/api';
import type { AttendanceSummaryResponse } from '@/src/types/attendance';

interface Assignment {
  id: string;
  title: string;
  description?: string | null;
  dueDate: string;
  totalMarks: number;
  subject?: {
    name: string;
    code: string;
  } | null;
  submissions?: unknown[];
  submission?: unknown | null;
}

interface AssignmentsResponse {
  assignments: Assignment[];
}

interface MarksSubject {
  id: string;
  subjectName: string;
  subjectCode: string;
  percentage: number;
  grade: string;
}

interface MarksSummaryResponse {
  examType: string | null;
  resultSheet: {
    subjects: MarksSubject[];
    totals: {
      obtainedMarks: number;
      totalMarks: number;
    };
    overallPercentage: number;
    overallGrade: string;
    overallGpa: number;
  };
  ranking: {
    rank: number | null;
    cohortSize: number;
    percentile: number;
  };
}

const parseAttendancePercentage = (percentage: string) => {
  const value = parseFloat(percentage);
  return Number.isNaN(value) ? 0 : value;
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(value));

const SectionSkeleton = ({ rows = 3 }: { rows?: number }) => (
  <View className="gap-3">
    {Array.from({ length: rows }).map((_, index) => (
      <View className="rounded-2xl bg-white p-5" key={index}>
        <View className="h-4 w-2/3 rounded-full bg-slate-200" />
        <View className="mt-3 h-3 w-full rounded-full bg-slate-100" />
        <View className="mt-2 h-3 w-1/2 rounded-full bg-slate-100" />
      </View>
    ))}
  </View>
);

const SectionHeader = ({ title, action }: { title: string; action?: string }) => (
  <View className="mb-3 flex-row items-center justify-between">
    <Text className="text-lg font-bold text-slate-900">{title}</Text>
    {action ? <Text className="text-sm font-bold text-primary">{action}</Text> : null}
  </View>
);

const QuickNavButton = ({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) => (
  <Pressable className="flex-1 rounded-2xl bg-white p-4 active:opacity-80" onPress={onPress}>
    <View className="h-10 w-10 items-center justify-center rounded-full bg-slate-100">
      <Ionicons color={COLORS.primary} name={icon} size={20} />
    </View>
    <Text className="mt-3 text-sm font-bold text-slate-900">{label}</Text>
  </Pressable>
);

export default function StudentDashboardScreen() {
  const { isAuthenticated, user } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const attendanceQuery = useQuery({
    queryKey: ['attendance', 'my'],
    queryFn: async () => {
      const response = await api.get<AttendanceSummaryResponse>('/attendance/my');
      return response.data;
    },
    enabled: isAuthenticated,
  });

  const assignmentsQuery = useQuery({
    queryKey: ['assignments', 'student', 'dashboard'],
    queryFn: async () => {
      const response = await api.get<AssignmentsResponse>('/assignments?page=1&limit=3');
      return response.data;
    },
    enabled: isAuthenticated,
  });

  const marksQuery = useQuery({
    queryKey: ['marks', 'my', 'summary'],
    queryFn: async () => {
      const response = await api.get<MarksSummaryResponse>('/marks/my/summary');
      return response.data;
    },
    enabled: isAuthenticated,
  });

  const overallAttendance = useMemo(() => {
    const summary = attendanceQuery.data?.summary ?? [];
    if (summary.length === 0) return 0;

    const total = summary.reduce((sum, item) => sum + parseAttendancePercentage(item.percentage), 0);
    return Number((total / summary.length).toFixed(1));
  }, [attendanceQuery.data?.summary]);

  const upcomingAssignments = useMemo(() => {
    const now = Date.now();
    return (assignmentsQuery.data?.assignments ?? [])
      .filter((assignment) => !assignment.submission && !assignment.submissions?.length)
      .filter((assignment) => new Date(assignment.dueDate).getTime() >= now)
      .sort((left, right) => new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime())
      .slice(0, 3);
  }, [assignmentsQuery.data?.assignments]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([attendanceQuery.refetch(), assignmentsQuery.refetch(), marksQuery.refetch()]);
    } finally {
      setIsRefreshing(false);
    }
  }, [attendanceQuery, assignmentsQuery, marksQuery]);

  const student = user?.student;
  const marks = marksQuery.data;

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
      <View className="mb-4 flex-row items-center justify-between">
        <Text className="text-2xl font-bold text-primary">Dashboard</Text>
        <Pressable
          accessibilityLabel="Scan attendance QR"
          className="h-11 w-11 items-center justify-center rounded-full bg-primary active:opacity-80"
          onPress={() => router.push('/(student)/scanner')}
        >
          <Ionicons color="#FFFFFF" name="qr-code-outline" size={22} />
        </Pressable>
      </View>

      <View className="rounded-2xl bg-white p-5">
        <View className="flex-row items-start justify-between gap-4">
          <View className="flex-1">
            <Text className="text-sm font-semibold text-slate-500">Welcome back</Text>
            <Text className="mt-1 text-2xl font-bold text-primary">{user?.name ?? 'Student'}</Text>
          </View>
          <View className="rounded-full bg-primary px-3 py-1">
            <Text className="text-xs font-bold text-white">{user?.role ?? 'STUDENT'}</Text>
          </View>
        </View>
        <View className="mt-5 flex-row gap-3">
          <View className="flex-1 rounded-xl bg-slate-100 p-3">
            <Text className="text-xs font-medium text-slate-500">Department</Text>
            <Text className="mt-1 text-sm font-bold text-slate-900">{student?.department || '-'}</Text>
          </View>
          <View className="flex-1 rounded-xl bg-slate-100 p-3">
            <Text className="text-xs font-medium text-slate-500">Semester</Text>
            <Text className="mt-1 text-sm font-bold text-slate-900">{student?.semester ? `Sem ${student.semester}` : '-'}</Text>
          </View>
        </View>
      </View>

      <View className="mt-4 flex-row gap-3">
        <QuickNavButton icon="calendar-outline" label="Attendance" onPress={() => router.push('/(student)/attendance')} />
        <QuickNavButton icon="document-text-outline" label="Assignments" onPress={() => router.push('/(student)/assignments')} />
      </View>

      <View className="mt-3 flex-row gap-3">
        <QuickNavButton icon="ribbon-outline" label="Marks" onPress={() => router.push('/(student)/marks')} />
        <QuickNavButton icon="folder-outline" label="Materials" onPress={() => router.push('/(student)/materials')} />
      </View>

      <View className="mt-6">
        <SectionHeader title="Attendance" />
        {attendanceQuery.isLoading ? (
          <SectionSkeleton rows={1} />
        ) : (
          <View className="rounded-2xl bg-primary p-5">
            <Text className="text-sm font-semibold text-blue-100">Overall attendance</Text>
            <Text className="mt-3 text-5xl font-bold text-white">{overallAttendance}%</Text>
            <Text className="mt-2 text-sm text-blue-100">
              Average across {attendanceQuery.data?.summary.length ?? 0} enrolled subjects
            </Text>
            <View className="mt-5 h-3 overflow-hidden rounded-full bg-white/20">
              <View className="h-full rounded-full bg-white" style={{ width: `${Math.max(0, Math.min(100, overallAttendance))}%` }} />
            </View>
          </View>
        )}
      </View>

      <View className="mt-6">
        <SectionHeader title="Upcoming Assignments" action="Next 3" />
        {assignmentsQuery.isLoading ? (
          <SectionSkeleton />
        ) : upcomingAssignments.length === 0 ? (
          <View className="rounded-2xl bg-white p-5">
            <Text className="text-base font-bold text-slate-900">No pending assignments</Text>
            <Text className="mt-2 text-sm text-slate-500">Submitted work and past due items are cleared from this list.</Text>
          </View>
        ) : (
          <View className="gap-3">
            {upcomingAssignments.map((assignment) => (
              <View className="rounded-2xl bg-white p-5" key={assignment.id}>
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-base font-bold text-slate-900">{assignment.title}</Text>
                    <Text className="mt-1 text-sm text-slate-500">
                      {assignment.subject?.name ?? 'Subject'} {assignment.subject?.code ? `(${assignment.subject.code})` : ''}
                    </Text>
                  </View>
                  <Text className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
                    {formatDate(assignment.dueDate)}
                  </Text>
                </View>
                <Text className="mt-3 text-sm font-semibold text-slate-600">{assignment.totalMarks} marks</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View className="mt-6">
        <SectionHeader title="Latest Marks" />
        {marksQuery.isLoading ? (
          <SectionSkeleton rows={1} />
        ) : (
          <View className="rounded-2xl bg-white p-5">
            <View className="flex-row items-start justify-between">
              <View>
                <Text className="text-sm font-semibold text-slate-500">{marks?.examType ?? 'No published exam'}</Text>
                <Text className="mt-2 text-3xl font-bold text-slate-900">{marks?.resultSheet.overallPercentage ?? 0}%</Text>
              </View>
              <View className="items-end">
                <Text className="text-sm font-semibold text-slate-500">Grade</Text>
                <Text className="mt-2 text-3xl font-bold text-primary">{marks?.resultSheet.overallGrade ?? '-'}</Text>
              </View>
            </View>
            <View className="mt-5 flex-row gap-3">
              <View className="flex-1 rounded-xl bg-slate-100 p-3">
                <Text className="text-xs font-medium text-slate-500">GPA</Text>
                <Text className="mt-1 text-base font-bold text-slate-900">{marks?.resultSheet.overallGpa ?? 0}</Text>
              </View>
              <View className="flex-1 rounded-xl bg-slate-100 p-3">
                <Text className="text-xs font-medium text-slate-500">Rank</Text>
                <Text className="mt-1 text-base font-bold text-slate-900">
                  {marks?.ranking.rank ? `#${marks.ranking.rank}` : '-'}
                </Text>
              </View>
              <View className="flex-1 rounded-xl bg-slate-100 p-3">
                <Text className="text-xs font-medium text-slate-500">Subjects</Text>
                <Text className="mt-1 text-base font-bold text-slate-900">{marks?.resultSheet.subjects.length ?? 0}</Text>
              </View>
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
