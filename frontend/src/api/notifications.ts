import api from './axios'

export interface AppNotification {
  id: string
  title: string
  body: string
  action: string | null
  booking_id: number | null
  read_at: string | null
  created_at: string
}

export interface NotificationsPage {
  data: AppNotification[]
  current_page: number
  last_page: number
}

export const getNotifications = (page = 1) =>
  api.get<NotificationsPage>('/notifications', { params: { page } }).then((r) => r.data)

export const getUnreadCount = () =>
  api.get<{ count: number }>('/notifications/unread-count').then((r) => r.data.count)

export const readAll = () =>
  api.patch('/notifications/read-all').then((r) => r.data)

export const markRead = (id: string) =>
  api.patch(`/notifications/${id}/read`).then((r) => r.data)

export const registerDeviceToken = (subscription: PushSubscriptionJSON) =>
  api.post('/device-token', { subscription, platform: 'web' }).then((r) => r.data)

export const removeDeviceToken = (endpoint: string) =>
  api.delete('/device-token', { data: { endpoint } }).then((r) => r.data)
