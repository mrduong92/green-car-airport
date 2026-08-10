/** Hình dạng lỗi Axios mà backend trả về: body 4xx luôn có `message`. */
export type ApiError = {
  response?: { status?: number; data?: { code?: string; message?: string } }
}

/**
 * Lấy thông báo lỗi do BACKEND trả về, chỉ dùng `fallback` khi thật sự không có
 * (mất mạng, timeout, 5xx không có body).
 *
 * Vì sao cần: backend nói rất cụ thể ở body 4xx — "Số dư ví không đủ để nhận
 * cuốc (cần 40 điểm phí app, ví còn 0 điểm). Vui lòng nạp thêm điểm." — nhưng
 * app tài xế từng nuốt hết và chỉ hiện "Nhận cuốc thất bại". Hậu quả thật: tài
 * xế bấm nhận cuốc hỏng nhiều lần liên tiếp mà không biết mình chỉ cần nạp
 * điểm, còn người hỗ trợ phải lần vào log nginx mới ra nguyên nhân.
 *
 * Nhận `unknown` để dùng thẳng trong `onError` của React Query mà không phải
 * chú thích kiểu ở từng chỗ gọi.
 */
export function apiMessage(err: unknown, fallback: string): string {
  return (err as ApiError)?.response?.data?.message ?? fallback
}
