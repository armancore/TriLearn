import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { CameraView, type BarcodeScanningResult, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { AppButton } from '@/src/components/AppButton';
import { COLORS } from '@/src/constants/colors';
import { api } from '@/src/services/api';

type FlashState = {
  type: 'success' | 'error';
  message: string;
} | null;

const getQrType = (qrData: string): string | null => {
  try {
    const parsed = JSON.parse(qrData) as { payload?: { type?: unknown } };
    return typeof parsed.payload?.type === 'string' ? parsed.payload.type : null;
  } catch {
    return null;
  }
};

const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    return error.response?.data?.message || error.message || 'Could not mark attendance.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Could not mark attendance.';
};

export default function StudentScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [isScanning, setIsScanning] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [message, setMessage] = useState('Scan an instructor or gate attendance QR.');
  const [flash, setFlash] = useState<FlashState>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isProcessingRef = useRef(false);

  const scanMutation = useMutation({
    mutationFn: async (qrData: string) => {
      const endpoint = getQrType(qrData) === 'GATE_STUDENT_QR' ? '/attendance/scan-daily-qr' : '/attendance/scan-qr';
      const response = await api.post<{ message?: string }>(endpoint, { qrData });
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
    setMessage('Scan an instructor or gate attendance QR.');
    setIsFetching(false);
    setIsScanning(true);
  }, [clearResetTimer]);

  const scheduleAutoReset = useCallback(() => {
    clearResetTimer();
    resetTimerRef.current = setTimeout(() => {
      resetScanner();
    }, 1500);
  }, [clearResetTimer, resetScanner]);

  useEffect(() => () => {
    clearResetTimer();
    isProcessingRef.current = false;
  }, [clearResetTimer]);

  const handleBarcodeScanned = useCallback(async ({ data }: BarcodeScanningResult) => {
    if (isProcessingRef.current || !isScanning || !data) {
      return;
    }

    isProcessingRef.current = true;
    setIsFetching(true);
    setIsScanning(false);
    setMessage('Marking attendance...');
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
  }, [isScanning, scanMutation, scheduleAutoReset]);

  if (!permission) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 px-6">
        <Text className="text-center text-slate-600">Checking camera permission...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 px-6">
        <Ionicons color={COLORS.primary} name="camera-outline" size={44} />
        <Text className="mt-4 text-center text-lg font-bold text-slate-900">Camera permission required</Text>
        <Text className="mt-2 text-center text-sm text-slate-600">
          Student attendance scanning needs camera access to read class and gate QR codes.
        </Text>
        <View className="mt-6 w-full">
          <AppButton label="Allow camera" onPress={requestPermission} />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <CameraView
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        style={{ flex: 1 }}
        onBarcodeScanned={isScanning && !isFetching ? handleBarcodeScanned : undefined}
      />

      <View className="absolute inset-0 justify-between p-6" pointerEvents="box-none">
        <View className="rounded-2xl bg-black/60 p-4">
          <Text className="text-center text-base font-bold text-white">Student QR Scanner</Text>
          <Text className="mt-2 text-center text-sm text-slate-200">{message}</Text>
        </View>

        <View className="self-center rounded-3xl border-4 border-white/90 p-28" />

        <View className="rounded-2xl bg-black/60 p-4">
          <AppButton
            label={isScanning ? 'Scanning...' : 'Scan again'}
            disabled={isScanning}
            onPress={resetScanner}
          />
        </View>
      </View>

      {isScanning && isFetching ? (
        <View className="absolute inset-0 items-center justify-center bg-black/40">
          <View className="items-center rounded-2xl bg-black/70 px-6 py-5">
            <ActivityIndicator color="#FFFFFF" size="large" />
            <Text className="mt-3 text-sm font-bold text-white">Marking attendance...</Text>
          </View>
        </View>
      ) : null}

      {flash ? (
        <Animated.View
          entering={FadeIn.duration(120)}
          exiting={FadeOut.duration(160)}
          className={`absolute inset-0 items-center justify-center px-8 ${
            flash.type === 'success' ? 'bg-green-700/75' : 'bg-red-700/75'
          }`}
        >
          <Ionicons
            color="#FFFFFF"
            name={flash.type === 'success' ? 'checkmark-circle-outline' : 'alert-circle-outline'}
            size={54}
          />
          <Text className="mt-4 text-center text-lg font-black text-white">{flash.message}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}
