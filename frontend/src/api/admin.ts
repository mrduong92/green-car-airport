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
}) => api.put(`/admin/drivers/${id}`, data)

export const blockDriver = (id: number, reason: string) =>
  api.patch(`/admin/drivers/${id}/block`, { reason })

export const approveDriver = (id: number) => api.patch(`/admin/drivers/${id}/approve`)

export const updateCustomer = (id: number, data: { name: string }) =>
  api.patch(`/admin/customers/${id}`, data)

export const getVouchers = () => api.get<App.Voucher[]>('/admin/vouchers')

export const createVoucher = (data: App.VoucherPayload) =>
  api.post<App.Voucher>('/admin/vouchers', data)

export const deactivateVoucher = (id: number) =>
  api.patch(`/admin/vouchers/${id}/deactivate`)

export const getRevenue = (params: { period: string; from?: string; to?: string }) =>
  api.get<App.RevenueReport>('/admin/revenue', { params })

export const topupDriver = (id: number, data: { points: number; description?: string }) =>
  api.post<{ points_added: number; new_balance: number }>(`/admin/drivers/${id}/topup`, data)
