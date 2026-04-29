import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';

import { AppButton } from '@/src/components/AppButton';
import { COLORS } from '@/src/constants/colors';
import { useAuth } from '@/src/hooks/useAuth';
import { api } from '@/src/services/api';
import type { GateWindow } from '@/src/types/gatekeeper';

interface GateSettingsResponse {
  windows: GateWindow[];
  scannedToday?: number;
  todayScans?: number;
  scanCount?: number;
}

const dayNames: GateWindow['dayOfWeek'][] = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

const getMinutes = (time: string) => {
  const [hours, minutes] = time.split(':').map((part) => Number(part));
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
};

const formatTime = (date: Date) =>
  new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(date);

const isWindowOpen = (window: GateWindow, now: Date) => {
  if (!window.isActive || window.dayOfWeek !== dayNames[now.getDay()]) return false;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  return currentMinutes >= getMinutes(window.startTime) && currentMinutes <= getMinutes(window.endTime);
};

const WindowSkeleton = () => (
  <View className="rounded-2xl bg-white p-5">
    <View className="h-5 w-2/3 rounded-full bg-slate-200" />
    <View className="mt-3 h-4 w-1/2 rounded-full bg-slate-100" />
  </View>
);

export default function GatekeeperDashboardScreen() {
  const { isAuthenticated, user, logout } = useAuth();
  const [now, setNow] = useState(() => new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const today = dayNames[now.getDay()];

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const query = useQuery({
    queryKey: ['attendance', 'gate-settings', today],
    queryFn: async () => {
      const response = await api.get<GateSettingsResponse>(`/attendance/gate-settings?dayOfWeek=${today}`);
      return response.data;
    },
    enabled: isAuthenticated,
  });

  const todaysWindows = useMemo(
    () => (query.data?.windows ?? []).filter((window) => window.dayOfWeek === today && window.isActive),
    [query.data?.windows, today],
  );

  const openWindow = useMemo(() => todaysWindows.find((window) => isWindowOpen(window, now)) ?? null, [now, todaysWindows]);
  const scannedToday = query.data?.scannedToday ?? query.data?.todayScans ?? query.data?.scanCount ?? 0;

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await query.refetch();
      setNow(new Date());
    } finally {
      setIsRefreshing(false);
    }
  }, [query]);

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
      <View className="rounded-2xl bg-white p-5">
        <View className="flex-row items-start justify-between gap-4">
          <View className="flex-1">
            <Text className="text-sm font-semibold text-slate-500">Gatekeeper</Text>
            <Text className="mt-1 text-2xl font-bold text-primary">{user?.name ?? 'Gatekeeper'}</Text>
          </View>
          <View className={`rounded-full px-3 py-1 ${openWindow ? 'bg-green-100' : 'bg-red-100'}`}>
            <Text className={`text-xs font-bold ${openWindow ? 'text-green-700' : 'text-red-700'}`}>
              {openWindow ? 'Open' : 'Closed'}
            </Text>
          </View>
        </View>
        <Text className="mt-5 text-4xl font-bold text-slate-900">{formatTime(now)}</Text>
        <Text className="mt-2 text-sm text-slate-500">
          {openWindow ? `${openWindow.title} is active until ${openWindow.endTime}` : 'No gate scan window is active right now.'}
        </Text>
      </View>

      <View className="mt-4 rounded-2xl bg-primary p-5">
        <Text className="text-sm font-semibold text-blue-100">Students scanned today</Text>
        <Text className="mt-3 text-5xl font-bold text-white">{scannedToday}</Text>
        <Text className="mt-2 text-sm text-blue-100">Count appears when provided by the attendance API.</Text>
      </View>

      <View className="mt-6">
        <Text className="mb-3 text-lg font-bold text-slate-900">Today's Scan Windows</Text>
        {query.isLoading ? (
          <View className="gap-3">
            <WindowSkeleton />
            <WindowSkeleton />
          </View>
        ) : todaysWindows.length === 0 ? (
          <View className="rounded-2xl bg-white p-5">
            <Text className="text-base font-bold text-slate-900">No active windows today</Text>
            <Text className="mt-2 text-sm text-slate-500">Gate scanning remains closed until a window is scheduled.</Text>
          </View>
        ) : (
          <View className="gap-3">
            {todaysWindows.map((window) => {
              const active = isWindowOpen(window, now);

              return (
                <View className="rounded-2xl bg-white p-5" key={window.id}>
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1">
                      <Text className="text-base font-bold text-slate-900">{window.title}</Text>
                      <Text className="mt-1 text-sm text-slate-500">
                        {window.startTime} - {window.endTime}
                      </Text>
                    </View>
                    <View className={`rounded-full px-3 py-1 ${active ? 'bg-green-100' : 'bg-slate-100'}`}>
                      <Text className={`text-xs font-bold ${active ? 'text-green-700' : 'text-slate-600'}`}>
                        {active ? 'Now' : 'Scheduled'}
                      </Text>
                    </View>
                  </View>
                  <Text className="mt-3 text-sm font-semibold text-primary">
                    Semesters {window.allowedSemesters.join(', ') || '-'}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {query.error ? (
        <View className="mt-4 rounded-2xl bg-red-50 p-4">
          <Text className="text-sm font-semibold text-red-700">Unable to load gate settings.</Text>
        </View>
      ) : null}

      <View className="mt-6">
        <AppButton label="Logout" onPress={logout} />
      </View>
    </ScrollView>
  );
}
