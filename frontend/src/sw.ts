/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope

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
      return self.registration.showNotification(data.title ?? 'Save Go', {
        body:  data.body ?? '',
        icon:  '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data:  data.data ?? {},
        tag:   'savego-notification',
      })
    })

  event.waitUntil(notifyClients)
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const { action, booking_id } = (event.notification.data ?? {}) as {
    action?: string
    booking_id?: number
  }

  let url = '/'
  if (action === 'view_booking' && booking_id) url = `/customer/booking/${booking_id}`
  else if (action === 'view_trip' && booking_id) url = `/driver/trips/${booking_id}`
  else if (action === 'view_wallet') url = '/driver/wallet'

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
