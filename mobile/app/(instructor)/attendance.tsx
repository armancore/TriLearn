import { useMutation, useQuery } from '@tanstack/react-query';
import { useNetInfo } from '@react-native-community/netinfo';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  InlineNotice,
  Input,
  ProgressBar,
  SCREEN_GUTTER,
  Screen,
  Select,
  SkeletonList,
  Text,
  type BadgeTone,
} from '@/src/components/ui';
import { announce } from '@/src/hooks/useA11y';
import { useToast } from '@/src/hooks/useToast';
import { api } from '@/src/services/api';
import { useTheme } from '@/src/theme/ThemeProvider';
import { radius } from '@/src/theme/tokens';
import type {
  AttendanceBySubjectResponse,
  AttendanceStatus,
  EnrolledStudent,
  ManualAttendancePayload,
  SubjectStudentsResponse,
} from '@/src/types/instructorOps';
import type { Subject, SubjectsResponse } from '@/src/types/subject';

type RosterStatus = AttendanceStatus | 'NOT_MARKED';

const STATUS_ORDER: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LATE'];

const STATUS_STYLE: Record<RosterStatus, { tone: BadgeTone; label: string; icon: 'checkmark-circle' | 'close-circle' | 'time-outline' | 'ellipse-outline' }> = {
  PRESENT: { tone: 'success', label: 'Present', icon: 'checkmark-circle' },
  ABSENT: { tone: 'danger', label: 'Absent', icon: 'close-circle' },
  LATE: { tone: 'warning', label: 'Late', icon: 'time-outline' },
  NOT_MARKED: { tone: 'neutral', label: 'Not marked', icon: 'ellipse-outline' },
};

const getTodayInputValue = () => new Date().toISOString().slice(0, 10);

const getSubjects = async (): Promise<Subject[]> => {
  const response = await api.get<Subject[] | SubjectsResponse>('/subjects');
  return Array.isArray(response.data) ? response.data : response.data.subjects;
};

const nextStatus = (status: RosterStatus): AttendanceStatus =>
  status === 'NOT_MARKED'
    ? 'PRESENT'
    : STATUS_ORDER[(STATUS_ORDER.indexOf(status) + 1) % STATUS_ORDER.length];

const isValidDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

export default function InstructorAttendanceScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const { isConnected } = useNetInfo();
  const isOffline = isConnected === false;
  const { subjectId } = useLocalSearchParams<{ subjectId?: string }>();

  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [date, setDate] = useState(getTodayInputValue);
  const [changes, setChanges] = useState<Record<string, AttendanceStatus>>({});
  const [refreshing, setRefreshing] = useState(false);

  const subjectsQuery = useQuery({ queryKey: ['subjects', 'instructor'], queryFn: getSubjects });

  // A subjectId handed over from the dashboard wins, so "Take attendance" on a
  // class lands on that roster instead of whichever subject sorts first.
  useEffect(() => {
    if (selectedSubject || !subjectsQuery.data?.length) {
      return;
    }

    const requested = typeof subjectId === 'string' ? subjectId : undefined;
    setSelectedSubject(
      subjectsQuery.data.find((subject) => subject.id === requested) ?? subjectsQuery.data[0],
    );
  }, [selectedSubject, subjectId, subjectsQuery.data]);

  useEffect(() => {
    setChanges({});
  }, [date, selectedSubject?.id]);

  const studentsQuery = useQuery({
    queryKey: ['marks', 'subject', selectedSubject?.id, 'students'],
    queryFn: async () =>
      (await api.get<SubjectStudentsResponse>(`/marks/subject/${selectedSubject?.id}/students`)).data,
    enabled: Boolean(selectedSubject),
  });

  const attendanceQuery = useQuery({
    queryKey: ['attendance', 'subject', selectedSubject?.id, date],
    queryFn: async () =>
      (
        await api.get<AttendanceBySubjectResponse>(
          `/attendance/subject/${selectedSubject?.id}?date=${encodeURIComponent(date)}&limit=100`,
        )
      ).data,
    enabled: Boolean(selectedSubject) && isValidDate(date),
  });

  const attendanceMap = useMemo(
    () => new Map((attendanceQuery.data?.attendance ?? []).map((record) => [record.studentId, record.status])),
    [attendanceQuery.data?.attendance],
  );

  const roster = useMemo(
    () =>
      (studentsQuery.data?.students ?? []).map((student) => ({
        student,
        status: (changes[student.id] ?? attendanceMap.get(student.id) ?? 'NOT_MARKED') as RosterStatus,
      })),
    [attendanceMap, changes, studentsQuery.data?.students],
  );

  const presentCount = roster.filter((row) => row.status === 'PRESENT').length;
  const changeCount = Object.keys(changes).length;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSubject) {
        throw new Error('Select a subject first.');
      }

      const payload: ManualAttendancePayload = {
        subjectId: selectedSubject.id,
        attendanceDate: date,
        semester:
          typeof selectedSubject.semester === 'number'
            ? selectedSubject.semester
            : Number(selectedSubject.semester),
        attendanceList: Object.entries(changes).map(([studentId, status]) => ({ studentId, status })),
      };

      await api.post('/attendance/manual', payload);
    },
    onSuccess: async () => {
      setChanges({});
      await attendanceQuery.refetch();
      toast.success('Attendance saved.');
      announce('Attendance saved');
    },
    onError: (error) => toast.error(error, 'Could not save attendance.'),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([subjectsQuery.refetch(), studentsQuery.refetch(), attendanceQuery.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }, [attendanceQuery, studentsQuery, subjectsQuery]);

  const isLoading = subjectsQuery.isLoading || studentsQuery.isLoading || attendanceQuery.isLoading;

  if (subjectsQuery.isError) {
    return (
      <Screen header={{ title: 'Attendance', showBack: false }}>
        <ErrorState onRetry={() => void subjectsQuery.refetch()} title="Could not load your subjects" />
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <>
          <Button
            accessibilityHint={
              changeCount === 0 ? 'No changes to save yet' : `Saves ${changeCount} attendance changes`
            }
            disabled={changeCount === 0 || isOffline}
            icon="save-outline"
            label={changeCount === 0 ? 'No changes to save' : `Save ${changeCount} ${changeCount === 1 ? 'change' : 'changes'}`}
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
      header={{ title: 'Attendance', subtitle: 'Tap a student to cycle present, absent and late.', showBack: false }}
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
        data={roster}
        keyExtractor={(item) => item.student.id}
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
          <View style={{ gap: 14, paddingBottom: 6 }}>
            <Card padding="lg" style={{ backgroundColor: colors.primary, borderColor: colors.primary }}>
              <Text style={{ color: 'rgba(255,255,255,0.82)' }} tone="inherit" variant="caption">
                Marked present
              </Text>
              <Text style={{ color: '#FFFFFF', marginTop: 4 }} tone="inherit" variant="display">
                {presentCount}
                <Text style={{ color: 'rgba(255,255,255,0.7)' }} tone="inherit" variant="heading">
                  {` / ${roster.length}`}
                </Text>
              </Text>
              <ProgressBar
                color="#FFFFFF"
                label="Students marked present"
                style={{ marginTop: 14 }}
                trackColor="rgba(255,255,255,0.24)"
                value={roster.length === 0 ? 0 : (presentCount / roster.length) * 100}
              />
            </Card>

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

            <Input
              autoCapitalize="none"
              error={isValidDate(date) ? undefined : 'Use the format YYYY-MM-DD.'}
              hint="Format: YYYY-MM-DD"
              icon="calendar-outline"
              keyboardType="numbers-and-punctuation"
              label="Date"
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              value={date}
            />

            {changeCount > 0 ? (
              <InlineNotice
                description={`${changeCount} unsaved ${changeCount === 1 ? 'change' : 'changes'}.`}
                title="Not saved yet"
                tone="info"
              />
            ) : null}
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
        renderItem={({ item }: { item: { student: EnrolledStudent; status: RosterStatus } }) => {
          const style = STATUS_STYLE[item.status];

          return (
            <Pressable
              accessibilityHint="Cycles between present, absent and late"
              accessibilityLabel={`${item.student.name}, ${item.student.rollNumber}, ${style.label}`}
              accessibilityRole="button"
              onPress={() =>
                setChanges((current) => ({ ...current, [item.student.id]: nextStatus(item.status) }))
              }
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                minHeight: 64,
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderRadius: radius.lg,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: pressed ? colors.surfacePressed : colors.surface,
              })}
            >
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} variant="bodyStrong">
                  {item.student.name}
                </Text>
                <Text style={{ marginTop: 2 }} tone="muted" variant="caption">
                  {item.student.rollNumber}
                </Text>
              </View>
              <Badge icon={style.icon} label={style.label} tone={style.tone} />
            </Pressable>
          );
        }}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}
