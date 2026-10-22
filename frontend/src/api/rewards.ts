import api from './axios'

export interface RewardWallet {
  reward_points: number
  spend_enabled: boolean
  max_rate_percent: number
  cashback_percent: number
  commission_percent: number
}

export interface RewardTransaction {
  id: number
  type: 'credit' | 'debit'
  kind: 'cashback' | 'commission' | 'spend' | 'refund'
  points: number
  description: string
  booking_id: number | null
  created_at: string
}

export interface ReferralItem {
  id: number
  name: string | null
  phone_masked: string
  registered_at: string
  trips: number
  spent: number
  commission_points: number
}

export interface ReferralSeriesPoint {
  key: string
  label: string
  new_f1: number
  f1_revenue: number
  commission_points: number
}

export interface ReferralSummary {
  from: string
  to: string
  group: 'day' | 'week' | 'month'
  summary: {
    total_f1: number
    new_f1: number
    f1_trips: number
    f1_revenue: number
    commission_points: number
  }
  series: ReferralSeriesPoint[]
  items: ReferralItem[]
  /** Khoá cũ — chỉ để bản PWA đang cache còn chạy, trang mới không dùng. */
  total_f1: number
  f1_this_month: number
  monthly: { month: string; count: number }[]
}

export const getRewardWallet = (config?: { timeout?: number; signal?: AbortSignal }) =>
  api.get<RewardWallet>('/customer/reward-wallet', config)
export const getRewardTransactions = (page = 1) =>
  api.get<{ data: RewardTransaction[]; next_page: number | null }>('/customer/reward-wallet/transactions', { params: { page } })
export const getReferrals = (params?: { from: string; to: string; group: 'day' | 'week' | 'month' }) =>
  api.get<ReferralSummary>('/customer/referrals', { params })

/** Trần điểm dùng được cho một chuyến — cùng công thức với AffiliateService::cap() (làm tròn xuống). */
export const spendablePoints = (balance: number, basePrice: number, maxRatePercent: number) =>
  Math.max(0, Math.min(balance, Math.floor((basePrice * maxRatePercent) / 100 / 1000)))
