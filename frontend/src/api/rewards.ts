import api from './axios'

export interface RewardWallet {
  reward_points: number
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

export interface ReferralSummary {
  total_f1: number
  f1_this_month: number
  monthly: { month: string; count: number }[]
  items: ReferralItem[]
}

export const getRewardWallet = () => api.get<RewardWallet>('/customer/reward-wallet')
export const getRewardTransactions = (page = 1) =>
  api.get<{ data: RewardTransaction[]; next_page: number | null }>('/customer/reward-wallet/transactions', { params: { page } })
export const getReferrals = (month?: string) =>
  api.get<ReferralSummary>('/customer/referrals', { params: month ? { month } : {} })

/** Trần điểm dùng được cho một chuyến — cùng công thức với AffiliateService::spendable (làm tròn xuống). */
export const spendablePoints = (balance: number, basePrice: number, maxRatePercent: number) =>
  Math.max(0, Math.min(balance, Math.floor((basePrice * maxRatePercent) / 100 / 1000)))
