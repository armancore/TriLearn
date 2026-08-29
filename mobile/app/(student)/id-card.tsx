import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { ActivityIndicator, Image, View } from 'react-native';

import { Avatar, Button, Card, Screen, StatTile, Text } from '@/src/components/ui';
import { api } from '@/src/services/api';
import { useTheme } from '@/src/theme/ThemeProvider';
import { radius } from '@/src/theme/tokens';
import type { ProfileResponse } from '@/src/types/profile';

interface StudentQrResponse {
  qrCode: string;
  qrData?: string;
  rollNumber?: string;
  expiresAt?: string;
}

export default function StudentIdCardScreen() {
  const { colors } = useTheme();

  const profileQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => (await api.get<ProfileResponse>('/auth/me')).data,
  });

  const qrQuery = useQuery({
    queryKey: ['student-id-qr'],
    queryFn: async () => (await api.get<StudentQrResponse>('/auth/student-id-qr')).data,
    staleTime: 60 * 60 * 1000,
    refetchOnMount: 'always',
  });

  const user = profileQuery.data?.user;
  const student = user?.student;

  const refreshQr = useCallback(async () => {
    await qrQuery.refetch();
  }, [qrQuery]);

  const onRefresh = useCallback(
    async () => Promise.all([profileQuery.refetch(), qrQuery.refetch()]),
    [profileQuery, qrQuery],
  );

  return (
    <Screen
      header={{ title: 'ID Card', subtitle: 'Show this QR code at the gate for attendance.' }}
      onRefresh={onRefresh}
    >
      <Card padding="none" style={{ overflow: 'hidden' }}>
        {/* Card face */}
        <View style={{ backgroundColor: colors.primary, padding: 22 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: 'rgba(255,255,255,0.78)' }} tone="inherit" uppercase variant="label">
                TriLearn
              </Text>
              <Text style={{ color: '#FFFFFF', marginTop: 2 }} tone="inherit" variant="bodyStrong">
                Student identity card
              </Text>
            </View>
            <Avatar name={user?.name} onPrimary size={48} />
          </View>

          <View style={{ marginTop: 26 }}>
            <Text style={{ color: 'rgba(255,255,255,0.78)' }} tone="inherit" uppercase variant="label">
              Card holder
            </Text>
            <Text numberOfLines={2} style={{ color: '#FFFFFF', marginTop: 6 }} tone="inherit" variant="title">
              {user?.name ?? 'Student'}
            </Text>
            <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.82)', marginTop: 4 }} tone="inherit" variant="caption">
              {user?.email ?? ''}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
            <StatTile label="Roll number" onPrimary value={student?.rollNumber ?? '—'} />
            <StatTile label="Department" onPrimary value={student?.department ?? '—'} />
            <StatTile
              label="Semester"
              onPrimary
              value={student?.semester ? `${student.semester}${student.section ? ` · ${student.section}` : ''}` : '—'}
            />
          </View>
        </View>

        {/* QR panel */}
        <View style={{ padding: 22, backgroundColor: colors.surface }}>
          {qrQuery.data?.qrCode ? (
            <Image
              accessibilityLabel="Your gate attendance QR code"
              resizeMode="contain"
              source={{ uri: qrQuery.data.qrCode }}
              style={{
                width: '100%',
                aspectRatio: 1,
                borderRadius: radius.md,
                // The code needs a white quiet zone to stay scannable in dark mode.
                backgroundColor: '#FFFFFF',
              }}
            />
          ) : (
            <View
              accessibilityLabel={qrQuery.isError ? 'QR code unavailable' : 'Loading your QR code'}
              accessibilityLiveRegion="polite"
              style={{
                width: '100%',
                aspectRatio: 1,
                borderRadius: radius.md,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.surfaceMuted,
                gap: 12,
              }}
            >
              {qrQuery.isError ? (
                <Text center tone="muted" variant="caption">
                  We could not generate your QR code.
                </Text>
              ) : (
                <>
                  <ActivityIndicator color={colors.primaryText} />
                  <Text tone="muted" variant="caption">
                    Generating QR code…
                  </Text>
                </>
              )}
            </View>
          )}

          <Text center style={{ marginTop: 16 }} variant="bodyStrong">
            Valid for 24 hours
          </Text>
          <Text center style={{ marginTop: 4 }} tone="subtle" variant="caption">
            Gatekeepers scan this code to record your gate attendance.
          </Text>

          <Button
            accessibilityHint="Generates a new QR code"
            icon="refresh"
            label="Refresh QR code"
            loading={qrQuery.isFetching}
            onPress={() => void refreshQr()}
            style={{ marginTop: 18 }}
            variant="secondary"
          />
        </View>
      </Card>
    </Screen>
  );
}
