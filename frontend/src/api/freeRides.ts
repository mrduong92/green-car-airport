import api from './axios'

export const getFreeRides = (params: App.FreeRideFilters & { since?: number; cursor?: string }) =>
  api.get<App.FreeRidePage>('/driver/free-rides', { params })

export type FreeRideReportReason = 'spam' | 'wrong_info' | 'inappropriate' | 'other'

export const reportFreeRide = (rideUid: string, reason: FreeRideReportReason, note?: string) =>
  api.post<{ ok: true }>(`/driver/free-rides/${encodeURIComponent(rideUid)}/report`, { reason, note })

export const hideFreeRideSender = (senderUid: string) =>
  api.post<{ ok: true }>('/driver/free-rides/hidden-senders', { sender_uid: senderUid })

export const reportBrokenLink = (rideUid: string) =>
  api.post<{ ok: true }>(`/driver/free-rides/${encodeURIComponent(rideUid)}/broken-link`)

// Bộ lọc đã lưu để nhận thông báo đẩy khi có cuốc Free mới khớp (giai đoạn 5).
// Khoá React Query dùng chung — FreeRidesPage (hiện trạng thái trên nút chuông) và
// FreeRideAlertSheet (đọc/ghi) cùng import từ đây, tránh lặp literal ở 2 nơi.
export const FREE_ALERT_QUERY_KEY = ['driver-free-ride-alert'] as const

export const getFreeRideAlert = () => api.get<App.FreeRideAlert>('/driver/free-rides/alert')

export interface FreeRideAlertPayload {
  enabled: boolean
  direction?: App.FreeRideDirection | null
  seats?: number | null
  keywords?: string | null
}

export const saveFreeRideAlert = (data: FreeRideAlertPayload) =>
  api.put<App.FreeRideAlert>('/driver/free-rides/alert', data)

const DIRECTION_LABEL: Record<App.FreeRideDirection, string> = {
  to_airport: 'Tiễn sân bay',
  from_airport: 'Đón sân bay',
  other: 'Khác',
}

interface AlertCriteria {
  direction?: App.FreeRideDirection | null
  seats?: number | null
  q?: string | null
}

/** Tóm tắt tiêu chí cảnh báo (hoặc bộ lọc tab Free) thành 1 dòng tiếng Việt ngắn gọn. */
export function summarizeAlertFilters(c: AlertCriteria): string {
  const parts: string[] = [c.direction ? DIRECTION_LABEL[c.direction] : 'Mọi chiều']
  if (c.seats) parts.push(`${c.seats} chỗ`)
  if (c.q) parts.push(`"${c.q}"`)
  return parts.join(' · ')
}
