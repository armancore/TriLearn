import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';

import {
  Badge,
  EmptyState,
  ErrorState,
  PressableCard,
  Screen,
  Sheet,
  SkeletonList,
  StatTile,
  Text,
} from '@/src/components/ui';
import { api } from '@/src/services/api';
import type { Subject, SubjectsResponse } from '@/src/types/subject';

const getSubjects = async (): Promise<Subject[]> => {
  const response = await api.get<Subject[] | SubjectsResponse>('/subjects');
  return Array.isArray(response.data) ? response.data : response.data.subjects;
};

const getEnrolledStudentCount = (subject: Subject): number =>
  typeof subject.enrolledStudentsCount === 'number'
    ? subject.enrolledStudentsCount
    : (subject.enrolledStudents?.length ?? 0);

const getUpcomingAssignmentCount = (subject: Subject): number =>
  subject.upcomingAssignmentCount ?? subject.upcomingAssignmentsCount ?? 0;

export default function InstructorCoursesScreen() {
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);

  const {
    data: subjects = [],
    isError,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['subjects', 'instructor'],
    queryFn: getSubjects,
  });

  const selectedStats = useMemo(() => {
    if (!selectedSubject) {
      return null;
    }

    return {
      enrolledStudents: getEnrolledStudentCount(selectedSubject),
      upcomingAssignments: getUpcomingAssignmentCount(selectedSubject),
    };
  }, [selectedSubject]);

  const onRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return (
    <>
      <Screen
        header={{ title: 'Courses', subtitle: 'Subjects assigned to your profile.', showBack: false }}
        onRefresh={onRefresh}
      >
        <View style={{ gap: 14 }}>
          {isLoading ? (
            <SkeletonList count={3} />
          ) : isError ? (
            <ErrorState onRetry={() => void refetch()} title="Could not load courses" />
          ) : subjects.length === 0 ? (
            <EmptyState
              description="Subjects assigned to your instructor profile will appear here."
              icon="book-outline"
              title="No courses assigned"
            />
          ) : (
            subjects.map((subject) => (
              <PressableCard
                accessibilityHint="Opens course details"
                accessibilityLabel={`${subject.name}, ${subject.code}, semester ${subject.semester}`}
                key={subject.id}
                onPress={() => setSelectedSubject(subject)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={2} variant="subheading">
                      {subject.name}
                    </Text>
                    <Text style={{ marginTop: 3 }} tone="muted" variant="caption">
                      {subject.code} · {subject.department}
                    </Text>
                  </View>
                  <Badge label={`Sem ${subject.semester}`} tone="primary" />
                </View>

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                  <StatTile icon="people-outline" label="Students" value={getEnrolledStudentCount(subject)} />
                  <StatTile
                    icon="document-text-outline"
                    label="Upcoming work"
                    value={getUpcomingAssignmentCount(subject)}
                  />
                </View>
              </PressableCard>
            ))
          )}
        </View>
      </Screen>

      <Sheet
        onClose={() => setSelectedSubject(null)}
        subtitle={
          selectedSubject
            ? `${selectedSubject.code} · ${selectedSubject.department} · Semester ${selectedSubject.semester}`
            : undefined
        }
        title={selectedSubject?.name ?? ''}
        visible={selectedSubject !== null}
      >
        {selectedStats ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <StatTile icon="people-outline" label="Enrolled students" value={selectedStats.enrolledStudents} />
            <StatTile
              icon="document-text-outline"
              label="Upcoming assignments"
              value={selectedStats.upcomingAssignments}
            />
          </View>
        ) : null}
      </Sheet>
    </>
  );
}
