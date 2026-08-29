import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { Linking, View } from 'react-native';

import {
  Badge,
  Button,
  EmptyState,
  FilterChips,
  PressableCard,
  Screen,
  Sheet,
  SkeletonList,
  StatTile,
  Text,
  type BadgeTone,
} from '@/src/components/ui';
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

const FILTERS: AssignmentFilter[] = ['ALL', 'PENDING', 'SUBMITTED', 'GRADED'];

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));

const getSubmission = (assignment: Assignment, submissionMap: Map<string, AssignmentSubmission>) =>
  assignment.submission ?? assignment.submissions?.[0] ?? submissionMap.get(assignment.id) ?? null;

const isOverdue = (assignment: Assignment) => new Date(assignment.dueDate).getTime() < Date.now();

type Status = { label: string; tone: BadgeTone; icon: 'checkmark-circle' | 'cloud-upload' | 'alert-circle' | 'time-outline' };

const getStatus = (assignment: Assignment, submission: AssignmentSubmission | null): Status => {
  if (submission?.status === 'GRADED') return { label: 'Graded', tone: 'info', icon: 'checkmark-circle' };
  if (submission) return { label: 'Submitted', tone: 'success', icon: 'cloud-upload' };
  if (isOverdue(assignment)) return { label: 'Overdue', tone: 'danger', icon: 'alert-circle' };
  return { label: 'Pending', tone: 'warning', icon: 'time-outline' };
};

export default function StudentAssignmentsScreen() {
  const { isAuthenticated } = useAuth();
  const [activeFilter, setActiveFilter] = useState<AssignmentFilter>('ALL');
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);

  const assignmentsQuery = useQuery({
    queryKey: ['assignments', 'student', 'all'],
    queryFn: async () => (await api.get<AssignmentsResponse>('/assignments?page=1&limit=50')).data,
    enabled: isAuthenticated,
  });

  const submissionsQuery = useQuery({
    queryKey: ['assignments', 'student', 'submissions'],
    queryFn: async () => (await api.get<MySubmissionsResponse>('/assignments/my-submissions')).data,
    enabled: isAuthenticated,
  });

  const submissionMap = useMemo(
    () =>
      new Map(
        (submissionsQuery.data?.submissions ?? []).map((submission) => [submission.assignmentId, submission]),
      ),
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
  const isLoading = assignmentsQuery.isLoading || submissionsQuery.isLoading;

  const onRefresh = useCallback(
    async () => Promise.all([assignmentsQuery.refetch(), submissionsQuery.refetch()]),
    [assignmentsQuery, submissionsQuery],
  );

  const openWebAssignments = useCallback(async () => {
    await Linking.openURL(`${WEB_APP_URL.replace(/\/$/, '')}/student/assignments`);
  }, []);

  return (
    <>
      <Screen
        header={{
          title: 'Assignments',
          subtitle: 'Coursework, submission state and deadlines.',
          showBack: false,
        }}
        onRefresh={onRefresh}
      >
        <FilterChips label="Assignment status" onChange={setActiveFilter} options={FILTERS} value={activeFilter} />

        <View
          accessibilityLiveRegion="polite"
          style={{ marginTop: 14, gap: 14 }}
        >
          {isLoading ? (
            <SkeletonList count={3} />
          ) : assignments.length === 0 ? (
            <EmptyState
              description="Nothing matches this filter right now."
              icon="document-text-outline"
              title="No assignments"
            />
          ) : (
            assignments.map((assignment) => {
              const submission = getSubmission(assignment, submissionMap);
              const status = getStatus(assignment, submission);

              return (
                <PressableCard
                  accessibilityHint="Opens the assignment details"
                  accessibilityLabel={`${assignment.title}, ${status.label}, due ${formatDate(assignment.dueDate)}`}
                  key={assignment.id}
                  onPress={() => setSelectedAssignment(assignment)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={2} variant="subheading">
                        {assignment.title}
                      </Text>
                      <Text numberOfLines={1} style={{ marginTop: 3 }} tone="muted" variant="caption">
                        {assignment.subject?.name ?? 'Subject'}
                        {assignment.subject?.code ? ` · ${assignment.subject.code}` : ''}
                      </Text>
                    </View>
                    <Badge icon={status.icon} label={status.label} tone={status.tone} />
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                    <StatTile icon="calendar-outline" label="Due" value={formatDate(assignment.dueDate)} />
                    <StatTile icon="school-outline" label="Total marks" value={assignment.totalMarks} />
                  </View>
                </PressableCard>
              );
            })
          )}
        </View>
      </Screen>

      <Sheet
        footer={
          <Button
            accessibilityHint="Opens the TriLearn web app in your browser to upload a file"
            icon="open-outline"
            label="Submit on the web app"
            onPress={() => void openWebAssignments()}
          />
        }
        onClose={() => setSelectedAssignment(null)}
        subtitle={
          selectedAssignment
            ? `${selectedAssignment.subject?.name ?? 'Subject'}${selectedAssignment.subject?.code ? ` · ${selectedAssignment.subject.code}` : ''}`
            : undefined
        }
        title={selectedAssignment?.title ?? ''}
        visible={Boolean(selectedAssignment)}
      >
        {selectedAssignment ? (
          <>
            <Text tone="muted">{selectedAssignment.description || 'No description provided.'}</Text>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <StatTile icon="calendar-outline" label="Due date" value={formatDate(selectedAssignment.dueDate)} />
              <StatTile icon="school-outline" label="Total marks" value={selectedAssignment.totalMarks} />
            </View>

            {selectedSubmission ? (
              <View style={{ marginTop: 16 }}>
                <Text style={{ marginBottom: 8 }} tone="muted" uppercase variant="label">
                  Your submission
                </Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <StatTile label="Status" value={selectedSubmission.status} />
                  <StatTile
                    label="Marks"
                    value={
                      selectedSubmission.status === 'GRADED' && selectedSubmission.obtainedMarks != null
                        ? `${selectedSubmission.obtainedMarks}/${selectedAssignment.totalMarks}`
                        : '—'
                    }
                  />
                </View>
                {selectedSubmission.feedback ? (
                  <Text style={{ marginTop: 12 }} tone="muted" variant="caption">
                    Feedback: {selectedSubmission.feedback}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </>
        ) : null}
      </Sheet>
    </>
  );
}
