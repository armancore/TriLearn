import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { COLORS } from '@/src/constants/colors';
import { useAuth } from '@/src/hooks/useAuth';
import { api } from '@/src/services/api';

interface LiveGateQrResponse {
  active: boolean;
  holiday?: boolean;
  qrCode?: string;
  qrData?: string;
  dayOfWeek?: string;
  serverTime?: string;
  expiresAt?: string;
  refreshInSeconds?: number;
  allowedSemesters?: number[];
  periods?: Array<{
    id: string;
    title: string;
    startTime: string;
    endTime: string;
    allowedSemesters: number[];
  }>;
  nextWindow?: {
    title?: string;
    startTime: string;
    endTime: string;
    startsAt?: string;
    allowedSemesters?: number[];
  } | null;
  holidayInfo?: {
    title: string;
    date: string;
  };
}

const formatClock = (date: Date) =>
  new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(date);

const secondsUntil = (value?: string) => {
  if (!value) return 0;
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 1000));
};

const formatCountdown = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
};

export default function GatekeeperDashboardScreen() {
  const { isAuthenticated, user } = useAuth();
  const [now, setNow] = useState(() => new Date());
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const query = useQuery({
    queryKey: ['attendance', 'gatekeeper', 'live-qr'],
    queryFn: async () => {
      const response = await api.get<LiveGateQrResponse>('/attendance/gatekeeper/live-qr');
      return response.data;
    },
    enabled: isAuthenticated,
    refetchInterval: (data) => {
      const refreshInSeconds = data.state.data?.refreshInSeconds;
      return refreshInSeconds ? Math.max(1000, refreshInSeconds * 1000) : 30000;
    },
  });

  const secondsLeft = secondsUntil(query.data?.expiresAt);
  const activePeriods = query.data?.periods ?? [];
  const allowedSemesters = useMemo(
    () => [...new Set(activePeriods.flatMap((period) => period.allowedSemesters).concat(query.data?.allowedSemesters ?? []))],
    [activePeriods, query.data?.allowedSemesters],
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await query.refetch();
      setNow(new Date());
    } finally {
      setRefreshing(false);
    }
  }, [query]);

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      contentContainerStyle={{ padding: 20, paddingBottom: 28 }}
      refreshControl={<RefreshControl colors={[COLORS.primary]} refreshing={refreshing} tintColor={COLORS.primary} onRefresh={handleRefresh} />}
    >
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="text-sm font-semibold text-slate-500">Gate attendance</Text>
          <Text className="mt-1 text-2xl font-bold text-primary">{formatClock(now)}</Text>
        </View>
        <Pressable
          accessibilityLabel="Scan student ID"
          className="h-12 w-12 items-center justify-center rounded-full bg-primary active:opacity-80"
          onPress={() => router.push('/(gatekeeper)/scanner')}
        >
          <Ionicons color="#FFFFFF" name="scan-outline" size={24} />
        </Pressable>
      </View>

      <View className="mt-5 rounded-3xl bg-white p-5">
        <View className="flex-row items-center justify-between">
          <Text className="text-lg font-bold text-slate-900">Student Gate QR</Text>
          <View className={`rounded-full px-3 py-1 ${query.data?.active ? 'bg-green-100' : 'bg-slate-100'}`}>
            <Text className={`text-xs font-bold ${query.data?.active ? 'text-green-700' : 'text-slate-600'}`}>
              {query.data?.active ? 'Live' : 'Closed'}
            </Text>
          </View>
        </View>

        {query.isLoading ? (
          <View className="mt-6 aspect-square w-full items-center justify-center rounded-3xl bg-slate-100">
            <Text className="text-sm font-semibold text-slate-500">Loading QR...</Text>
          </View>
        ) : query.data?.active && query.data.qrCode ? (
          <>
            <Image className="mt-5 aspect-square w-full rounded-3xl bg-white" resizeMode="contain" source={{ uri: query.data.qrCode }} />
            <View className="mt-5 flex-row gap-3">
              <View className="flex-1 rounded-2xl bg-primary p-4">
                <Text className="text-xs font-medium text-blue-100">Refreshes in</Text>
                <Text className="mt-1 text-3xl font-bold text-white">{formatCountdown(secondsLeft)}</Text>
              </View>
              <View className="flex-1 rounded-2xl bg-slate-100 p-4">
                <Text className="text-xs font-medium text-slate-500">Semesters</Text>
                <Text className="mt-1 text-lg font-bold text-slate-900">{allowedSemesters.join(', ') || '-'}</Text>
              </View>
            </View>
          </>
        ) : (
          <View className="mt-6 aspect-square w-full items-center justify-center rounded-3xl bg-slate-100 p-6">
            <Ionicons color={COLORS.muted} name={query.data?.holiday ? 'calendar-outline' : 'lock-closed-outline'} size={42} />
            <Text className="mt-4 text-center text-lg font-bold text-slate-900">
              {query.data?.holiday ? 'Holiday' : 'Gate QR inactive'}
            </Text>
            <Text className="mt-2 text-center text-sm text-slate-500">
              {query.data?.holidayInfo?.title
                ?? (query.data?.nextWindow
                  ? `Next window ${query.data.nextWindow.startTime} - ${query.data.nextWindow.endTime}`
                  : 'No active attendance window right now.')}
            </Text>
          </View>
        )}
      </View>

      <View className="mt-5 rounded-3xl bg-white p-5">
        <Text className="text-lg font-bold text-slate-900">Active Periods</Text>
        {activePeriods.length ? (
          <View className="mt-3 gap-3">
            {activePeriods.map((period) => (
              <View className="rounded-2xl bg-slate-100 p-4" key={period.id}>
                <Text className="text-base font-bold text-slate-900">{period.title}</Text>
                <Text className="mt-1 text-sm text-slate-600">{period.startTime} - {period.endTime}</Text>
                <Text className="mt-2 text-sm font-semibold text-primary">Semesters {period.allowedSemesters.join(', ') || '-'}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text className="mt-3 text-sm text-slate-500">Active windows will appear here when gate attendance is open.</Text>
        )}
      </View>

      {query.isError ? (
        <View className="mt-5 rounded-2xl bg-red-50 p-4">
          <Text className="text-sm font-semibold text-red-700">Unable to load the gate QR. Pull down to retry.</Text>
        </View>
      ) : null}

      <Text className="mt-5 text-center text-xs text-slate-400">
        Logged in as {user?.name ?? 'Gatekeeper'}
      </Text>
    </ScrollView>
  );
}
