import api from './axios'

export type StatsGroup = 'day' | 'week' | 'month'

export interface StatsSeriesPoint {
  key: string
  label: string
  /** VND */
  spent: number
  completed: number
  cancelled: number
  cashback_points: number
  commission_points: number
}

export interface CustomerStats {
  from: string
  to: string
  group: StatsGroup
  summary: {
    completed: number
    cancelled: number
    total_spent: number
    total_saved: number
    reward_points: number
  }
  series: StatsSeriesPoint[]
}

// Thống kê tính bằng SQL aggregate ở backend (không tải toàn bộ chuyến về rồi reduce bằng JS).
// Backend còn trả các key cũ (period/completed/points…) cho bundle PWA đã cache — trang này không dùng.
export const getCustomerStats = (params: { from: string; to: string; group: StatsGroup }) =>
  api.get<CustomerStats>('/customer/stats', { params })
