import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { AuthUser } from '@/src/types/auth';
import { useAuthStore } from '@/src/store/auth.store';
import { openAuthenticatedUpload } from '@/src/utils/uploadFiles';

const mockDownloadAsync = jest.fn(async () => ({ status: 200, uri: 'file://download.pdf' }));
const mockShareAsync = jest.fn(async () => undefined);

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file://documents/',
  downloadAsync: (...args: unknown[]) => mockDownloadAsync(...args),
  deleteAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: (...args: unknown[]) => mockShareAsync(...args),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

jest.mock('@/src/services/queryClient', () => ({
  queryClient: {
    removeQueries: jest.fn(),
  },
}));

jest.mock('@/src/constants/config', () => ({
  BACKEND_ORIGIN: 'https://api.trilearn.test',
}));

const testUser: AuthUser = {
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  role: 'STUDENT',
  mustChangePassword: false,
  profileCompleted: true,
};

describe('openAuthenticatedUpload', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    useAuthStore.setState({
      user: testUser,
      accessToken: 'student-access-token',
      refreshToken: 'refresh-token',
      isHydrated: true,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not send the bearer token to external material URLs', async () => {
    await openAuthenticatedUpload('https://cdn.example.com/materials/week-1.pdf');

    expect(mockDownloadAsync).toHaveBeenCalledWith(
      'https://cdn.example.com/materials/week-1.pdf',
      expect.any(String),
      undefined
    );
  });

  it('sends the bearer token only for protected backend upload URLs', async () => {
    await openAuthenticatedUpload('/api/v1/uploads/week-1.pdf');

    expect(mockDownloadAsync).toHaveBeenCalledWith(
      'https://api.trilearn.test/api/v1/uploads/week-1.pdf',
      expect.any(String),
      {
        headers: {
          Authorization: 'Bearer student-access-token',
        },
      }
    );
  });
});
