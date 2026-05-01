import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

import { COLORS } from '@/src/constants/colors';
import { api } from '@/src/services/api';
import type { GenerateQrResponse } from '@/src/types/instructorOps';
import type { Subject, SubjectsResponse } from '@/src/types/subject';

const DEFAULT_VALID_MINUTES = 5;

const getTodayInputValue = () => new Date().toISOString().slice(0, 10);

const isValidDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value));

const getSubjects = async (): Promise<Subject[]> => {
  const response = await api.get<Subject[] | SubjectsResponse>('/subjects');
  return Array.isArray(response.data) ? response.data : response.data.subjects;
};

const formatCountdown = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
};

const ScreenSkeleton = () => (
  <View className="gap-4">
    <View className="h-14 rounded-2xl bg-white" />
    <View className="h-14 rounded-2xl bg-white" />
    <View className="h-64 rounded-2xl bg-white" />
  </View>
);

export default function InstructorQrScreen() {
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [date, setDate] = useState(getTodayInputValue);
  const [validMinutes, setValidMinutes] = useState(String(DEFAULT_VALID_MINUTES));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [generatedQr, setGeneratedQr] = useState<GenerateQrResponse | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const autoRefreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const generateRef = useRef<(() => void) | null>(null);

  const clearAutoRefresh = useCallback(() => {
    if (autoRefreshIntervalRef.current) {
      clearInterval(autoRefreshIntervalRef.current);
      autoRefreshIntervalRef.current = null;
    }
  }, []);

  const resetAutoRefresh = useCallback((delayMs: number) => {
    clearAutoRefresh();
    autoRefreshIntervalRef.current = setInterval(() => {
      generateRef.current?.();
    }, delayMs);
  }, [clearAutoRefresh]);

  const subjectsQuery = useQuery({
    queryKey: ['subjects', 'instructor'],
    queryFn: getSubjects,
  });

  useEffect(() => {
    if (!selectedSubject && subjectsQuery.data?.[0]) {
      setSelectedSubject(subjectsQuery.data[0]);
    }
  }, [selectedSubject, subjectsQuery.data]);

  const parsedValidMinutes = useMemo(() => {
    const parsed = Number.parseInt(validMinutes, 10);
    if (Number.isNaN(parsed) || parsed < 1) return DEFAULT_VALID_MINUTES;
    return Math.min(parsed, 60);
  }, [validMinutes]);

  const isDateValid = isValidDate(date);

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSubject) {
        throw new Error('Select a subject first');
      }

      const response = await api.post<GenerateQrResponse>('/attendance/generate-qr', {
        subjectId: selectedSubject.id,
        date,
        validMinutes: parsedValidMinutes,
      });
      return response.data;
    },
    onSuccess: (data) => {
      setGeneratedQr(data);
      setExpiresAt(Date.now() + parsedValidMinutes * 60 * 1000);
      setSecondsRemaining(parsedValidMinutes * 60);
      resetAutoRefresh(parsedValidMinutes * 60 * 1000);
    },
  });

  useEffect(() => {
    generateRef.current = generateMutation.mutate;
  }, [generateMutation.mutate]);

  useEffect(() => () => clearAutoRefresh(), [clearAutoRefresh]);

  useEffect(() => {
    clearAutoRefresh();
    setGeneratedQr(null);
    setExpiresAt(null);
    setSecondsRemaining(0);
  }, [clearAutoRefresh, selectedSubject?.id]);

  useEffect(() => {
    if (!expiresAt) return undefined;

    const interval = setInterval(() => {
      const nextSeconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setSecondsRemaining(nextSeconds);
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await subjectsQuery.refetch();
      if (selectedSubject) {
        await generateMutation.mutateAsync();
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [generateMutation, selectedSubject, subjectsQuery]);

  if (subjectsQuery.isLoading) {
    return (
      <View className="flex-1 bg-slate-50 p-6">
        <Text className="text-2xl font-bold text-primary">QR Attendance</Text>
        <Text className="mt-2 text-sm text-slate-600">Generate a class QR for today.</Text>
        <View className="mt-6">
          <ScreenSkeleton />
        </View>
      </View>
    );
  }

  if (subjectsQuery.isError) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 p-6">
        <Text className="text-lg font-bold text-slate-900">Could not load subjects</Text>
        <Text className="mt-2 text-center text-sm text-slate-500">Check your connection and try again.</Text>
        <Pressable className="mt-5 rounded-xl bg-primary px-5 py-3" onPress={() => void subjectsQuery.refetch()}>
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
        <Text className="text-2xl font-bold text-primary">QR Attendance</Text>
        <Text className="mt-2 text-sm text-slate-600">Generate a scannable QR for the selected class.</Text>

        <View className="mt-6 gap-4">
          <Pressable className="rounded-2xl bg-white p-4" onPress={() => setPickerOpen(true)}>
            <Text className="text-xs font-medium text-slate-500">Subject</Text>
            <Text className="mt-1 text-base font-bold text-slate-900">
              {selectedSubject ? `${selectedSubject.name} (${selectedSubject.code})` : 'Select subject'}
            </Text>
          </Pressable>

          <View className="flex-row gap-3">
            <View className="flex-1 rounded-2xl bg-white p-4">
              <Text className="text-xs font-medium text-slate-500">Date</Text>
              <TextInput className="mt-1 text-base font-bold text-slate-900" value={date} onChangeText={setDate} />
              {date && !isDateValid ? <Text className="mt-2 text-xs font-semibold text-red-600">Please enter a valid date.</Text> : null}
            </View>
            <View className="w-28 rounded-2xl bg-white p-4">
              <Text className="text-xs font-medium text-slate-500">Minutes</Text>
              <TextInput
                className="mt-1 text-base font-bold text-slate-900"
                keyboardType="number-pad"
                value={validMinutes}
                onChangeText={setValidMinutes}
              />
            </View>
          </View>

          <Pressable
            className={`rounded-xl px-5 py-4 ${selectedSubject && isDateValid ? 'bg-primary' : 'bg-slate-300'}`}
            disabled={!selectedSubject || !isDateValid || generateMutation.isPending}
            onPress={() => generateMutation.mutate()}
          >
            <Text className="text-center font-bold text-white">{generateMutation.isPending ? 'Generating...' : 'Generate QR'}</Text>
          </Pressable>
        </View>

        {generateMutation.isError ? (
          <View className="mt-5 rounded-2xl bg-red-50 p-4">
            <Text className="font-bold text-red-700">Could not generate QR</Text>
            <Text className="mt-1 text-sm text-red-600">Check the selected subject and try again.</Text>
          </View>
        ) : null}

        <View className="mt-6 rounded-2xl bg-white p-5">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-sm font-semibold text-slate-500">Expires in</Text>
              <Text className="mt-1 text-3xl font-bold text-slate-900">{generatedQr ? formatCountdown(secondsRemaining) : '--:--'}</Text>
            </View>
            <Pressable className="rounded-xl bg-slate-100 px-4 py-3" disabled={!selectedSubject || !isDateValid} onPress={() => generateMutation.mutate()}>
              <Text className="text-sm font-bold text-primary">Regenerate</Text>
            </Pressable>
          </View>

          {generatedQr?.qrCode ? (
            <Image className="mt-6 aspect-square w-full rounded-2xl bg-white" resizeMode="contain" source={{ uri: generatedQr.qrCode }} />
          ) : (
            <View className="mt-6 aspect-square w-full items-center justify-center rounded-2xl bg-slate-100">
              <Text className="text-sm font-semibold text-slate-500">QR will appear here</Text>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal animationType="slide" transparent visible={pickerOpen} onRequestClose={() => setPickerOpen(false)}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setPickerOpen(false)}>
          <Pressable className="max-h-[75%] rounded-t-3xl bg-white p-6" onPress={(event) => event.stopPropagation()}>
            <View className="h-1 w-12 self-center rounded-full bg-slate-200" />
            <Text className="mt-6 text-xl font-bold text-slate-900">Select subject</Text>
            <ScrollView className="mt-4">
              {(subjectsQuery.data ?? []).map((subject) => (
                <Pressable
                  className="border-b border-slate-100 py-4"
                  key={subject.id}
                  onPress={() => {
                    setSelectedSubject(subject);
                    setPickerOpen(false);
                  }}
                >
                  <Text className="text-base font-bold text-slate-900">{subject.name}</Text>
                  <Text className="mt-1 text-sm text-slate-500">{subject.code}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
