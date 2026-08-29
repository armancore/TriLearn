import { describe, expect, it, jest } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import { ThemeProvider } from '@/src/theme/ThemeProvider';
// Babel hoists the jest.mock calls below above this import, so the screen still
// resolves the mocked modules.
import StudentMoreScreen from '../../app/(student)/more';

// `jest.mock` factories are hoisted above these declarations, and Jest only
// permits out-of-scope references whose names begin with `mock`.
const mockPush = jest.fn();
const mockLogout = jest.fn();

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), canGoBack: () => false, back: () => {} },
}));

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

// The UI barrel pulls in Skeleton, which imports Reanimated; its native
// worklets runtime does not exist under Jest.
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native') as { View: unknown };

  return {
    __esModule: true,
    default: { View },
    cancelAnimation: () => {},
    useAnimatedStyle: () => ({}),
    useSharedValue: (value: unknown) => ({ value }),
    withRepeat: (value: unknown) => value,
    withTiming: (value: unknown) => value,
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('expo-constants', () => ({ expoConfig: { version: '1.0.0' } }));

jest.mock('@/src/hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      name: 'Asha Rai',
      email: 'asha@college.edu',
      role: 'STUDENT',
      student: { rollNumber: 'CS2026001', semester: 4, department: 'Computer Science' },
    },
    logout: mockLogout,
  }),
}));

jest.mock('@/src/store/notifications.store', () => ({
  useNotificationsStore: (selector: (state: { unreadCount: number }) => unknown) =>
    selector({ unreadCount: 3 }),
}));

const renderMore = () =>
  render(
    <ThemeProvider>
      <StudentMoreScreen />
    </ThemeProvider>,
  );

describe('student More screen', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockLogout.mockClear();
  });

  it('groups every destination under a labelled heading', () => {
    renderMore();

    for (const group of ['Academic', 'Campus', 'Preferences', 'Account']) {
      expect(screen.getByText(group)).toBeTruthy();
    }
  });

  it('lists every secondary destination exactly once', () => {
    renderMore();

    const destinations = [
      'Routine',
      'Materials',
      'Notices',
      'ID card',
      'Scanner',
      'Support tickets',
      'Notifications',
      'Profile and security',
      'Sign out',
    ];

    for (const label of destinations) {
      expect(screen.getAllByText(label)).toHaveLength(1);
    }
  });

  it('shows who is signed in, with their roll number', () => {
    renderMore();

    expect(screen.getByText('Asha Rai')).toBeTruthy();
    expect(screen.getByText('asha@college.edu')).toBeTruthy();
    expect(screen.getByText('CS2026001')).toBeTruthy();
  });

  it('surfaces the unread notification count', () => {
    renderMore();

    expect(screen.getByText('3 new')).toBeTruthy();
  });

  it('navigates to the tapped destination', () => {
    renderMore();

    fireEvent.press(screen.getByText('Routine'));
    expect(mockPush).toHaveBeenCalledWith('/(student)/routine');

    fireEvent.press(screen.getByText('ID card'));
    expect(mockPush).toHaveBeenCalledWith('/(student)/id-card');
  });

  /** Signing out must confirm first — a stray tap should not end the session. */
  it('confirms before signing out rather than logging straight out', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    renderMore();

    fireEvent.press(screen.getByText('Sign out'));

    expect(mockLogout).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalled();

    // The destructive button in the confirm dialog is the one that signs out.
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    buttons.find((button) => button.text === 'Sign out')?.onPress?.();
    expect(mockLogout).toHaveBeenCalled();

    alert.mockRestore();
  });

  it('shows the app version', () => {
    renderMore();

    expect(screen.getByText('Version 1.0.0')).toBeTruthy();
  });
});
