import api from './axios'

export const getDashboard = () => api.get<App.AdminDashboard>('/admin/dashboard')

export const clearDashboardCache = () => api.post('/admin/dashboard/clear-cache')

export const getDrivers = (params?: { status?: string; search?: string }) =>
  api.get<App.DriverProfile[]>('/admin/drivers', { params })

export const getCustomers = (params?: { search?: string }) =>
  api.get<App.AdminCustomer[]>('/admin/customers', { params })

export const updateDriver = (id: number, data: {
  name?: string; vehicle_make?: string; vehicle_model?: string
  vehicle_plate?: string; vehicle_year?: number; vehicle_color?: string
  is_vip?: boolean
}) => api.put(`/admin/drivers/${id}`, data)

export const blockDriver = (id: number, reason: string) =>
  api.patch(`/admin/drivers/${id}/block`, { reason })

export const unblockDriver = (id: number) =>
  api.patch(`/admin/drivers/${id}/unblock`)

export const approveDriver = (id: number) => api.patch(`/admin/drivers/${id}/approve`)

export const updateCustomer = (id: number, data: { name: string }) =>
  api.patch(`/admin/customers/${id}`, data)

export const getVouchers = () => api.get<App.Voucher[]>('/admin/vouchers')

export const createVoucher = (data: App.VoucherPayload) =>
  api.post<App.Voucher>('/admin/vouchers', data)

export const bulkGrantVouchers = (data: {
  user_ids: number[]; type: 'fixed' | 'percent'; value: number
  expires_at: string; usage_limit?: number
}) => api.post<App.Voucher[]>('/admin/vouchers/bulk', data)

export const updateVoucher = (id: number, data: {
  type?: 'fixed' | 'percent'; value?: number; target?: 'all' | 'specific'
  user_id?: number | null; expires_at?: string; usage_limit?: number | null
}) => api.patch<App.Voucher>(`/admin/vouchers/${id}`, data)

export const deactivateVoucher = (id: number) =>
  api.patch(`/admin/vouchers/${id}/deactivate`)

export const getCampaigns = () => api.get<App.Campaign[]>('/admin/campaigns')

export const createCampaign = (data: App.CampaignPayload) =>
  api.post<App.Campaign>('/admin/campaigns', data)

export const updateCampaign = (id: number, data: Partial<App.Campaign>) =>
  api.patch<App.Campaign>(`/admin/campaigns/${id}`, data)

export const getRevenue = (params: { period: string; from?: string; to?: string }) =>
  api.get<App.RevenueReport>('/admin/revenue', { params })

export const topupDriver = (id: number, data: { points: number; description?: string }) =>
  api.post<{ points_added: number; new_balance: number }>(`/admin/drivers/${id}/topup`, data)

export const deductDriverPoints = (id: number, data: { points: number; reason: string }) =>
  api.post<{ message: string; new_balance: number }>(`/admin/customers/${id}/deduct-points`, data)

export const getCustomerBookings = (id: number) =>
  api.get<App.AdminCustomerBooking[]>(`/admin/customers/${id}/bookings`)

export const blockCustomer = (id: number) =>
  api.patch(`/admin/customers/${id}/block`)

export const unblockCustomer = (id: number) =>
  api.patch(`/admin/customers/${id}/unblock`)

export const toggleCollaborator = (id: number) =>
  api.patch<{ is_collaborator: boolean }>(`/admin/customers/${id}/collaborator`)

export const deductCollaboratorPoints = (id: number, data: { points: number; reason: string }) =>
  api.post<{ message: string; new_balance: number }>(`/admin/customers/${id}/deduct-points`, data)

export const resetCollaboratorPoints = (id: number, data: { reason: string }) =>
  api.post<{ message: string; new_balance: number }>(`/admin/customers/${id}/reset-points`, data)

export const getAdminUsers = () => api.get<App.AdminUser[]>('/admin/admins')

export const createAdminUser = (data: { name: string; phone: string; password: string }) =>
  api.post<App.AdminUser>('/admin/admins', data)

export const updateAdminUser = (id: number, data: { name: string }) =>
  api.patch<App.AdminUser>(`/admin/admins/${id}`, data)

export const blockAdminUser = (id: number) => api.patch(`/admin/admins/${id}/block`)

export const unblockAdminUser = (id: number) => api.patch(`/admin/admins/${id}/unblock`)

export const resetAdminUserPassword = (id: number, data: { password: string }) =>
  api.post(`/admin/admins/${id}/password`, data)

export const changeOwnPassword = (data: { current_password: string; password: string }) =>
  api.post('/admin/me/password', data)
