import { create } from 'zustand';

import type { NotificationItem } from '@/src/types/notification';

interface NotificationsState {
  items: NotificationItem[];
  unreadCount: number;
  setNotifications: (items: NotificationItem[]) => void;
  addNotification: (item: NotificationItem) => void;
  markAsRead: (id: string) => void;
  reset: () => void;
}

const countUnread = (items: NotificationItem[]): number => items.filter((item) => !item.read).length;

export const useNotificationsStore = create<NotificationsState>((set) => ({
  items: [],
  unreadCount: 0,
  setNotifications: (items) => set({ items, unreadCount: countUnread(items) }),
  addNotification: (item) =>
    set((state) => {
      const items = [item, ...state.items];
      return { items, unreadCount: countUnread(items) };
    }),
  markAsRead: (id) =>
    set((state) => {
      const items = state.items.map((item) => (item.id === id ? { ...item, read: true } : item));
      return { items, unreadCount: countUnread(items) };
    }),
  reset: () => set({ items: [], unreadCount: 0 }),
}));
