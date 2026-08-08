import api from './axios'

export const createBooking = (data: App.BookingPayload) =>
  api.post<App.Booking>('/bookings', data)

export const getActiveBooking = () =>
  api.get<App.Booking | null>('/bookings/active')

export const getBooking = (id: number) => api.get<App.Booking>(`/bookings/${id}`)

// Lịch sử phân trang bằng cursor — trước đây trả về mảng không giới hạn, khách
// đi nhiều chuyến là tải cả nghìn bản ghi cho một màn hình chỉ hiện 20 dòng đầu.
export const getBookingHistory = (params?: { status?: string; cursor?: string | null }) =>
  api.get<{ data: App.Booking[]; next_cursor: string | null }>('/bookings', { params })

export const cancelBooking = (id: number, cancelReason?: string) =>
  api.patch(`/bookings/${id}/cancel`, cancelReason ? { cancel_reason: cancelReason } : {})

export const applyVoucher = (code: string, price: number) =>
  api.post<{ discount: number; max_discount: number }>('/customer/vouchers/apply', { code, price })

export const getVouchers = () =>
  api.get<App.VoucherListItem[]>('/customer/vouchers')
