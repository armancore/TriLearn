import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { Linking, Modal, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { COLORS } from '@/src/constants/colors';
import { WEB_APP_URL } from '@/src/constants/config';
import { useAuth } from '@/src/hooks/useAuth';
import { api } from '@/src/services/api';
import type {
  Assignment,
  AssignmentFilter,
  AssignmentSubmission,
  AssignmentsResponse,
  MySubmissionsResponse,
} from '@/src/types/assignment';

const filters: AssignmentFilter[] = ['ALL', 'PENDING', 'SUBMITTED', 'GRADED'];

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));

const getSubmission = (assignment: Assignment, submissionMap: Map<string, AssignmentSubmission>) =>
  assignment.submission ?? assignment.submissions?.[0] ?? submissionMap.get(assignment.id) ?? null;

const isOverdue = (assignment: Assignment) => new Date(assignment.dueDate).getTime() < Date.now();

const getAssignmentStatus = (assignment: Assignment, submission: AssignmentSubmission | null) => {
  if (submission?.status === 'GRADED') return { label: 'GRADED', bg: '#DBEAFE', text: '#1D4ED8' };
  if (submission) return { label: submission.status, bg: '#DCFCE7', text: '#166534' };
  if (isOverdue(assignment)) return { label: 'OVERDUE', bg: '#FEE2E2', text: '#B91C1C' };
  return { label: 'PENDING', bg: '#FEF3C7', text: '#92400E' };
};

const AssignmentSkeleton = () => (
  <View className="rounded-2xl bg-white p-5">
    <View className="h-5 w-2/3 rounded-full bg-slate-200" />
    <View className="mt-3 h-4 w-1/2 rounded-full bg-slate-100" />
    <View className="mt-5 h-4 w-24 rounded-full bg-slate-100" />
  </View>
);

export default function StudentAssignmentsScreen() {
  const { isAuthenticated } = useAuth();
  const [activeFilter, setActiveFilter] = useState<AssignmentFilter>('ALL');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);

  const assignmentsQuery = useQuery({
    queryKey: ['assignments', 'student', 'all'],
    queryFn: async () => {
      const response = await api.get<AssignmentsResponse>('/assignments?page=1&limit=50');
      return response.data;
    },
    enabled: isAuthenticated,
  });

  const submissionsQuery = useQuery({
    queryKey: ['assignments', 'student', 'submissions'],
    queryFn: async () => {
      const response = await api.get<MySubmissionsResponse>('/assignments/my-submissions');
      return response.data;
    },
    enabled: isAuthenticated,
  });

  const submissionMap = useMemo(
    () => new Map((submissionsQuery.data?.submissions ?? []).map((submission) => [submission.assignmentId, submission])),
    [submissionsQuery.data?.submissions],
  );

  const assignments = useMemo(
    () =>
      (assignmentsQuery.data?.assignments ?? [])
        .filter((assignment) => {
          const submission = getSubmission(assignment, submissionMap);
          if (activeFilter === 'PENDING') return !submission;
          if (activeFilter === 'SUBMITTED') return submission && submission.status !== 'GRADED';
          if (activeFilter === 'GRADED') return submission?.status === 'GRADED';
          return true;
        })
        .sort((left, right) => new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime()),
    [activeFilter, assignmentsQuery.data?.assignments, submissionMap],
  );

  const selectedSubmission = selectedAssignment ? getSubmission(selectedAssignment, submissionMap) : null;

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([assignmentsQuery.refetch(), submissionsQuery.refetch()]);
    } finally {
      setIsRefreshing(false);
    }
  }, [assignmentsQuery, submissionsQuery]);

  const openWebAssignments = useCallback(async () => {
    await Linking.openURL(`${WEB_APP_URL.replace(/\/$/, '')}/student/assignments`);
  }, []);

  return (
    <View className="flex-1 bg-slate-50">
      <ScrollView
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
        <Text className="text-2xl font-bold text-primary">Assignments</Text>
        <Text className="mt-2 text-sm text-slate-600">Track coursework, submission state, and deadlines.</Text>

        <ScrollView className="mt-5" horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-2">
            {filters.map((filter) => {
              const active = activeFilter === filter;
              return (
                <Pressable
                  className={`rounded-full px-4 py-2 ${active ? 'bg-primary' : 'bg-white'}`}
                  key={filter}
                  onPress={() => setActiveFilter(filter)}
                >
                  <Text className={`text-xs font-bold ${active ? 'text-white' : 'text-slate-600'}`}>{filter}</Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        <View className="mt-6 gap-4">
          {assignmentsQuery.isLoading || submissionsQuery.isLoading ? (
            <>
              <AssignmentSkeleton />
              <AssignmentSkeleton />
              <AssignmentSkeleton />
            </>
          ) : assignments.length === 0 ? (
            <View className="items-center rounded-2xl bg-white px-5 py-10">
              <Text className="text-lg font-bold text-slate-900">No assignments found</Text>
              <Text className="mt-2 text-center text-sm text-slate-500">Assignments matching this filter will appear here.</Text>
            </View>
          ) : (
            assignments.map((assignment) => {
              const submission = getSubmission(assignment, submissionMap);
              const status = getAssignmentStatus(assignment, submission);

              return (
                <Pressable
                  className="rounded-2xl bg-white p-5 active:opacity-80"
                  key={assignment.id}
                  onPress={() => setSelectedAssignment(assignment)}
                >
                  <View className="flex-row items-start justify-between gap-4">
                    <View className="flex-1">
                      <Text className="text-lg font-bold text-slate-900">{assignment.title}</Text>
                      <Text className="mt-1 text-sm font-medium text-slate-500">
                        {assignment.subject?.name ?? 'Subject'} {assignment.subject?.code ? `(${assignment.subject.code})` : ''}
                      </Text>
                    </View>
                    <View className="rounded-full px-3 py-1" style={{ backgroundColor: status.bg }}>
                      <Text className="text-xs font-bold" style={{ color: status.text }}>
                        {status.label}
                      </Text>
                    </View>
                  </View>
                  <Text className="mt-4 text-sm font-semibold text-primary">Due {formatDate(assignment.dueDate)}</Text>
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>

      <Modal animationType="slide" transparent visible={Boolean(selectedAssignment)} onRequestClose={() => setSelectedAssignment(null)}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setSelectedAssignment(null)}>
          <Pressable className="rounded-t-3xl bg-white p-6" onPress={(event) => event.stopPropagation()}>
            {selectedAssignment ? (
              <>
                <View className="h-1 w-12 self-center rounded-full bg-slate-200" />
                <Text className="mt-6 text-2xl font-bold text-slate-900">{selectedAssignment.title}</Text>
                <Text className="mt-2 text-sm font-medium text-slate-500">
                  {selectedAssignment.subject?.name ?? 'Subject'} {selectedAssignment.subject?.code ? `(${selectedAssignment.subject.code})` : ''}
                </Text>
                <Text className="mt-5 text-sm leading-6 text-slate-600">
                  {selectedAssignment.description || 'No description provided.'}
                </Text>
                <View className="mt-5 flex-row gap-3">
                  <View className="flex-1 rounded-xl bg-slate-100 p-3">
                    <Text className="text-xs font-medium text-slate-500">Due date</Text>
                    <Text className="mt-1 text-sm font-bold text-slate-900">{formatDate(selectedAssignment.dueDate)}</Text>
                  </View>
                  <View className="flex-1 rounded-xl bg-slate-100 p-3">
                    <Text className="text-xs font-medium text-slate-500">Total marks</Text>
                    <Text className="mt-1 text-sm font-bold text-slate-900">{selectedAssignment.totalMarks}</Text>
                  </View>
                </View>
                {selectedSubmission ? (
                  <View className="mt-4 rounded-xl bg-slate-100 p-4">
                    <Text className="text-xs font-medium text-slate-500">Your submission</Text>
                    <Text className="mt-1 text-base font-bold text-slate-900">{selectedSubmission.status}</Text>
                    {selectedSubmission.status === 'GRADED' && selectedSubmission.obtainedMarks !== undefined && selectedSubmission.obtainedMarks !== null ? (
                      <Text className="mt-1 text-sm text-slate-600">
                        Marks: {selectedSubmission.obtainedMarks}/{selectedAssignment.totalMarks}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
                <Pressable className="mt-5 rounded-xl bg-primary px-5 py-4" onPress={() => void openWebAssignments()}>
                  <Text className="text-center font-bold text-white">Submit on web</Text>
                </Pressable>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
