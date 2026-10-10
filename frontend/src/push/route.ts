// frontend/src/push/route.ts
// Ánh xạ action trong payload push → đường dẫn trong app. Dùng chung cho
// service worker (web) và FCM (native) — sửa một chỗ, hai nền tảng cùng đúng.
// Module thuần: không import gì, để sw.ts và Node test import được.

export type PushData = { action?: string; booking_id?: number | string; url?: string }

export function pushRoute(data: PushData): string {
  const { action, booking_id, url } = data
  if (action === 'view_booking' && booking_id) return `/customer/booking/${booking_id}`
  if (action === 'view_trip' && booking_id) return `/driver/trips/${booking_id}`
  if (action === 'view_wallet') return '/driver/wallet'
  // Chỉ đường dẫn nội bộ: `//host` là URL tuyệt đối theo giao thức hiện tại.
  if (action === 'open_url' && url && url.startsWith('/') && !url.startsWith('//')) return url
  return '/'
}
