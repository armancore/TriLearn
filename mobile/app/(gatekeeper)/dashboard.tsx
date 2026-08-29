import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, View } from 'react-native';

import {
  Badge,
  Card,
  IconButton,
  InlineNotice,
  ProgressBar,
  Screen,
  SkeletonCard,
  StatTile,
  Text,
} from '@/src/components/ui';
import { useAuth } from '@/src/hooks/useAuth';
import { api } from '@/src/services/api';
import { useTheme } from '@/src/theme/ThemeProvider';
import { radius } from '@/src/theme/tokens';

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
  periods?: {
    id: string;
    title: string;
    startTime: string;
    endTime: string;
    allowedSemesters: number[];
  }[];
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

const secondsUntil = (value?: string) =>
  value ? Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 1000)) : 0;

const formatCountdown = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

export default function GatekeeperDashboardScreen() {
  const { colors } = useTheme();
  const { isAuthenticated, user } = useAuth();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const query = useQuery({
    queryKey: ['attendance', 'gatekeeper', 'live-qr'],
    queryFn: async () => (await api.get<LiveGateQrResponse>('/attendance/gatekeeper/live-qr')).data,
    enabled: isAuthenticated,
    refetchInterval: (data) => {
      const refreshInSeconds = data.state.data?.refreshInSeconds;
      return refreshInSeconds ? Math.max(1000, refreshInSeconds * 1000) : 30000;
    },
  });

  const secondsLeft = secondsUntil(query.data?.expiresAt);
  const refreshWindow = query.data?.refreshInSeconds ?? 0;

  const allowedSemesters = useMemo(
    () => [...new Set(query.data?.allowedSemesters ?? [])],
    [query.data?.allowedSemesters],
  );

  const onRefresh = useCallback(async () => {
    await query.refetch();
    setNow(new Date());
  }, [query]);

  const isActive = Boolean(query.data?.active && query.data.qrCode);

  return (
    <Screen
      header={{
        title: 'Gate QR',
        subtitle: `Gate attendance · ${formatClock(now)}`,
        showBack: false,
        actions: (
          <IconButton
            accessibilityLabel="Scan a student ID code"
            icon="scan-outline"
            onPress={() => router.push('/(gatekeeper)/scanner')}
            variant="solid"
          />
        ),
      }}
      onRefresh={onRefresh}
    >
      {query.isError ? (
        <View style={{ marginBottom: 16 }}>
          <InlineNotice
            description="Pull down to retry."
            title="Could not load the gate QR"
            tone="danger"
          />
        </View>
      ) : null}

      {query.isLoading ? (
        <SkeletonCard lines={1} showFooter />
      ) : (
        <Card padding="lg">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Text variant="heading">Student gate QR</Text>
            <Badge
              icon={isActive ? 'radio-button-on' : 'lock-closed'}
              label={isActive ? 'Live' : 'Closed'}
              tone={isActive ? 'success' : 'neutral'}
            />
          </View>

          {isActive ? (
            <>
              <Image
                accessibilityLabel="Live gate attendance QR code"
                resizeMode="contain"
                source={{ uri: query.data?.qrCode }}
                style={{
                  width: '100%',
                  aspectRatio: 1,
                  marginTop: 18,
                  borderRadius: radius.lg,
                  // Students scan this from a distance — keep the quiet zone white.
                  backgroundColor: '#FFFFFF',
                }}
              />

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
                <StatTile
                  icon="refresh-outline"
                  label="Refreshes in"
                  value={formatCountdown(secondsLeft)}
                />
                <StatTile
                  icon="layers-outline"
                  label="Semesters"
                  value={allowedSemesters.join(', ') || 'All'}
                />
              </View>

              {refreshWindow > 0 ? (
                <ProgressBar
                  label="Time until this code refreshes"
                  style={{ marginTop: 14 }}
                  value={(secondsLeft / refreshWindow) * 100}
                />
              ) : null}
            </>
          ) : (
            <View
              accessibilityLiveRegion="polite"
              style={{
                width: '100%',
                aspectRatio: 1,
                marginTop: 18,
                padding: 24,
                borderRadius: radius.lg,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.surfaceMuted,
              }}
            >
              <Ionicons
                color={colors.textSubtle}
                name={query.data?.holiday ? 'calendar-outline' : 'lock-closed-outline'}
                size={40}
              />
              <Text center style={{ marginTop: 14 }} variant="subheading">
                {query.data?.holiday ? 'Holiday' : 'Gate QR inactive'}
              </Text>
              <Text center style={{ marginTop: 6, maxWidth: 280 }} tone="muted" variant="caption">
                {query.data?.holidayInfo?.title ??
                  (query.data?.nextWindow
                    ? `Next window ${query.data.nextWindow.startTime} – ${query.data.nextWindow.endTime}`
                    : 'No attendance window is open right now.')}
              </Text>
            </View>
          )}
        </Card>
      )}

      {query.data?.periods?.length ? (
        <Card padding="lg" style={{ marginTop: 16 }}>
          <Text tone="muted" uppercase variant="label">
            Today’s windows
          </Text>
          <View style={{ gap: 10, marginTop: 12 }}>
            {query.data.periods.map((period) => (
              <View
                key={period.id}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
              >
                <Text numberOfLines={1} style={{ flex: 1 }} variant="bodyStrong">
                  {period.title}
                </Text>
                <Text tone="muted" variant="caption">
                  {period.startTime} – {period.endTime}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <Text center style={{ marginTop: 20 }} tone="subtle" variant="caption">
        Signed in as {user?.name ?? 'Gatekeeper'}
      </Text>
    </Screen>
  );
}
