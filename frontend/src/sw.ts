/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'
import { BRAND } from './brand'

declare const self: ServiceWorkerGlobalScope

declare global {
  // lib.webworker.d.ts (bản TypeScript đang dùng) thiếu `renotify` dù Notification API chuẩn đã hỗ
  // trợ từ lâu và mọi trình duyệt đích đều chạy được — bổ sung tại chỗ thay vì ép kiểu `any` cả object.
  interface NotificationOptions {
    renotify?: boolean
  }
}

// Không có 2 dòng này, SW mới vào "waiting" và chỉ activate khi user đóng HẾT
// các tab/PWA đang mở — với app cài như PWA gần như không bao giờ xảy ra, nên
// user luôn kẹt ở bundle JS cũ (đăng ký/OTP gọi API không khớp version mới).
self.skipWaiting()
clientsClaim()

// Injected by vite-plugin-pwa at build time
precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}

  // Notify foreground clients so they can show a toast instead of OS notification
  const notifyClients = self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then((clients) => {
      if (clients.length > 0) {
        clients.forEach((c) => c.postMessage({ type: 'PUSH_RECEIVED', ...data }))
        // Show OS notification anyway so the user always gets it
      }
      // Tag riêng cho mỗi "luồng" thông báo để cái mới không âm thầm đè cái cũ (vd. cuốc Free
      // đè thông báo cuốc trả khách đang chờ) — ưu tiên `tag` server gửi kèm payload, bên nào
      // chưa gửi thì rơi về tag mặc định dùng chung từ trước. Luôn renotify vì mọi nhánh đều
      // có tag: không renotify thì trình duyệt coi là "cập nhật im lặng" notification cũ, có
      // thể không kêu/rung lại dù nội dung (vd. số cuốc Free mới) đã khác.
      return self.registration.showNotification(data.title ?? BRAND.name, {
        body:     data.body ?? '',
        icon:     '/icons/icon-192.png',
        badge:    '/icons/icon-192.png',
        data:     data.data ?? {},
        tag:      data.tag ?? 'greenca-notification',
        renotify: true,
      })
    })

  event.waitUntil(notifyClients)
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const { action, booking_id, url: dataUrl } = (event.notification.data ?? {}) as {
    action?: string
    booking_id?: number
    url?: string
  }

  let url = '/'
  if (action === 'view_booking' && booking_id) url = `/customer/booking/${booking_id}`
  else if (action === 'view_trip' && booking_id) url = `/driver/trips/${booking_id}`
  else if (action === 'view_wallet') url = '/driver/wallet'
  // Khoá chung cho mọi thông báo chỉ cần mở 1 URL cố định (vd. FreeRideMatchNotification → /driver/free).
  // Chỉ chấp nhận đường dẫn nội bộ: bắt đầu bằng '/' và KHÔNG bắt đầu bằng '//' (protocol-relative
  // URL mở sang domain khác — payload push tới từ server nhưng vẫn không nên tin tuyệt đối).
  else if (action === 'open_url' && dataUrl && dataUrl.startsWith('/') && !dataUrl.startsWith('//')) url = dataUrl

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        const focused = clients.find((c) => c.url.includes(url))
        if (focused) return focused.focus()
        return self.clients.openWindow(url)
      }),
  )
})
