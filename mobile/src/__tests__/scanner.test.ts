import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import type { Mock } from 'jest-mock';

import { api } from '@/src/services/api';
import { ThemeProvider } from '@/src/theme/ThemeProvider';
import StudentScannerScreen from '../../app/(student)/scanner';

// The screen reads design tokens from context, so it needs the provider the
// real app mounts at the root.
const renderScanner = () =>
  render(React.createElement(ThemeProvider, null, React.createElement(StudentScannerScreen)));

type CameraViewProps = { onBarcodeScanned?: (event: { data: string }) => void };
type UseMutationOptions = { mutationFn: (value: string) => Promise<string> };
type ApiPostMock = Mock<(endpoint: string, body: { qrData: string }) => Promise<{ data: { message: string } }>>;

let cameraViewProps: CameraViewProps | null = null;

jest.mock('expo-camera', () => ({
  CameraView: jest.fn((props: CameraViewProps) => {
    cameraViewProps = props;
    return null;
  }),
  useCameraPermissions: jest.fn(() => [{ granted: true }, jest.fn()]),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Medium: 'medium' },
  NotificationFeedbackType: { Error: 'error' },
}));

jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native') as { View: unknown };

  return {
    __esModule: true,
    default: {
      View,
    },
    FadeIn: { duration: jest.fn(() => ({})) },
    FadeOut: { duration: jest.fn(() => ({})) },
  };
});

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('@tanstack/react-query', () => ({
  useMutation: jest.fn((options: UseMutationOptions) => ({
    isPending: false,
    mutateAsync: jest.fn((value: string) => options.mutationFn(value)),
  })),
}));

jest.mock('@/src/services/api', () => ({
  api: {
    post: jest.fn(),
  },
}));

describe('student QR scanner flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cameraViewProps = null;
  });

  it('parses a valid QR payload and calls the attendance API', async () => {
    const validQrPayload = JSON.stringify({
      payload: {
        subjectId: 'subject-1',
        instructorId: 'instructor-1',
        expiresAt: '2030-01-01T00:00:00.000Z',
      },
      signature: 'valid-signature',
    });
    (api.post as unknown as ApiPostMock).mockResolvedValueOnce({ data: { message: 'Marked present' } });

    renderScanner();

    await act(async () => {
      await cameraViewProps?.onBarcodeScanned?.({ data: validQrPayload });
    });

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/attendance/scan-qr', { qrData: validQrPayload });
    });
  });

  it('shows an error for malformed QR payloads without calling the attendance API', async () => {
    const screen = renderScanner();

    await act(async () => {
      await cameraViewProps?.onBarcodeScanned?.({ data: 'not-json' });
    });

    expect(api.post).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getAllByText('Scan a TriLearn attendance QR code.').length).toBeGreaterThan(0);
    });
  });
});
