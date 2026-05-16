import api from './axios'

export const getDashboard = () => api.get<App.AdminDashboard>('/admin/dashboard')

export const getDrivers = (params?: { status?: string; search?: string }) =>
  api.get<App.Paginated<App.DriverProfile>>('/admin/drivers', { params })

export const blockDriver = (id: number, reason: string) =>
  api.patch(`/admin/drivers/${id}/block`, { reason })

export const approveDriver = (id: number) => api.patch(`/admin/drivers/${id}/approve`)

export const getVouchers = () => api.get<App.Voucher[]>('/admin/vouchers')

export const createVoucher = (data: App.VoucherPayload) =>
  api.post<App.Voucher>('/admin/vouchers', data)

export const deactivateVoucher = (id: number) =>
  api.patch(`/admin/vouchers/${id}/deactivate`)

export const getRevenue = (params: { period: string; from?: string; to?: string }) =>
  api.get<App.RevenueReport>('/admin/revenue', { params })
