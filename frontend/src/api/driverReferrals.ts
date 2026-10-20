import api from './axios'

export interface DriverReferralItem {
  id: number
  name: string
  phone_masked: string
  registered_at: string | null
  trips: number
  status: 'rewarded' | 'waiting_approval' | 'waiting_trip'
  reward_points: number
}

export interface DriverReferralSummary {
  reward_points_per_referral: number
  total_f1: number
  rewarded_count: number
  total_reward_points: number
  items: DriverReferralItem[]
}

export const getDriverReferrals = () =>
  api.get<DriverReferralSummary>('/driver/referrals').then((r) => r.data)
