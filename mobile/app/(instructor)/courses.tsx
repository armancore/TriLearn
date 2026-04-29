import { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { COLORS } from '@/src/constants/colors';
import { api } from '@/src/services/api';
import type { Subject, SubjectsResponse } from '@/src/types/subject';

const getSubjects = async (): Promise<Subject[]> => {
  const response = await api.get<Subject[] | SubjectsResponse>('/subjects');

  if (Array.isArray(response.data)) {
    return response.data;
  }

  return response.data.subjects;
};

const getEnrolledStudentCount = (subject: Subject): number => {
  if (typeof subject.enrolledStudentsCount === 'number') {
    return subject.enrolledStudentsCount;
  }

  return subject.enrolledStudents?.length ?? 0;
};

const getUpcomingAssignmentCount = (subject: Subject): number =>
  subject.upcomingAssignmentCount ?? subject.upcomingAssignmentsCount ?? 0;

const CourseSkeleton = () => (
  <View className="rounded-2xl bg-white p-5">
    <View className="h-5 w-2/3 rounded-full bg-slate-200" />
    <View className="mt-3 h-4 w-24 rounded-full bg-slate-100" />
    <View className="mt-5 flex-row gap-2">
      <View className="h-9 flex-1 rounded-lg bg-slate-100" />
      <View className="h-9 flex-1 rounded-lg bg-slate-100" />
    </View>
  </View>
);

const EmptyState = () => (
  <View className="items-center rounded-2xl bg-white px-5 py-10">
    <Text className="text-lg font-bold text-slate-900">No courses assigned</Text>
    <Text className="mt-2 text-center text-sm text-slate-500">
      Subjects assigned to your instructor profile will appear here.
    </Text>
  </View>
);

const DetailStat = ({ label, value }: { label: string; value: number }) => (
  <View className="flex-1 rounded-xl bg-slate-100 px-4 py-3">
    <Text className="text-xs font-medium text-slate-500">{label}</Text>
    <Text className="mt-1 text-2xl font-bold text-slate-900">{value}</Text>
  </View>
);

export default function InstructorCoursesScreen() {
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch]);

  if (isLoading) {
    return (
      <View className="flex-1 bg-slate-50 p-6">
        <View className="mb-6">
          <Text className="text-2xl font-bold text-primary">Courses</Text>
          <Text className="mt-2 text-sm text-slate-600">Subjects assigned to your profile.</Text>
        </View>
        <View className="gap-4">
          <CourseSkeleton />
          <CourseSkeleton />
          <CourseSkeleton />
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 p-6">
        <Text className="text-lg font-bold text-slate-900">Could not load courses</Text>
        <Text className="mt-2 text-center text-sm text-slate-500">
          Check your connection and try again.
        </Text>
        <Pressable className="mt-5 rounded-xl bg-primary px-5 py-3" onPress={() => void refetch()}>
          <Text className="font-bold text-white">Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <>
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
        <View>
          <Text className="text-2xl font-bold text-primary">Courses</Text>
          <Text className="mt-2 text-sm text-slate-600">Subjects assigned to your profile.</Text>
        </View>

        <View className="mt-6 gap-4">
          {subjects.length === 0 ? (
            <EmptyState />
          ) : (
            subjects.map((subject) => (
              <Pressable
                className="rounded-2xl bg-white p-5"
                key={subject.id}
                onPress={() => setSelectedSubject(subject)}
              >
                <View className="flex-row items-start justify-between gap-4">
                  <View className="flex-1">
                    <Text className="text-lg font-bold text-slate-900">{subject.name}</Text>
                    <Text className="mt-1 text-sm font-semibold text-primary">{subject.code}</Text>
                  </View>
                  <View className="rounded-full bg-slate-100 px-3 py-1">
                    <Text className="text-xs font-bold text-slate-600">Semester {subject.semester}</Text>
                  </View>
                </View>
                <Text className="mt-4 text-sm text-slate-600">{subject.department}</Text>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>

      <Modal
        animationType="slide"
        transparent
        visible={selectedSubject !== null}
        onRequestClose={() => setSelectedSubject(null)}
      >
        <Pressable className="flex-1 justify-end bg-black/30" onPress={() => setSelectedSubject(null)}>
          <Pressable className="rounded-t-3xl bg-white p-6" onPress={(event) => event.stopPropagation()}>
            {selectedSubject && selectedStats ? (
              <>
                <View className="h-1 w-12 self-center rounded-full bg-slate-300" />
                <Text className="mt-6 text-2xl font-bold text-slate-900">{selectedSubject.name}</Text>
                <Text className="mt-1 text-sm font-semibold text-primary">{selectedSubject.code}</Text>
                <Text className="mt-2 text-sm text-slate-500">
                  {selectedSubject.department} - Semester {selectedSubject.semester}
                </Text>
                <View className="mt-6 flex-row gap-3">
                  <DetailStat label="Enrolled students" value={selectedStats.enrolledStudents} />
                  <DetailStat label="Upcoming assignments" value={selectedStats.upcomingAssignments} />
                </View>
                <Pressable
                  className="mt-6 rounded-xl bg-primary px-5 py-3"
                  onPress={() => setSelectedSubject(null)}
                >
                  <Text className="text-center font-bold text-white">Close</Text>
                </Pressable>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
