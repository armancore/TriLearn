import { CameraView, type BarcodeScanningResult, useCameraPermissions } from 'expo-camera';
import { AxiosError } from 'axios';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';

import { AppButton } from '@/src/components/AppButton';
import { COLORS } from '@/src/constants/colors';
import { api } from '@/src/services/api';
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

type OverlayState =
  | { type: 'success'; result: ScanResult }
  | { type: 'error'; message: string };

const buildScanResult = (response: ScanResponse): ScanResult => ({
  studentId: response.student?.id ?? '',
  name: response.student?.name ?? 'Student',
  rollNumber: response.student?.rollNumber ?? '-',
  department: response.student?.department ?? '-',
  semester: response.student?.semester ?? 0,
  message: response.message || 'Attendance marked',
});

const getErrorMessage = (error: unknown) => {
  const apiError = error as AxiosError<ApiErrorResponse>;

  if (apiError.response?.status === 429) {
    return 'Too many scans';
  }

  return apiError.response?.data?.message ?? 'Unable to mark attendance. Please try again.';
};

export default function GatekeeperScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [overlay, setOverlay] = useState<OverlayState | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [rollNumber, setRollNumber] = useState('');
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isScannerLocked = Boolean(overlay);

  const mutation = useMutation({
    mutationFn: async (body: { qrData?: string; rollNumber?: string }) => {
      const response = await api.post<ScanResponse>('/attendance/scan-student-id', body);
      return response.data;
    },
    onSuccess: (data) => {
      setManualOpen(false);
      setRollNumber('');
      setOverlay({ type: 'success', result: buildScanResult(data) });
    },
    onError: (error) => {
      setOverlay({ type: 'error', message: getErrorMessage(error) });
    },
  });

  useEffect(() => {
    void requestPermission();
  }, [requestPermission]);

  useEffect(() => {
    if (!overlay) return undefined;

    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
    }

    dismissTimer.current = setTimeout(() => {
      setOverlay(null);
    }, 3000);

    return () => {
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
      }
    };
  }, [overlay]);

  const handleBarcodeScanned = useCallback(
    ({ data }: BarcodeScanningResult) => {
      if (isScannerLocked || mutation.isPending || !data) return;
      mutation.mutate({ qrData: data });
    },
    [isScannerLocked, mutation],
  );

  const handleManualSubmit = useCallback(() => {
    const value = rollNumber.trim();
    if (!value || mutation.isPending || isScannerLocked) return;
    mutation.mutate({ rollNumber: value });
  }, [isScannerLocked, mutation, rollNumber]);

  const overlayStyles = useMemo(() => {
    if (overlay?.type === 'success') {
      return {
        container: 'border-green-200 bg-green-50',
        title: 'text-green-800',
        body: 'text-green-700',
      };
    }

    return {
      container: 'border-red-200 bg-red-50',
      title: 'text-red-800',
      body: 'text-red-700',
    };
  }, [overlay?.type]);

  if (!permission) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-950 px-6">
        <ActivityIndicator color="#FFFFFF" size="large" />
        <Text className="mt-4 text-sm font-semibold text-white">Preparing camera...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 px-6">
        <View className="w-full rounded-2xl bg-white p-6">
          <Text className="text-2xl font-bold text-primary">Enable camera access</Text>
          <Text className="mt-3 text-sm text-slate-600">
            Gate attendance scanning needs camera permission to read student QR codes.
          </Text>
          <View className="mt-6">
            <AppButton label="Enable camera access" onPress={requestPermission} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-slate-950">
      <CameraView
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        facing="back"
        onBarcodeScanned={isScannerLocked || mutation.isPending ? undefined : handleBarcodeScanned}
        style={{ flex: 1 }}
      />
      <View className="absolute inset-0 justify-between p-6">
        <View className="rounded-2xl bg-black/50 p-4">
          <Text className="text-2xl font-bold text-white">Scan student QR</Text>
          <Text className="mt-2 text-sm text-slate-200">Point the camera at a TriLearn student ID code.</Text>
        </View>

        <View className="items-center">
          <View className="h-64 w-64 rounded-3xl border-4 border-white/90 bg-white/5" />
        </View>

        <View className="rounded-2xl bg-black/50 p-4">
          {manualOpen ? (
            <View>
              <Text className="mb-2 text-sm font-semibold text-white">Manual roll number</Text>
              <TextInput
                autoCapitalize="characters"
                className="h-12 rounded-xl bg-white px-4 text-base text-slate-900"
                editable={!mutation.isPending && !isScannerLocked}
                onChangeText={setRollNumber}
                placeholder="Enter roll number"
                placeholderTextColor="#9CA3AF"
                value={rollNumber}
              />
              <View className="mt-3 flex-row gap-3">
                <Pressable className="flex-1 rounded-xl bg-white/15 py-3" onPress={() => setManualOpen(false)}>
                  <Text className="text-center text-sm font-bold text-white">Cancel</Text>
                </Pressable>
                <Pressable
                  className="flex-1 rounded-xl bg-white py-3"
                  disabled={!rollNumber.trim() || mutation.isPending || isScannerLocked}
                  onPress={handleManualSubmit}
                >
                  <Text className="text-center text-sm font-bold text-primary">
                    {mutation.isPending ? 'Checking...' : 'Submit'}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable className="rounded-xl bg-white py-3" onPress={() => setManualOpen(true)}>
              <Text className="text-center text-sm font-bold text-primary">Enter roll number manually</Text>
            </Pressable>
          )}
        </View>
      </View>

      {overlay ? (
        <View className="absolute inset-x-6 top-24">
          <View className={`rounded-2xl border p-5 ${overlayStyles.container}`}>
            {overlay.type === 'success' ? (
              <>
                <Text className={`text-xl font-bold ${overlayStyles.title}`}>Attendance marked</Text>
                <Text className={`mt-2 text-base font-semibold ${overlayStyles.body}`}>{overlay.result.name}</Text>
                <Text className={`mt-1 text-sm ${overlayStyles.body}`}>
                  {overlay.result.rollNumber} - {overlay.result.department}
                </Text>
                <Text className={`mt-1 text-sm ${overlayStyles.body}`}>Semester {overlay.result.semester || '-'}</Text>
              </>
            ) : (
              <>
                <Text className={`text-xl font-bold ${overlayStyles.title}`}>Scan failed</Text>
                <Text className={`mt-2 text-sm ${overlayStyles.body}`}>{overlay.message}</Text>
              </>
            )}
          </View>
        </View>
      ) : null}

      {mutation.isPending ? (
        <View className="absolute inset-0 items-center justify-center bg-black/30">
          <ActivityIndicator color="#FFFFFF" size="large" />
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}
