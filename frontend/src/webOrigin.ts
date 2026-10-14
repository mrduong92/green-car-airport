// frontend/src/webOrigin.ts
import { API_BASE } from '@/api/base'
import { isNativeApp } from '@/platform'

/**
 * Origin công khai của bản web — dùng cho link GỬI RA NGOÀI (link giới thiệu).
 *
 * Trong app native, window.location.origin là tên giả của WebView
 * (https://app.greenca.vn) — người nhận bấm vào sẽ ra trang không tồn tại.
 */
export function webOrigin(app: 'customer' | 'driver'): string {
  if (!isNativeApp()) return window.location.origin
  return app === 'customer' ? API_BASE : (import.meta.env.VITE_DRIVER_APP_URL as string)
}
