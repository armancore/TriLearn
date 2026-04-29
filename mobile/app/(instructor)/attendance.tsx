import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';

import { COLORS } from '@/src/constants/colors';
import { api } from '@/src/services/api';
import type {
  AttendanceBySubjectResponse,
  AttendanceStatus,
  EnrolledStudent,
  ManualAttendancePayload,
  SubjectStudentsResponse,
} from '@/src/types/instructorOps';
import type { Subject, SubjectsResponse } from '@/src/types/subject';

type RosterStatus = AttendanceStatus | 'NOT_MARKED';

const getTodayInputValue = () => new Date().toISOString().slice(0, 10);

const statusOrder: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LATE'];

const statusTone: Record<RosterStatus, { bg: string; text: string; label: string }> = {
  PRESENT: { bg: '#DCFCE7', text: '#166534', label: 'PRESENT' },
  ABSENT: { bg: '#FEE2E2', text: '#B91C1C', label: 'ABSENT' },
  LATE: { bg: '#FEF3C7', text: '#92400E', label: 'LATE' },
  NOT_MARKED: { bg: '#F1F5F9', text: '#64748B', label: 'Not Marked' },
};

const getSubjects = async (): Promise<Subject[]> => {
  const response = await api.get<Subject[] | SubjectsResponse>('/subjects');
  return Array.isArray(response.data) ? response.data : response.data.subjects;
};

const nextStatus = (status: RosterStatus): AttendanceStatus => {
  if (status === 'NOT_MARKED') return 'PRESENT';
  return statusOrder[(statusOrder.indexOf(status) + 1) % statusOrder.length];
};

const RosterSkeleton = () => (
  <View className="rounded-2xl bg-white p-5">
    <View className="h-5 w-2/3 rounded-full bg-slate-200" />
    <View className="mt-3 h-4 w-1/2 rounded-full bg-slate-100" />
  </View>
);

export default function InstructorAttendanceScreen() {
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [date, setDate] = useState(getTodayInputValue);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [changes, setChanges] = useState<Record<string, AttendanceStatus>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);

  const subjectsQuery = useQuery({
    queryKey: ['subjects', 'instructor'],
    queryFn: getSubjects,
  });

  useEffect(() => {
    if (!selectedSubject && subjectsQuery.data?.[0]) {
      setSelectedSubject(subjectsQuery.data[0]);
    }
  }, [selectedSubject, subjectsQuery.data]);

  useEffect(() => {
    setChanges({});
  }, [date, selectedSubject?.id]);

  const studentsQuery = useQuery({
    queryKey: ['marks', 'subject', selectedSubject?.id, 'students'],
    queryFn: async () => {
      const response = await api.get<SubjectStudentsResponse>(`/marks/subject/${selectedSubject?.id}/students`);
      return response.data;
    },
    enabled: Boolean(selectedSubject),
  });

  const attendanceQuery = useQuery({
    queryKey: ['attendance', 'subject', selectedSubject?.id, date],
    queryFn: async () => {
      const response = await api.get<AttendanceBySubjectResponse>(
        `/attendance/subject/${selectedSubject?.id}?date=${encodeURIComponent(date)}&limit=100`,
      );
      return response.data;
    },
    enabled: Boolean(selectedSubject),
  });

  const attendanceMap = useMemo(
    () => new Map((attendanceQuery.data?.attendance ?? []).map((record) => [record.studentId, record.status])),
    [attendanceQuery.data?.attendance],
  );

  const roster = useMemo(
    () =>
      (studentsQuery.data?.students ?? []).map((student) => {
        const currentStatus = changes[student.id] ?? attendanceMap.get(student.id) ?? 'NOT_MARKED';
        return { student, status: currentStatus };
      }),
    [attendanceMap, changes, studentsQuery.data?.students],
  );

  const presentCount = roster.filter((row) => row.status === 'PRESENT').length;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSubject) throw new Error('Select a subject first');
      const attendanceList = Object.entries(changes).map(([studentId, status]) => ({ studentId, status }));
      const payload: ManualAttendancePayload = {
        subjectId: selectedSubject.id,
        attendanceDate: date,
        semester: typeof selectedSubject.semester === 'number' ? selectedSubject.semester : Number(selectedSubject.semester),
        attendanceList,
      };
      await api.post('/attendance/manual', payload);
    },
    onSuccess: async () => {
      setChanges({});
      await attendanceQuery.refetch();
    },
  });

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([subjectsQuery.refetch(), studentsQuery.refetch(), attendanceQuery.refetch()]);
    } finally {
      setIsRefreshing(false);
    }
  }, [attendanceQuery, studentsQuery, subjectsQuery]);

  const toggleStudent = (studentId: string, status: RosterStatus) => {
    setChanges((current) => ({ ...current, [studentId]: nextStatus(status) }));
  };

  const renderStudent = ({ item }: { item: { student: EnrolledStudent; status: RosterStatus } }) => {
    const tone = statusTone[item.status];
    return (
      <Pressable className="rounded-2xl bg-white p-5 active:opacity-80" onPress={() => toggleStudent(item.student.id, item.status)}>
        <View className="flex-row items-start justify-between gap-4">
          <View className="flex-1">
            <Text className="text-base font-bold text-slate-900">{item.student.name}</Text>
            <Text className="mt-1 text-sm text-slate-500">{item.student.rollNumber}</Text>
          </View>
          <View className="rounded-full px-3 py-1" style={{ backgroundColor: tone.bg }}>
            <Text className="text-xs font-bold" style={{ color: tone.text }}>
              {tone.label}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  };

  if (subjectsQuery.isError) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 p-6">
        <Text className="text-lg font-bold text-slate-900">Could not load attendance</Text>
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
        data={roster}
        keyExtractor={(item) => item.student.id}
        ListEmptyComponent={
          subjectsQuery.isLoading || studentsQuery.isLoading || attendanceQuery.isLoading ? (
            <View className="gap-3">
              <RosterSkeleton />
              <RosterSkeleton />
              <RosterSkeleton />
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
            <Text className="text-2xl font-bold text-primary">Attendance Roster</Text>
            <Text className="mt-2 text-sm text-slate-600">Tap rows to cycle Present, Absent, and Late.</Text>

            <View className="mt-6 rounded-2xl bg-primary p-5">
              <Text className="text-sm font-semibold text-blue-100">Present today</Text>
              <Text className="mt-2 text-4xl font-bold text-white">
                {presentCount} / {roster.length}
              </Text>
            </View>

            <View className="mt-4 gap-3">
              <Pressable className="rounded-2xl bg-white p-4" onPress={() => setPickerOpen(true)}>
                <Text className="text-xs font-medium text-slate-500">Subject</Text>
                <Text className="mt-1 text-base font-bold text-slate-900">
                  {selectedSubject ? `${selectedSubject.name} (${selectedSubject.code})` : 'Select subject'}
                </Text>
              </Pressable>
              <View className="rounded-2xl bg-white p-4">
                <Text className="text-xs font-medium text-slate-500">Date</Text>
                <TextInput className="mt-1 text-base font-bold text-slate-900" value={date} onChangeText={setDate} />
              </View>
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
        <Pressable
          className={`rounded-xl px-5 py-4 ${Object.keys(changes).length ? 'bg-primary' : 'bg-slate-300'}`}
          disabled={!Object.keys(changes).length || saveMutation.isPending}
          onPress={() => saveMutation.mutate()}
        >
          <Text className="text-center font-bold text-white">
            {saveMutation.isPending ? 'Saving...' : `Save changes (${Object.keys(changes).length})`}
          </Text>
        </Pressable>
        {saveMutation.isError ? <Text className="mt-2 text-center text-xs font-semibold text-red-600">Could not save attendance.</Text> : null}
      </View>

      <Modal animationType="slide" transparent visible={pickerOpen} onRequestClose={() => setPickerOpen(false)}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setPickerOpen(false)}>
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
                    setPickerOpen(false);
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
    </View>
  );
}
