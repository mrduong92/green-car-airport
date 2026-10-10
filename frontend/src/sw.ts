/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'
import { BRAND } from './brand'
import { pushRoute, type PushData } from './push/route'

declare const self: ServiceWorkerGlobalScope

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
      return self.registration.showNotification(data.title ?? BRAND.name, {
        body:  data.body ?? '',
        icon:  '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data:  data.data ?? {},
        tag:   'greenca-notification',
      })
    })

  event.waitUntil(notifyClients)
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = pushRoute((event.notification.data ?? {}) as PushData)

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
