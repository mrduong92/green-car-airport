import api from './axios'

export interface ReferralTopRow { id: number; name: string | null; phone: string | null; f1_total: number; f1_revenue: number; commission_points: number }
export interface ReferralMonthRow { month: string; f1_registered: number; f1_revenue: number; reward_points: number }
export interface ReferralReport { month: string; top: ReferralTopRow[]; monthly: ReferralMonthRow[] }
export interface ReferrerDetail {
  id: number; name: string | null; phone: string
  f1: { id: number; name: string | null; phone: string; registered_at: string; trips: number; spent: number; commission_points: number }[]
}

export const getReferralReport = (month?: string) => api.get<ReferralReport>('/admin/referrals', { params: month ? { month } : {} })
export const getReferrerDetail = (id: number) => api.get<ReferrerDetail>(`/admin/referrals/${id}`)
