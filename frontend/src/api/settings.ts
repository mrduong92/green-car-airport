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
}

export const getAdminSettings = () =>
  api.get<AdminSettings>('/admin/settings').then((r) => r.data)

export const updateAdminSettings = (data: AdminSettings) =>
  api.put('/admin/settings', data)
