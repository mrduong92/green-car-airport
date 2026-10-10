import api from './axios'

export const getZaloGroups = (
  params?: { q?: string; status?: 'enabled' | 'disabled' | 'left' | 'no_rides_7d'; page?: number },
) => api.get<App.AdminPage<App.AdminZaloGroup>>('/admin/free-rides/groups', { params })

export const setZaloGroupEnabled = (id: string, enabled: boolean) =>
  api.patch<App.AdminZaloGroup>(`/admin/free-rides/groups/${id}`, { enabled })

// `blocked` đi query string nên phải là 1/0, không phải true/false — axios serialize boolean
// query param thành chữ "true"/"false", và Laravel rule `boolean` chỉ nhận true, false, 0, 1,
// "0", "1" (không nhận chuỗi "true"/"false"), nên gửi thẳng boolean sẽ luôn bị 422.
export const getFreeRideSenders = (params?: { q?: string; blocked?: 0 | 1; page?: number }) =>
  api.get<App.AdminPage<App.AdminFreeRideSender>>('/admin/free-rides/senders', { params })

// Chặn theo hồ sơ (mã QR) — áp lên mọi uid của cùng người. Hàng chặn kiểu cũ theo uid (không còn
// cuốc nên không có qr_code) vẫn đi endpoint theo uid.
const senderBlockPath = (s: Pick<App.AdminFreeRideSender, 'qr_code' | 'sender_uid'>) =>
  s.qr_code
    ? `/admin/free-rides/senders/qr/${encodeURIComponent(s.qr_code)}/block`
    : `/admin/free-rides/senders/${encodeURIComponent(s.sender_uid ?? '')}/block`

export const blockFreeRideSender = (s: App.AdminFreeRideSender, reason?: string) =>
  api.post<{ blocked: boolean }>(senderBlockPath(s), { reason })

export const unblockFreeRideSender = (s: App.AdminFreeRideSender) =>
  api.delete<{ blocked: boolean }>(senderBlockPath(s))

export const getFreeRideStatus = () => api.get<App.AdminFreeRideStatus>('/admin/free-rides/status')

// Tab "Nick Zalo" (giai đoạn 5).
// Khoá React Query dùng chung cho danh sách nick — AccountsTab (query chính) và AddAccountDialog
// (invalidate sau khi tạo/kết thúc yêu cầu) cùng import từ đây, tránh lặp literal ở 2 nơi.
export const ZALO_ACCOUNTS_QUERY_KEY = ['admin-zalo-accounts'] as const

export const getZaloAccounts = () => api.get<App.AdminZaloAccountsResponse>('/admin/free-rides/accounts')

export const createZaloAccountLogin = (accountId: string) =>
  api.post<App.AdminZaloAccountRequestCreated>('/admin/free-rides/accounts', { account_id: accountId })

export const removeZaloAccount = (accountId: string) =>
  api.delete<App.AdminZaloAccountRequestCreated>(`/admin/free-rides/accounts/${accountId}`)

export const getZaloAccountRequest = (id: number) =>
  api.get<App.AdminZaloAccountRequestDetail>(`/admin/free-rides/account-requests/${id}`)
