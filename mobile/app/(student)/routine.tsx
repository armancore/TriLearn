import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { COLORS } from '@/src/constants/colors';
import { useAuth } from '@/src/hooks/useAuth';
import { api } from '@/src/services/api';
import type { DayOfWeek, Routine, RoutinesResponse } from '@/src/types/routine';

const days: Array<{ label: string; value: DayOfWeek }> = [
  { label: 'Sun', value: 'SUNDAY' },
  { label: 'Mon', value: 'MONDAY' },
  { label: 'Tue', value: 'TUESDAY' },
  { label: 'Wed', value: 'WEDNESDAY' },
  { label: 'Thu', value: 'THURSDAY' },
  { label: 'Fri', value: 'FRIDAY' },
  { label: 'Sat', value: 'SATURDAY' },
];

const getToday = () => days[new Date().getDay()]?.value ?? 'SUNDAY';

const buildRoutineQuery = (student?: { department?: string | null; semester: number; section?: string | null }) => {
  const params = [
    student?.department ? `department=${encodeURIComponent(student.department)}` : null,
    student?.semester ? `semester=${encodeURIComponent(String(student.semester))}` : null,
    student?.section ? `section=${encodeURIComponent(student.section)}` : null,
  ].filter(Boolean);

  return params.length ? `/routines?${params.join('&')}` : '/routines';
};

const RoutineSkeleton = () => (
  <View className="rounded-2xl bg-white p-5">
    <View className="h-5 w-2/3 rounded-full bg-slate-200" />
    <View className="mt-3 h-4 w-1/2 rounded-full bg-slate-100" />
    <View className="mt-5 h-4 w-24 rounded-full bg-slate-100" />
  </View>
);

export default function StudentRoutineScreen() {
  const { isAuthenticated, user } = useAuth();
  const [activeDay, setActiveDay] = useState<DayOfWeek>(getToday);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const student = user?.student;

  const routineQuery = useQuery({
    queryKey: ['routines', 'student', student?.department, student?.semester, student?.section],
    queryFn: async () => {
      const response = await api.get<RoutinesResponse>(buildRoutineQuery(student));
      return response.data;
    },
    enabled: isAuthenticated,
  });

  const dayRoutines = useMemo(
    () =>
      (routineQuery.data?.routines ?? [])
        .filter((routine) => routine.dayOfWeek === activeDay)
        .sort((left, right) => left.startTime.localeCompare(right.startTime)),
    [activeDay, routineQuery.data?.routines],
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await routineQuery.refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [routineQuery]);

  const renderRoutine = (routine: Routine) => (
    <View className="rounded-2xl bg-white p-5" key={routine.id}>
      <Text className="text-lg font-bold text-slate-900">{routine.subject?.name ?? 'Subject'}</Text>
      <Text className="mt-1 text-sm font-medium text-slate-500">{routine.subject?.code ?? 'N/A'}</Text>
      <View className="mt-5 flex-row gap-3">
        <View className="flex-1 rounded-xl bg-slate-100 p-3">
          <Text className="text-xs font-medium text-slate-500">Time</Text>
          <Text className="mt-1 text-sm font-bold text-slate-900">
            {routine.startTime}-{routine.endTime}
          </Text>
        </View>
        <View className="flex-1 rounded-xl bg-slate-100 p-3">
          <Text className="text-xs font-medium text-slate-500">Room</Text>
          <Text className="mt-1 text-sm font-bold text-slate-900">{routine.room || '-'}</Text>
        </View>
      </View>
      <Text className="mt-4 text-sm text-slate-600">Instructor: {routine.instructor?.user?.name ?? '-'}</Text>
    </View>
  );

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
      <Text className="text-2xl font-bold text-primary">Routine</Text>
      <Text className="mt-2 text-sm text-slate-600">
        {student?.department ?? 'Department'} • Semester {student?.semester ?? '-'} {student?.section ? `• Section ${student.section}` : ''}
      </Text>

      <ScrollView className="mt-5" horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-2">
          {days.map((day) => {
            const active = activeDay === day.value;
            const today = getToday() === day.value;
            return (
              <Pressable
                className={`rounded-full px-4 py-2 ${active ? 'bg-primary' : today ? 'bg-blue-100' : 'bg-white'}`}
                key={day.value}
                onPress={() => setActiveDay(day.value)}
              >
                <Text className={`text-xs font-bold ${active ? 'text-white' : today ? 'text-primary' : 'text-slate-600'}`}>
                  {day.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View className="mt-6 gap-4">
        {routineQuery.isLoading ? (
          <>
            <RoutineSkeleton />
            <RoutineSkeleton />
            <RoutineSkeleton />
          </>
        ) : dayRoutines.length === 0 ? (
          <View className="items-center rounded-2xl bg-white px-5 py-10">
            <Text className="text-lg font-bold text-slate-900">No classes scheduled</Text>
            <Text className="mt-2 text-center text-sm text-slate-500">This day has no routine entries yet.</Text>
          </View>
        ) : (
          dayRoutines.map(renderRoutine)
        )}
      </View>
    </ScrollView>
  );
}
