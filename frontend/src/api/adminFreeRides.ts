import api from './axios'

export const getZaloGroups = (params?: { q?: string; status?: 'enabled' | 'disabled' | 'left'; page?: number }) =>
  api.get<App.AdminPage<App.AdminZaloGroup>>('/admin/free-rides/groups', { params })

export const setZaloGroupEnabled = (id: string, enabled: boolean) =>
  api.patch<App.AdminZaloGroup>(`/admin/free-rides/groups/${id}`, { enabled })

export const getFreeRideSenders = (params?: { q?: string; blocked?: boolean; page?: number }) =>
  api.get<App.AdminPage<App.AdminFreeRideSender>>('/admin/free-rides/senders', { params })

export const blockFreeRideSender = (uid: string, reason?: string) =>
  api.post<{ blocked: boolean }>(`/admin/free-rides/senders/${uid}/block`, { reason })

export const unblockFreeRideSender = (uid: string) =>
  api.delete<{ blocked: boolean }>(`/admin/free-rides/senders/${uid}/block`)

export const getFreeRideStatus = () => api.get<App.AdminFreeRideStatus>('/admin/free-rides/status')
