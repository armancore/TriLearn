import { Ionicons } from '@expo/vector-icons';
import { CameraView, type BarcodeScanningResult, useCameraPermissions } from 'expo-camera';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { AppButton } from '@/src/components/AppButton';
import { COLORS } from '@/src/constants/colors';
import { useToast } from '@/src/hooks/useToast';
import { api } from '@/src/services/api';

const getQrType = (qrData: string): string | null => {
  try {
    const parsed = JSON.parse(qrData) as { payload?: { type?: unknown } };
    return typeof parsed.payload?.type === 'string' ? parsed.payload.type : null;
  } catch {
    return null;
  }
};

export default function StudentScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [isScanning, setIsScanning] = useState(true);
  const [message, setMessage] = useState('Scan an instructor or gate attendance QR.');
  const toast = useToast();

  const handleBarcodeScanned = useCallback(async ({ data }: BarcodeScanningResult) => {
    if (!isScanning || !data) {
      return;
    }

    setIsScanning(false);
    setMessage('Marking attendance...');

    try {
      const endpoint = getQrType(data) === 'GATE_STUDENT_QR' ? '/attendance/scan-daily-qr' : '/attendance/scan-qr';
      const response = await api.post<{ message?: string }>(endpoint, { qrData: data });
      const successMessage = response.data.message ?? 'Attendance marked successfully.';
      setMessage(successMessage);
      toast.success(successMessage);
    } catch (error) {
      setMessage('Scan failed. Try again with a valid active QR.');
      toast.error(error, 'Could not mark attendance.');
    }
  }, [isScanning, toast]);

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
        onBarcodeScanned={isScanning ? handleBarcodeScanned : undefined}
      />
      <View className="absolute inset-0 justify-between p-6">
        <View className="rounded-2xl bg-black/60 p-4">
          <Text className="text-center text-base font-bold text-white">Student QR Scanner</Text>
          <Text className="mt-2 text-center text-sm text-slate-200">{message}</Text>
        </View>

        <View className="self-center rounded-3xl border-4 border-white/90 p-28" />

        <View className="rounded-2xl bg-black/60 p-4">
          <AppButton label={isScanning ? 'Scanning...' : 'Scan again'} disabled={isScanning} onPress={() => {
            setMessage('Scan an instructor or gate attendance QR.');
            setIsScanning(true);
          }} />
        </View>
      </View>
    </View>
  );
}
