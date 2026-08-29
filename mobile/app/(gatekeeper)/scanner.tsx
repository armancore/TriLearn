import { CameraView, type BarcodeScanningResult, useCameraPermissions } from 'expo-camera';
import { AxiosError } from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { useNetInfo } from '@react-native-community/netinfo';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Button, Text } from '@/src/components/ui';
import { api } from '@/src/services/api';
import { useTheme } from '@/src/theme/ThemeProvider';
import { radius } from '@/src/theme/tokens';
import type { ScanResult } from '@/src/types/gatekeeper';

interface ApiErrorResponse {
  message?: string;
}

interface ScanResponse {
  message: string;
  student?: {
    id: string;
    name: string;
    rollNumber: string;
    department?: string | null;
    semester: number;
  };
}

type OverlayState = { type: 'success'; result: ScanResult } | { type: 'error'; message: string };

const OVERLAY_DISMISS_MS = 3000;

const ABSOLUTE_FILL = { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 };

const buildScanResult = (response: ScanResponse): ScanResult => ({
  studentId: response.student?.id ?? '',
  name: response.student?.name ?? 'Student',
  rollNumber: response.student?.rollNumber ?? '—',
  department: response.student?.department ?? '—',
  semester: response.student?.semester ?? 0,
  message: response.message || 'Attendance marked',
});

const getErrorMessage = (error: unknown) => {
  const apiError = error as AxiosError<ApiErrorResponse>;

  if (apiError.response?.status === 429) {
    return 'Too many scans in a row. Wait a moment and try again.';
  }

  return apiError.response?.data?.message ?? 'Could not mark attendance. Please try again.';
};

export default function GatekeeperScannerScreen() {
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [overlay, setOverlay] = useState<OverlayState | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { isConnected } = useNetInfo();
  const isOffline = isConnected === false;

  const isScannerLocked = Boolean(overlay) || isOffline;

  const mutation = useMutation({
    mutationFn: async (body: { qrData: string }) =>
      (await api.post<ScanResponse>('/attendance/scan-student-id', body)).data,
    onSuccess: (data) => setOverlay({ type: 'success', result: buildScanResult(data) }),
    onError: (error) => setOverlay({ type: 'error', message: getErrorMessage(error) }),
  });

  useEffect(() => {
    void requestPermission();
  }, [requestPermission]);

  useEffect(() => {
    if (!overlay) {
      return undefined;
    }

    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
    }

    dismissTimer.current = setTimeout(() => setOverlay(null), OVERLAY_DISMISS_MS);

    return () => {
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
      }
    };
  }, [overlay]);

  const handleBarcodeScanned = useCallback(
    ({ data }: BarcodeScanningResult) => {
      if (isScannerLocked || mutation.isPending || !data) {
        return;
      }

      mutation.mutate({ qrData: data });
    },
    [isScannerLocked, mutation],
  );

  if (!permission) {
    return (
      <View
        accessibilityLiveRegion="polite"
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 28,
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator color={colors.primaryText} size="large" />
        <Text style={{ marginTop: 14 }} tone="muted" variant="caption">
          Preparing the camera…
        </Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 28,
          backgroundColor: colors.background,
        }}
      >
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: radius.full,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.primarySoft,
          }}
        >
          <Ionicons color={colors.primarySoftText} name="camera-outline" size={32} />
        </View>
        <Text accessibilityRole="header" center style={{ marginTop: 18 }} variant="heading">
          Camera access needed
        </Text>
        <Text center style={{ marginTop: 8, maxWidth: 320 }} tone="muted" variant="caption">
          Gate attendance scanning needs permission to use the camera to read student ID codes.
        </Text>
        <Button
          fullWidth={false}
          icon="camera"
          label="Allow camera access"
          onPress={requestPermission}
          style={{ marginTop: 22 }}
        />
      </View>
    );
  }

  const isSuccess = overlay?.type === 'success';

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      <CameraView
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        facing="back"
        onBarcodeScanned={isScannerLocked || mutation.isPending ? undefined : handleBarcodeScanned}
        style={{ flex: 1 }}
      />

      <View style={{ ...ABSOLUTE_FILL, justifyContent: 'space-between', padding: 24, pointerEvents: 'box-none' }}>
        <View style={{ padding: 16, borderRadius: radius.lg, backgroundColor: 'rgba(0,0,0,0.66)' }}>
          <Text accessibilityRole="header" style={{ color: '#FFFFFF' }} tone="inherit" variant="heading">
            Scan student QR
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.86)', marginTop: 4 }} tone="inherit" variant="caption">
            Point the camera at a TriLearn student ID code.
          </Text>
        </View>

        {/* Reticle — decorative; the instructions above carry the meaning. */}
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            alignSelf: 'center',
            width: 248,
            height: 248,
            borderRadius: radius['2xl'],
            borderWidth: 3,
            borderColor: 'rgba(255,255,255,0.92)',
          }}
        />

        <View style={{ padding: 16, borderRadius: radius.lg, backgroundColor: 'rgba(0,0,0,0.66)' }}>
          <Text center style={{ color: '#FFFFFF' }} tone="inherit" variant="caption">
            Student ID codes only
          </Text>
          {isOffline ? (
            <Text center style={{ color: '#FBBF4C', marginTop: 6 }} tone="inherit" variant="caption">
              Scanning is unavailable while offline.
            </Text>
          ) : null}
        </View>
      </View>

      {overlay ? (
        <View
          accessibilityLiveRegion="assertive"
          style={{ position: 'absolute', left: 24, right: 24, top: 100, pointerEvents: 'none' }}
        >
          <View
            style={{
              padding: 20,
              borderRadius: radius.lg,
              borderWidth: 2,
              // Opaque fills so the result stays readable over any camera feed.
              backgroundColor: isSuccess ? '#F0FBF4' : '#FDF0EE',
              borderColor: isSuccess ? '#15803D' : '#B42318',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons
                color={isSuccess ? '#14622F' : '#912018'}
                name={isSuccess ? 'checkmark-circle' : 'alert-circle'}
                size={24}
              />
              <Text
                style={{ color: isSuccess ? '#14622F' : '#912018', flex: 1 }}
                tone="inherit"
                variant="subheading"
              >
                {isSuccess ? 'Attendance marked' : 'Scan failed'}
              </Text>
            </View>

            {overlay.type === 'success' ? (
              <>
                <Text style={{ color: '#14622F', marginTop: 12 }} tone="inherit" variant="heading">
                  {overlay.result.name}
                </Text>
                <Text style={{ color: '#14622F', marginTop: 4 }} tone="inherit" variant="caption">
                  {overlay.result.rollNumber} · {overlay.result.department} · Semester{' '}
                  {overlay.result.semester || '—'}
                </Text>
              </>
            ) : (
              <Text style={{ color: '#912018', marginTop: 10 }} tone="inherit" variant="caption">
                {overlay.message}
              </Text>
            )}
          </View>
        </View>
      ) : null}

      {mutation.isPending ? (
        <View
          style={{
            ...ABSOLUTE_FILL,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.35)',
          }}
        >
          <ActivityIndicator color="#FFFFFF" size="large" />
        </View>
      ) : null}
    </View>
  );
}
