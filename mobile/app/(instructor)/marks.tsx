import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';

import { COLORS } from '@/src/constants/colors';
import { useToast } from '@/src/hooks/useToast';
import { api } from '@/src/services/api';
import type { BulkMarksPayload, EnrolledStudent, InstructorMark, SubjectMarksResponse, SubjectStudentsResponse } from '@/src/types/instructorOps';
import type { ExamType } from '@/src/types/marks';
import type { Subject, SubjectsResponse } from '@/src/types/subject';

const examTypes: ExamType[] = ['INTERNAL', 'MIDTERM', 'FINAL', 'PREBOARD', 'PRACTICAL'];

const getSubjects = async (): Promise<Subject[]> => {
  const response = await api.get<Subject[] | SubjectsResponse>('/subjects');
  return Array.isArray(response.data) ? response.data : response.data.subjects;
};

const MarkSkeleton = () => (
  <View className="rounded-2xl bg-white p-5">
    <View className="h-5 w-2/3 rounded-full bg-slate-200" />
    <View className="mt-3 h-10 rounded-xl bg-slate-100" />
  </View>
);

export default function InstructorMarksScreen() {
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [examType, setExamType] = useState<ExamType>('INTERNAL');
  const [totalMarks, setTotalMarks] = useState('100');
  const [marksByStudent, setMarksByStudent] = useState<Record<string, string>>({});
  const [subjectPickerOpen, setSubjectPickerOpen] = useState(false);
  const [examPickerOpen, setExamPickerOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [validationError, setValidationError] = useState('');
  const toast = useToast();

  const subjectsQuery = useQuery({
    queryKey: ['subjects', 'instructor'],
    queryFn: getSubjects,
  });

  useEffect(() => {
    if (!selectedSubject && subjectsQuery.data?.[0]) {
      setSelectedSubject(subjectsQuery.data[0]);
    }
  }, [selectedSubject, subjectsQuery.data]);

  const studentsQuery = useQuery({
    queryKey: ['marks', 'subject', selectedSubject?.id, 'students'],
    queryFn: async () => {
      const response = await api.get<SubjectStudentsResponse>(`/marks/subject/${selectedSubject?.id}/students`);
      return response.data;
    },
    enabled: Boolean(selectedSubject),
  });

  const marksQuery = useQuery({
    queryKey: ['marks', 'subject', selectedSubject?.id, examType],
    queryFn: async () => {
      const response = await api.get<SubjectMarksResponse>(
        `/marks/subject/${selectedSubject?.id}?examType=${examType}&page=1&limit=100`,
      );
      return response.data;
    },
    enabled: Boolean(selectedSubject),
  });

  const existingMarksMap = useMemo(
    () => new Map((marksQuery.data?.marks ?? []).map((mark) => [mark.studentId, mark])),
    [marksQuery.data?.marks],
  );

  useEffect(() => {
    const nextValues: Record<string, string> = {};
    for (const student of studentsQuery.data?.students ?? []) {
      const existing = existingMarksMap.get(student.id);
      nextValues[student.id] = existing ? String(existing.obtainedMarks) : '';
    }
    setMarksByStudent(nextValues);
    setValidationError('');
  }, [existingMarksMap, studentsQuery.data?.students]);

  const parsedTotalMarks = Number.parseInt(totalMarks, 10);
  const totalMarksValid = !Number.isNaN(parsedTotalMarks) && parsedTotalMarks > 0;

  const validateEntries = () => {
    if (!selectedSubject) return 'Select a subject first.';
    if (!totalMarksValid) return 'Total marks must be a positive number.';

    for (const student of studentsQuery.data?.students ?? []) {
      const rawValue = marksByStudent[student.id];
      if (!rawValue) continue;
      const value = Number.parseInt(rawValue, 10);
      if (Number.isNaN(value) || value < 0) return `Enter valid marks for ${student.name}.`;
      if (value > parsedTotalMarks) return `${student.name} has marks above total marks.`;
    }

    return '';
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const error = validateEntries();
      if (error) {
        throw new Error(error);
      }

      if (!selectedSubject) return;

      const newEntries: BulkMarksPayload['entries'] = [];
      const updateRequests: Array<Promise<unknown>> = [];

      for (const student of studentsQuery.data?.students ?? []) {
        const rawValue = marksByStudent[student.id];
        if (!rawValue) continue;

        const obtainedMarks = Number.parseInt(rawValue, 10);
        const existingMark = existingMarksMap.get(student.id);

        if (existingMark) {
          if (existingMark.obtainedMarks !== obtainedMarks || existingMark.totalMarks !== parsedTotalMarks) {
            updateRequests.push(api.put(`/marks/${existingMark.id}`, { obtainedMarks, remarks: existingMark.remarks ?? '' }));
          }
        } else {
          newEntries.push({ studentId: student.id, obtainedMarks });
        }
      }

      if (newEntries.length > 0) {
        await api.post('/marks/bulk', {
          subjectId: selectedSubject.id,
          examType,
          totalMarks: parsedTotalMarks,
          entries: newEntries,
        } satisfies BulkMarksPayload);
      }

      await Promise.all(updateRequests);
    },
    onMutate: () => {
      setValidationError('');
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Could not save marks.';
      setValidationError(message);
      toast.error(error, message);
    },
    onSuccess: async () => {
      await marksQuery.refetch();
      toast.success('Marks saved.');
    },
  });

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([subjectsQuery.refetch(), studentsQuery.refetch(), marksQuery.refetch()]);
    } finally {
      setIsRefreshing(false);
    }
  }, [marksQuery, studentsQuery, subjectsQuery]);

  const renderStudent = ({ item }: { item: EnrolledStudent }) => {
    const existingMark = existingMarksMap.get(item.id);

    return (
      <View className="rounded-2xl bg-white p-5">
        <View className="flex-row items-start justify-between gap-4">
          <View className="flex-1">
            <Text className="text-base font-bold text-slate-900">{item.name}</Text>
            <Text className="mt-1 text-sm text-slate-500">{item.rollNumber}</Text>
          </View>
          {existingMark ? (
            <View className="rounded-full bg-blue-100 px-3 py-1">
              <Text className="text-xs font-bold text-blue-700">{existingMark.grade}</Text>
            </View>
          ) : null}
        </View>
        <TextInput
          className="mt-4 rounded-xl bg-slate-100 px-4 py-3 text-base font-bold text-slate-900"
          keyboardType="number-pad"
          placeholder="Obtained marks"
          placeholderTextColor="#94A3B8"
          value={marksByStudent[item.id] ?? ''}
          onChangeText={(value) => setMarksByStudent((current) => ({ ...current, [item.id]: value.replace(/[^0-9]/g, '') }))}
        />
      </View>
    );
  };

  if (subjectsQuery.isError) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 p-6">
        <Text className="text-lg font-bold text-slate-900">Could not load marks</Text>
        <Text className="mt-2 text-center text-sm text-slate-500">Check your connection and try again.</Text>
        <Pressable className="mt-5 rounded-xl bg-primary px-5 py-3" onPress={() => void subjectsQuery.refetch()}>
          <Text className="font-bold text-white">Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50">
      <FlatList
        contentContainerStyle={{ gap: 12, padding: 24, paddingBottom: 112 }}
        data={studentsQuery.data?.students ?? []}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          subjectsQuery.isLoading || studentsQuery.isLoading || marksQuery.isLoading ? (
            <View className="gap-3">
              <MarkSkeleton />
              <MarkSkeleton />
              <MarkSkeleton />
            </View>
          ) : (
            <View className="items-center rounded-2xl bg-white px-5 py-10">
              <Text className="text-lg font-bold text-slate-900">No enrolled students</Text>
              <Text className="mt-2 text-center text-sm text-slate-500">Students assigned to this subject will appear here.</Text>
            </View>
          )
        }
        ListHeaderComponent={
          <View className="mb-2">
            <Text className="text-2xl font-bold text-primary">Marks Entry</Text>
            <Text className="mt-2 text-sm text-slate-600">Enter marks for an exam and save the class in one action.</Text>

            <View className="mt-6 gap-3">
              <Pressable className="rounded-2xl bg-white p-4" onPress={() => setSubjectPickerOpen(true)}>
                <Text className="text-xs font-medium text-slate-500">Subject</Text>
                <Text className="mt-1 text-base font-bold text-slate-900">
                  {selectedSubject ? `${selectedSubject.name} (${selectedSubject.code})` : 'Select subject'}
                </Text>
              </Pressable>

              <View className="flex-row gap-3">
                <Pressable className="flex-1 rounded-2xl bg-white p-4" onPress={() => setExamPickerOpen(true)}>
                  <Text className="text-xs font-medium text-slate-500">Exam type</Text>
                  <Text className="mt-1 text-base font-bold text-slate-900">{examType}</Text>
                </Pressable>
                <View className="w-32 rounded-2xl bg-white p-4">
                  <Text className="text-xs font-medium text-slate-500">Total</Text>
                  <TextInput
                    className="mt-1 text-base font-bold text-slate-900"
                    keyboardType="number-pad"
                    value={totalMarks}
                    onChangeText={(value) => setTotalMarks(value.replace(/[^0-9]/g, ''))}
                  />
                </View>
              </View>

              {validationError ? (
                <View className="rounded-2xl bg-red-50 p-4">
                  <Text className="text-sm font-bold text-red-700">{validationError}</Text>
                </View>
              ) : null}
            </View>
          </View>
        }
        refreshControl={
          <RefreshControl
            colors={[COLORS.primary]}
            refreshing={isRefreshing}
            tintColor={COLORS.primary}
            onRefresh={handleRefresh}
          />
        }
        renderItem={renderStudent}
      />

      <View className="absolute bottom-0 left-0 right-0 border-t border-slate-200 bg-white p-4">
        <Pressable className="rounded-xl bg-primary px-5 py-4" disabled={saveMutation.isPending} onPress={() => saveMutation.mutate()}>
          <Text className="text-center font-bold text-white">{saveMutation.isPending ? 'Saving...' : 'Save all'}</Text>
        </Pressable>
      </View>

      <Modal animationType="slide" transparent visible={subjectPickerOpen} onRequestClose={() => setSubjectPickerOpen(false)}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setSubjectPickerOpen(false)}>
          <Pressable className="max-h-[75%] rounded-t-3xl bg-white p-6" onPress={(event) => event.stopPropagation()}>
            <View className="h-1 w-12 self-center rounded-full bg-slate-200" />
            <Text className="mt-6 text-xl font-bold text-slate-900">Select subject</Text>
            <FlatList
              data={subjectsQuery.data ?? []}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable
                  className="border-b border-slate-100 py-4"
                  onPress={() => {
                    setSelectedSubject(item);
                    setSubjectPickerOpen(false);
                  }}
                >
                  <Text className="text-base font-bold text-slate-900">{item.name}</Text>
                  <Text className="mt-1 text-sm text-slate-500">{item.code}</Text>
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal animationType="slide" transparent visible={examPickerOpen} onRequestClose={() => setExamPickerOpen(false)}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setExamPickerOpen(false)}>
          <Pressable className="rounded-t-3xl bg-white p-6" onPress={(event) => event.stopPropagation()}>
            <View className="h-1 w-12 self-center rounded-full bg-slate-200" />
            <Text className="mt-6 text-xl font-bold text-slate-900">Exam type</Text>
            {examTypes.map((type) => (
              <Pressable
                className="border-b border-slate-100 py-4"
                key={type}
                onPress={() => {
                  setExamType(type);
                  setExamPickerOpen(false);
                }}
              >
                <Text className={`text-base font-bold ${examType === type ? 'text-primary' : 'text-slate-900'}`}>{type}</Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
