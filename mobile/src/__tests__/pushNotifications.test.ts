import { describe, expect, it, jest } from '@jest/globals';

import { routeForNotification } from '@/src/services/pushNotifications';
import type { NotificationItem } from '@/src/types/notification';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

jest.mock('@/src/services/api', () => ({
  api: { patch: jest.fn() },
}));

jest.mock('@/src/services/queryClient', () => ({
  queryClient: { invalidateQueries: jest.fn() },
}));

jest.mock('@/src/store/notifications.store', () => ({
  useNotificationsStore: {
    getState: () => ({
      addNotification: jest.fn(),
      markAsRead: jest.fn(),
    }),
  },
}));

const notification = (overrides: Partial<NotificationItem>): NotificationItem => ({
  id: 'notification-1',
  title: 'Title',
  message: 'Message',
  isRead: false,
  createdAt: new Date(0).toISOString(),
  type: 'GENERAL',
  link: null,
  ...overrides,
});

describe('routeForNotification', () => {
  it('allows known notification routes from payload links', () => {
    expect(routeForNotification(notification({ link: '/student/notices' }))).toBe('/(student)/notices');
  });

  it('rejects unexpected internal routes from payload links', () => {
    expect(routeForNotification(notification({ link: '/admin/users' }))).toBeUndefined();
  });

  it('still maps known notification types without trusting the link', () => {
    expect(routeForNotification(notification({ type: 'ASSIGNMENT_DUE', link: '/admin/users' }))).toBe(
      '/(student)/assignments',
    );
  });
});
