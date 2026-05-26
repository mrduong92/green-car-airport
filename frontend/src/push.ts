import { registerDeviceToken } from '@/api/notifications'

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export async function registerPushSubscription(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!vapidKey) return

  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return

    const reg = await navigator.serviceWorker.ready
    const existing = await reg.pushManager.getSubscription()
    const sub = existing ?? (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    }))

    await registerDeviceToken(sub.toJSON())
  } catch {
    // silently fail — push is non-critical
  }
}

export async function unregisterPushSubscription(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      const { removeDeviceToken } = await import('@/api/notifications')
      await removeDeviceToken(sub.endpoint)
      await sub.unsubscribe()
    }
  } catch {
    // silently fail
  }
}
