// frontend/src/api/settings.ts
import api from './axios'

export const getContactSettings = () =>
  api.get<App.ContactSettings>('/settings/contact').then((r) => r.data)

// Admin
export const getAdminSettings = () =>
  api.get<Record<'contact_hotline' | 'contact_email' | 'contact_zalo_phone', string>>('/admin/settings')
    .then((r) => r.data)

export const updateAdminSettings = (data: { contact_hotline: string; contact_email: string; contact_zalo_phone: string }) =>
  api.put('/admin/settings', data)
