import api from './axios'

export const getZaloGroups = (
  params?: { q?: string; status?: 'enabled' | 'disabled' | 'left' | 'no_rides_7d'; page?: number },
) => api.get<App.AdminPage<App.AdminZaloGroup>>('/admin/free-rides/groups', { params })

export const setZaloGroupEnabled = (id: string, enabled: boolean) =>
  api.patch<App.AdminZaloGroup>(`/admin/free-rides/groups/${id}`, { enabled })

export const getFreeRideSenders = (params?: { q?: string; blocked?: boolean; page?: number }) =>
  api.get<App.AdminPage<App.AdminFreeRideSender>>('/admin/free-rides/senders', { params })

export const blockFreeRideSender = (uid: string, reason?: string) =>
  api.post<{ blocked: boolean }>(`/admin/free-rides/senders/${uid}/block`, { reason })

export const unblockFreeRideSender = (uid: string) =>
  api.delete<{ blocked: boolean }>(`/admin/free-rides/senders/${uid}/block`)

export const getFreeRideStatus = () => api.get<App.AdminFreeRideStatus>('/admin/free-rides/status')

// Tab "Nick Zalo" (giai đoạn 5).
export const getZaloAccounts = () => api.get<App.AdminZaloAccountsResponse>('/admin/free-rides/accounts')

export const createZaloAccountLogin = (accountId: string) =>
  api.post<App.AdminZaloAccountRequestCreated>('/admin/free-rides/accounts', { account_id: accountId })

export const removeZaloAccount = (accountId: string) =>
  api.delete<App.AdminZaloAccountRequestCreated>(`/admin/free-rides/accounts/${accountId}`)

export const getZaloAccountRequest = (id: number) =>
  api.get<App.AdminZaloAccountRequestDetail>(`/admin/free-rides/account-requests/${id}`)
