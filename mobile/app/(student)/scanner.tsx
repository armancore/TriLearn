import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { CameraView, type BarcodeScanningResult, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Button, Text } from '@/src/components/ui';
import { useTheme } from '@/src/theme/ThemeProvider';
import { radius } from '@/src/theme/tokens';
import { api } from '@/src/services/api';

type FlashState = {
  type: 'success' | 'error';
  message: string;
} | null;

type AttendanceQrPayload = {
  type?: unknown;
  subjectId?: unknown;
  instructorId?: unknown;
  expiresAt?: unknown;
};

type ParsedAttendanceQr = {
  endpoint: '/attendance/scan-daily-qr' | '/attendance/scan-qr';
  qrData: string;
};

const IDLE_MESSAGE = 'Point the camera at an instructor or gate attendance QR code.';

/** Inlined so the overlays do not need a StyleSheet just for absolute fill. */
const ABSOLUTE_FILL = { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 };

const parseAttendanceQr = (qrData: string): ParsedAttendanceQr => {
  try {
    const parsed = JSON.parse(qrData) as { payload?: AttendanceQrPayload; signature?: unknown };
    const payload = parsed.payload;

    if (!payload || typeof payload !== 'object' || typeof parsed.signature !== 'string') {
      throw new Error('Scan a TriLearn attendance QR code.');
    }

    if (payload.type === 'GATE_STUDENT_QR') {
      return { endpoint: '/attendance/scan-daily-qr', qrData };
    }

    if (
      typeof payload.subjectId === 'string' &&
      typeof payload.instructorId === 'string' &&
      typeof payload.expiresAt === 'string'
    ) {
      return { endpoint: '/attendance/scan-qr', qrData };
    }

    throw new Error('Scan a TriLearn attendance QR code.');
  } catch {
    throw new Error('Scan a TriLearn attendance QR code.');
  }
};

const getErrorMessage = (error: unknown): string => {
  if (isAxiosError<{ message?: string }>(error)) {
    return error.response?.data?.message || error.message || 'Could not mark attendance.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Could not mark attendance.';
};

export default function StudentScannerScreen() {
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [isScanning, setIsScanning] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [message, setMessage] = useState(IDLE_MESSAGE);
  const [flash, setFlash] = useState<FlashState>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isProcessingRef = useRef(false);

  const scanMutation = useMutation({
    mutationFn: async (qrData: string) => {
      const parsedQr = parseAttendanceQr(qrData);
      const response = await api.post<{ message?: string }>(parsedQr.endpoint, { qrData: parsedQr.qrData });
      return response.data.message ?? 'Attendance marked successfully.';
    },
  });

  const clearResetTimer = useCallback(() => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  }, []);

  const resetScanner = useCallback(() => {
    clearResetTimer();
    isProcessingRef.current = false;
    setFlash(null);
    setMessage(IDLE_MESSAGE);
    setIsFetching(false);
    setIsScanning(true);
  }, [clearResetTimer]);

  const scheduleAutoReset = useCallback(() => {
    clearResetTimer();
    resetTimerRef.current = setTimeout(resetScanner, 1500);
  }, [clearResetTimer, resetScanner]);

  useEffect(
    () => () => {
      clearResetTimer();
      isProcessingRef.current = false;
    },
    [clearResetTimer],
  );

  const handleBarcodeScanned = useCallback(
    async ({ data }: BarcodeScanningResult) => {
      if (isProcessingRef.current || !isScanning || !data) {
        return;
      }

      isProcessingRef.current = true;
      setIsFetching(true);
      setIsScanning(false);
      setMessage('Marking attendance…');
      setFlash(null);

      try {
        const successMessage = await scanMutation.mutateAsync(data);
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setMessage(successMessage);
        setFlash({ type: 'success', message: successMessage });
      } catch (error) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        const errorMessage = getErrorMessage(error);
        setMessage(errorMessage);
        setFlash({ type: 'error', message: errorMessage });
      } finally {
        setIsFetching(false);
        scheduleAutoReset();
      }
    },
    [isScanning, scanMutation, scheduleAutoReset],
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
        <ActivityIndicator color={colors.primaryText} />
        <Text center style={{ marginTop: 14 }} tone="muted" variant="caption">
          Checking camera permission…
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
          Scanning attendance codes needs permission to use the camera. Nothing is recorded or
          uploaded except the code you scan.
        </Text>
        <Button
          accessibilityHint="Opens the system camera permission prompt"
          fullWidth={false}
          icon="camera"
          label="Allow camera access"
          onPress={requestPermission}
          style={{ marginTop: 22 }}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      <CameraView
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={isScanning && !isFetching ? handleBarcodeScanned : undefined}
        style={{ flex: 1 }}
      />

      <View style={{ ...ABSOLUTE_FILL, justifyContent: 'space-between', padding: 24, pointerEvents: 'box-none' }}>
        <View
          accessibilityLiveRegion="polite"
          style={{ padding: 16, borderRadius: radius.lg, backgroundColor: 'rgba(0,0,0,0.66)' }}
        >
          <Text center style={{ color: '#FFFFFF' }} tone="inherit" variant="bodyStrong">
            Attendance scanner
          </Text>
          <Text center style={{ color: 'rgba(255,255,255,0.86)', marginTop: 6 }} tone="inherit" variant="caption">
            {message}
          </Text>
        </View>

        {/* Reticle — decorative, the instructions above carry the meaning. */}
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            alignSelf: 'center',
            width: 232,
            height: 232,
            borderRadius: radius['2xl'],
            borderWidth: 3,
            borderColor: 'rgba(255,255,255,0.92)',
          }}
        />

        <View style={{ padding: 16, borderRadius: radius.lg, backgroundColor: 'rgba(0,0,0,0.66)' }}>
          <Button
            accessibilityHint="Re-enables scanning after a result"
            disabled={isScanning}
            icon="scan"
            label={isScanning ? 'Ready to scan' : 'Scan again'}
            onPress={resetScanner}
          />
        </View>
      </View>

      {isScanning && isFetching ? (
        <View
          style={{
            ...ABSOLUTE_FILL,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.45)',
          }}
        >
          <View
            style={{
              alignItems: 'center',
              paddingHorizontal: 26,
              paddingVertical: 22,
              borderRadius: radius.lg,
              backgroundColor: 'rgba(0,0,0,0.78)',
            }}
          >
            <ActivityIndicator color="#FFFFFF" size="large" />
            <Text style={{ color: '#FFFFFF', marginTop: 12 }} tone="inherit" variant="bodyStrong">
              Marking attendance…
            </Text>
          </View>
        </View>
      ) : null}

      {flash ? (
        <Animated.View
          accessibilityLiveRegion="assertive"
          entering={FadeIn.duration(120)}
          exiting={FadeOut.duration(160)}
          style={{
            ...ABSOLUTE_FILL,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 32,
            // Deep, opaque fills so the result reads clearly over any camera feed.
            backgroundColor: flash.type === 'success' ? 'rgba(12,88,44,0.92)' : 'rgba(140,26,20,0.92)',
          }}
        >
          <Ionicons
            color="#FFFFFF"
            name={flash.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
            size={58}
          />
          <Text center style={{ color: '#FFFFFF', marginTop: 16 }} tone="inherit" variant="heading">
            {flash.message}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}
