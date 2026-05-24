import Constants from 'expo-constants';
import type { Notification, NotificationResponse } from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { Platform } from 'react-native';

import { api } from '@/src/services/api';
import { queryClient } from '@/src/services/queryClient';
import { useNotificationsStore } from '@/src/store/notifications.store';
import type { NotificationItem } from '@/src/types/notification';

const notificationRouteMap: Record<string, Href> = {
  notice: '/(student)/notices',
  notices: '/(student)/notices',
  NOTICE_POSTED: '/(student)/notices',
  assignment: '/(student)/assignments',
  assignments: '/(student)/assignments',
  ASSIGNMENT_DUE: '/(student)/assignments',
  material: '/(student)/materials',
  materials: '/(student)/materials',
  marks: '/(student)/marks',
  MARKS_PUBLISHED: '/(student)/marks',
  attendance: '/(student)/attendance',
  ABSENCE_TICKET_REVIEWED: '/(student)/attendance',
  routine: '/(student)/routine',
  ROUTINE_UPDATED: '/(student)/routine',
  ticket: '/(student)/tickets',
  tickets: '/(student)/tickets',
};

const allowedNotificationRoutes = new Set<string>(Object.values(notificationRouteMap) as string[]);

export const isPushUnsupportedRuntime = Constants.appOwnership === 'expo' && Platform.OS === 'android';

const notificationRouteForType = (type: string): Href | undefined =>
  notificationRouteMap[type] ?? notificationRouteMap[type.toLowerCase()];

const routeFromLink = (link: string | null): Href | undefined => {
  if (!link?.startsWith('/')) {
    return undefined;
  }

  const normalizedLink = link.replace(/^\/(student|instructor|coordinator|admin|gatekeeper)\//, '/($1)/');
  return allowedNotificationRoutes.has(normalizedLink) ? (normalizedLink as Href) : undefined;
};

export const notificationFromExpo = (notification: Notification): NotificationItem => {
  const { content } = notification.request;
  const data = content.data ?? {};

  return {
    id: String(data.notificationId || notification.request.identifier),
    title: content.title || 'TriLearn',
    message: content.body || '',
    isRead: false,
    createdAt: new Date().toISOString(),
    type: String(data.type || 'GENERAL'),
    link: typeof data.link === 'string' && data.link.length > 0 ? data.link : null,
  };
};

export const routeForNotification = (notification: NotificationItem): Href | undefined =>
  notificationRouteForType(notification.type) ?? routeFromLink(notification.link ?? null);

export const handleReceivedPushNotification = (notification: Notification): void => {
  useNotificationsStore.getState().addNotification(notificationFromExpo(notification));
  void queryClient.invalidateQueries({ queryKey: ['notifications'] });
};

export const handlePushNotificationResponse = (response: NotificationResponse): void => {
  const notification = notificationFromExpo(response.notification);
  const route = routeForNotification(notification);
  const notificationId = notification.id;

  useNotificationsStore.getState().addNotification(notification);
  useNotificationsStore.getState().markAsRead(notificationId);
  void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  void api.patch(`/notifications/${notificationId}/read`).catch(() => {});

  if (route) {
    router.push(route);
  }
};
