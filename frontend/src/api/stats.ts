import api from './axios'

export type StatsPeriod = 'week' | 'month' | 'all'

export interface CustomerStats {
  period: StatsPeriod
  completed: number
  cancelled: number
  total_spent: number
  total_saved: number
  /** Mốc biểu đồ, gồm cả mốc không có chuyến nào (value = 0) */
  points: { label: string; value: number }[]
}

// Thống kê tính bằng SQL aggregate ở backend. Trước đây màn hình này tải TOÀN BỘ
// chuyến của khách về rồi filter/reduce bằng JS chỉ để hiện 4 con số + 1 biểu đồ.
export const getCustomerStats = (period: StatsPeriod) =>
  api.get<CustomerStats>('/customer/stats', { params: { period } })
