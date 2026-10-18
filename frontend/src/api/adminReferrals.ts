import api from './axios'

export type ReferralGroup = 'day' | 'week' | 'month'

export interface ReferralTopRow { id: number; name: string | null; phone: string | null; f1_total: number; f1_revenue: number; commission_points: number }
export interface ReferralSummary { f1_registered: number; f1_revenue: number; reward_points: number }
export interface ReferralSeriesPoint { key: string; label: string; f1_registered: number; f1_revenue: number; reward_points: number }
export interface ReferralReport {
  from: string; to: string; group: ReferralGroup
  summary: ReferralSummary
  top: ReferralTopRow[]
  series: ReferralSeriesPoint[]
}
export interface ReferrerDetail {
  // phone null = tài khoản đã xoá (UI hiện "—"). from/to null = số liệu trọn đời.
  id: number; name: string | null; phone: string | null; from: string | null; to: string | null
  f1: { id: number; name: string | null; phone: string | null; registered_at: string; trips: number; spent: number; commission_points: number }[]
}

export interface ReferralReportParams { from: string; to: string; group: ReferralGroup }

export const getReferralReport = (params: ReferralReportParams) => api.get<ReferralReport>('/admin/referrals', { params })
// Gửi cùng from/to với bảng top 10 để số liệu chi tiết khớp đúng dòng đang xem.
export const getReferrerDetail = (id: number, params: { from: string; to: string }) =>
  api.get<ReferrerDetail>(`/admin/referrals/${id}`, { params })
