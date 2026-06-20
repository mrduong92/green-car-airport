import api from './axios'

export const createBooking = (data: App.BookingPayload) =>
  api.post<App.Booking>('/bookings', data)

export const getActiveBooking = () =>
  api.get<App.Booking | null>('/bookings/active')

export const getBooking = (id: number) => api.get<App.Booking>(`/bookings/${id}`)

export const getBookingHistory = (params?: { status?: string }) =>
  api.get<App.Booking[]>('/bookings', { params })

export const cancelBooking = (id: number) => api.patch(`/bookings/${id}/cancel`)

export const applyVoucher = (code: string, price: number) =>
  api.post<{ discount: number; max_discount: number }>('/customer/vouchers/apply', { code, price })

export const getVouchers = () =>
  api.get<App.VoucherListItem[]>('/customer/vouchers')
