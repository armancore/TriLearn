import { useMutation, useQuery } from '@tanstack/react-query';
import { useNetInfo } from '@react-native-community/netinfo';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, TextInput, View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  InlineNotice,
  SCREEN_GUTTER,
  Screen,
  Select,
  SkeletonList,
  Text,
} from '@/src/components/ui';
import { announce } from '@/src/hooks/useA11y';
import { useToast } from '@/src/hooks/useToast';
import { api } from '@/src/services/api';
import { useTheme } from '@/src/theme/ThemeProvider';
import { MAX_FONT_SCALE, MIN_TOUCH_TARGET, radius } from '@/src/theme/tokens';
import type {
  BulkMarksPayload,
  EnrolledStudent,
  SubjectMarksResponse,
  SubjectStudentsResponse,
} from '@/src/types/instructorOps';
import type { ExamType } from '@/src/types/marks';
import type { Subject, SubjectsResponse } from '@/src/types/subject';

const EXAM_TYPES: ExamType[] = ['INTERNAL', 'MIDTERM', 'FINAL', 'PREBOARD', 'PRACTICAL'];

const titleCase = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();

const getSubjects = async (): Promise<Subject[]> => {
  const response = await api.get<Subject[] | SubjectsResponse>('/subjects');
  return Array.isArray(response.data) ? response.data : response.data.subjects;
};

export default function InstructorMarksScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const { isConnected } = useNetInfo();
  const isOffline = isConnected === false;

  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [examType, setExamType] = useState<ExamType>('INTERNAL');
  const [totalMarks, setTotalMarks] = useState('100');
  const [marksByStudent, setMarksByStudent] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [validationError, setValidationError] = useState('');

  const subjectsQuery = useQuery({ queryKey: ['subjects', 'instructor'], queryFn: getSubjects });

  useEffect(() => {
    if (!selectedSubject && subjectsQuery.data?.[0]) {
      setSelectedSubject(subjectsQuery.data[0]);
    }
  }, [selectedSubject, subjectsQuery.data]);

  const studentsQuery = useQuery({
    queryKey: ['marks', 'subject', selectedSubject?.id, 'students'],
    queryFn: async () =>
      (await api.get<SubjectStudentsResponse>(`/marks/subject/${selectedSubject?.id}/students`)).data,
    enabled: Boolean(selectedSubject),
  });

  const marksQuery = useQuery({
    queryKey: ['marks', 'subject', selectedSubject?.id, examType],
    queryFn: async () =>
      (
        await api.get<SubjectMarksResponse>(
          `/marks/subject/${selectedSubject?.id}?examType=${examType}&page=1&limit=100`,
        )
      ).data,
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

  const validateEntries = useCallback(() => {
    if (!selectedSubject) return 'Select a subject first.';
    if (!totalMarksValid) return 'Total marks must be a positive number.';

    for (const student of studentsQuery.data?.students ?? []) {
      const rawValue = marksByStudent[student.id];
      if (!rawValue) continue;

      const value = Number.parseInt(rawValue, 10);
      if (Number.isNaN(value) || value < 0) return `Enter valid marks for ${student.name}.`;
      if (value > parsedTotalMarks) return `${student.name} has marks above the total.`;
    }

    return '';
  }, [marksByStudent, parsedTotalMarks, selectedSubject, studentsQuery.data?.students, totalMarksValid]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const error = validateEntries();
      if (error) {
        throw new Error(error);
      }

      if (!selectedSubject) {
        return;
      }

      const newEntries: BulkMarksPayload['entries'] = [];
      const updateRequests: Promise<unknown>[] = [];

      for (const student of studentsQuery.data?.students ?? []) {
        const rawValue = marksByStudent[student.id];
        if (!rawValue) continue;

        const obtainedMarks = Number.parseInt(rawValue, 10);
        const existingMark = existingMarksMap.get(student.id);

        if (existingMark) {
          if (
            existingMark.obtainedMarks !== obtainedMarks ||
            existingMark.totalMarks !== parsedTotalMarks
          ) {
            updateRequests.push(
              api.put(`/marks/${existingMark.id}`, {
                obtainedMarks,
                remarks: existingMark.remarks ?? '',
              }),
            );
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
    onMutate: () => setValidationError(''),
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Could not save marks.';
      setValidationError(message);
      toast.error(error, message);
    },
    onSuccess: async () => {
      await marksQuery.refetch();
      toast.success('Marks saved.');
      announce('Marks saved');
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([subjectsQuery.refetch(), studentsQuery.refetch(), marksQuery.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }, [marksQuery, studentsQuery, subjectsQuery]);

  const isLoading = subjectsQuery.isLoading || studentsQuery.isLoading || marksQuery.isLoading;
  const enteredCount = Object.values(marksByStudent).filter((value) => value.length > 0).length;

  if (subjectsQuery.isError) {
    return (
      <Screen header={{ title: 'Marks', showBack: false }}>
        <ErrorState onRetry={() => void subjectsQuery.refetch()} title="Could not load your subjects" />
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <>
          <Button
            accessibilityHint={`Saves marks for ${enteredCount} students`}
            disabled={isOffline || !totalMarksValid}
            icon="save-outline"
            label="Save all marks"
            loading={saveMutation.isPending}
            onPress={() => saveMutation.mutate()}
          />
          {isOffline ? (
            <Text center style={{ marginTop: 8 }} tone="warning" variant="caption">
              Saving is unavailable while offline.
            </Text>
          ) : null}
        </>
      }
      header={{ title: 'Marks entry', subtitle: 'Enter an exam’s marks and save the class at once.', showBack: false }}
      padded={false}
      scroll={false}
    >
      <FlatList
        contentContainerStyle={{
          gap: 10,
          paddingHorizontal: SCREEN_GUTTER,
          paddingTop: 8,
          paddingBottom: 24,
          flexGrow: 1,
        }}
        data={studentsQuery.data?.students ?? []}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          isLoading ? (
            <SkeletonList count={4} lines={1} />
          ) : (
            <EmptyState
              description="Students enrolled in this subject will appear here."
              icon="people-outline"
              title="No enrolled students"
            />
          )
        }
        ListHeaderComponent={
          <View style={{ gap: 12, paddingBottom: 6 }}>
            <Select
              icon="book-outline"
              label="Subject"
              onChange={(id) =>
                setSelectedSubject(subjectsQuery.data?.find((subject) => subject.id === id) ?? null)
              }
              options={(subjectsQuery.data ?? []).map((subject) => ({
                value: subject.id,
                label: subject.name,
                description: `${subject.code} · Semester ${subject.semester}`,
              }))}
              placeholder="Select a subject"
              value={selectedSubject?.id ?? null}
            />

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Select
                  icon="school-outline"
                  label="Exam type"
                  onChange={setExamType}
                  options={EXAM_TYPES.map((type) => ({ value: type, label: titleCase(type) }))}
                  value={examType}
                />
              </View>

              <View
                style={{
                  width: 116,
                  justifyContent: 'center',
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: totalMarksValid ? colors.border : colors.danger,
                  backgroundColor: colors.surface,
                }}
              >
                <Text tone="subtle" uppercase variant="label">
                  Total
                </Text>
                <TextInput
                  accessibilityLabel="Total marks for this exam"
                  keyboardType="number-pad"
                  maxFontSizeMultiplier={MAX_FONT_SCALE}
                  onChangeText={(value) => setTotalMarks(value.replace(/[^0-9]/g, ''))}
                  style={{ marginTop: 2, fontSize: 15, fontWeight: '600', color: colors.text, paddingVertical: 4 }}
                  value={totalMarks}
                />
              </View>
            </View>

            {validationError ? (
              <InlineNotice title={validationError} tone="danger" />
            ) : (
              <Text tone="subtle" variant="caption">
                {enteredCount} of {studentsQuery.data?.students.length ?? 0} students have marks entered.
              </Text>
            )}
          </View>
        }
        refreshControl={
          <RefreshControl
            colors={[colors.primaryText]}
            onRefresh={onRefresh}
            progressBackgroundColor={colors.surface}
            refreshing={refreshing}
            tintColor={colors.primaryText}
          />
        }
        renderItem={({ item }: { item: EnrolledStudent }) => {
          const existingMark = existingMarksMap.get(item.id);
          const value = marksByStudent[item.id] ?? '';
          const numericValue = Number.parseInt(value, 10);
          const isOverTotal = !Number.isNaN(numericValue) && totalMarksValid && numericValue > parsedTotalMarks;

          return (
            <Card padding="md">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} variant="bodyStrong">
                    {item.name}
                  </Text>
                  <Text style={{ marginTop: 2 }} tone="muted" variant="caption">
                    {item.rollNumber}
                  </Text>
                </View>

                {existingMark ? <Badge label={existingMark.grade} tone="info" /> : null}

                <View
                  style={{
                    width: 92,
                    height: MIN_TOUCH_TARGET,
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 10,
                    borderRadius: radius.md,
                    borderWidth: isOverTotal ? 2 : 1,
                    borderColor: isOverTotal ? colors.danger : colors.border,
                    backgroundColor: colors.surfaceMuted,
                  }}
                >
                  <TextInput
                    accessibilityHint={`Out of ${totalMarks} marks`}
                    accessibilityLabel={`Marks for ${item.name}`}
                    keyboardType="number-pad"
                    maxFontSizeMultiplier={MAX_FONT_SCALE}
                    onChangeText={(next) =>
                      setMarksByStudent((current) => ({ ...current, [item.id]: next.replace(/[^0-9]/g, '') }))
                    }
                    placeholder="—"
                    placeholderTextColor={colors.textSubtle}
                    style={{ flex: 1, fontSize: 15, fontWeight: '700', color: colors.text, textAlign: 'right' }}
                    value={value}
                  />
                  <Text style={{ marginLeft: 4 }} tone="subtle" variant="caption">
                    /{totalMarks || '—'}
                  </Text>
                </View>
              </View>
            </Card>
          );
        }}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}
