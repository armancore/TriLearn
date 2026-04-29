import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { COLORS } from '@/src/constants/colors';
import { api } from '@/src/services/api';
import type { ProfileResponse } from '@/src/types/profile';

const QR_TTL_MS = 24 * 60 * 60 * 1000;

let cachedQr: { qrCode: string; rollNumber?: string; expiresAt: number } | null = null;

interface StudentQrResponse {
  qrCode: string;
  qrData?: string;
  rollNumber?: string;
  expiresAt?: string;
}

const getInitials = (name?: string) =>
  (name || 'Student')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export default function StudentIdCardScreen() {
  const [refreshing, setRefreshing] = useState(false);

  const profileQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => (await api.get<ProfileResponse>('/auth/me')).data,
  });

  const qrQuery = useQuery({
    queryKey: ['auth', 'student-id-qr'],
    queryFn: async () => {
      if (cachedQr && cachedQr.expiresAt > Date.now()) {
        return cachedQr;
      }

      const response = await api.get<StudentQrResponse>('/auth/student-id-qr');
      const expiresAt = response.data.expiresAt ? new Date(response.data.expiresAt).getTime() : Date.now() + QR_TTL_MS;
      cachedQr = {
        qrCode: response.data.qrCode,
        rollNumber: response.data.rollNumber,
        expiresAt,
      };
      return cachedQr;
    },
  });

  const user = profileQuery.data?.user;
  const student = user?.student;
  const initials = useMemo(() => getInitials(user?.name), [user?.name]);

  const refreshQr = useCallback(async () => {
    cachedQr = null;
    await qrQuery.refetch();
  }, [qrQuery]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([profileQuery.refetch(), refreshQr()]);
    } finally {
      setRefreshing(false);
    }
  }, [profileQuery, refreshQr]);

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      contentContainerStyle={{ padding: 24, paddingBottom: 32 }}
      refreshControl={<RefreshControl colors={[COLORS.primary]} refreshing={refreshing} tintColor={COLORS.primary} onRefresh={onRefresh} />}
    >
      <Text className="text-2xl font-bold text-primary">Student ID Card</Text>
      <Text className="mt-2 text-sm text-slate-600">Use this QR for gate attendance verification.</Text>

      <View className="mt-6 overflow-hidden rounded-3xl bg-primary">
        <View className="p-6">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-xs font-bold uppercase text-blue-100">TriLearn</Text>
              <Text className="mt-1 text-lg font-bold text-white">Student Identity Card</Text>
            </View>
            <View className="h-14 w-14 items-center justify-center rounded-2xl bg-white">
              <Text className="text-lg font-black text-primary">{initials}</Text>
            </View>
          </View>

          <View className="mt-8">
            <Text className="text-xs font-semibold uppercase text-blue-100">Card holder</Text>
            <Text className="mt-2 text-3xl font-black text-white">{user?.name ?? 'Student'}</Text>
            <Text className="mt-2 text-sm text-blue-100">{user?.email}</Text>
            <Text className="mt-1 text-sm font-bold text-white">{student?.rollNumber ?? '-'}</Text>
          </View>

          <View className="mt-6 flex-row gap-3">
            <View className="flex-1 rounded-2xl bg-white/10 p-4">
              <Text className="text-xs font-medium text-blue-100">Department</Text>
              <Text className="mt-1 text-sm font-bold text-white">{student?.department ?? '-'}</Text>
            </View>
            <View className="flex-1 rounded-2xl bg-white/10 p-4">
              <Text className="text-xs font-medium text-blue-100">Semester</Text>
              <Text className="mt-1 text-sm font-bold text-white">
                {student?.semester ? `Sem ${student.semester}` : '-'} {student?.section ? `• ${student.section}` : ''}
              </Text>
            </View>
          </View>
        </View>

        <View className="rounded-t-3xl bg-white p-6">
          {qrQuery.data?.qrCode ? (
            <Image className="aspect-square w-full rounded-2xl bg-white" resizeMode="contain" source={{ uri: qrQuery.data.qrCode }} />
          ) : (
            <View className="aspect-square w-full items-center justify-center rounded-2xl bg-slate-100">
              <Text className="text-sm font-semibold text-slate-500">Loading QR</Text>
            </View>
          )}
          <Text className="mt-4 text-center text-sm font-bold text-slate-900">Valid for 24 hours</Text>
          <Text className="mt-1 text-center text-xs text-slate-500">Gatekeepers scan this QR to mark gate attendance.</Text>
          <Pressable className="mt-5 rounded-xl bg-primary px-5 py-4" onPress={() => void refreshQr()}>
            <Text className="text-center font-bold text-white">Refresh QR</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}
