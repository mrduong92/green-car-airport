// frontend/src/api/settings.ts
import api from './axios'

export const getContactSettings = () =>
  api.get<App.ContactSettings>('/settings/contact').then((r) => r.data)

// Admin
export interface AdminSettings {
  contact_hotline: string
  contact_email: string
  contact_zalo_phone: string
  app_fee_percent: number
  referral_voucher_value: number
  referral_driver_points: number
  free_unlock_fee_vnd: number
  free_show_sender_name: boolean
  free_show_group_name: boolean
  free_show_raw_text: boolean
  affiliate_cashback_percent: number
  affiliate_commission_percent: number
  points_max_rate_percent: number
}

export const getAdminSettings = () =>
  api.get<AdminSettings>('/admin/settings').then((r) => r.data)

export const updateAdminSettings = (data: AdminSettings) =>
  api.put('/admin/settings', data)
