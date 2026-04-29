export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  type: string;
  link?: string | null;
}

export interface NotificationsResponse {
  total: number;
  page: number;
  limit: number;
  unreadCount: number;
  notifications: NotificationItem[];
}
