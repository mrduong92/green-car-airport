import { registerDeviceToken } from '@/api/notifications'
import { isIosDevice, isStandaloneMode } from '@/hooks/usePwaInstall'

/**
 * Trạng thái web push trên máy này, để UI hiện đúng và gợi đúng hành động.
 *
 * - `granted`       đã cấp quyền — subscription sẽ được đồng bộ lên server
 * - `default`       chưa hỏi bao giờ — cần một cú chạm của người dùng để xin
 * - `denied`        người dùng đã chặn — trình duyệt không hỏi lại, phải tự gỡ
 *                   chặn trong cài đặt
 * - `not-installed` iPhone mở trong Safari thường — Apple chỉ cho push khi app
 *                   đã thêm vào màn hình chính
 * - `unsupported`   trình duyệt không có Push API
 * - `no-key`        bundle build thiếu VITE_VAPID_PUBLIC_KEY (lỗi build, không
 *                   phải lỗi người dùng — vite.config.ts chặn ở mode production)
 */
export type PushStatus = 'granted' | 'default' | 'denied' | 'not-installed' | 'unsupported' | 'no-key'

export type PushResult = { ok: true } | { ok: false; status: PushStatus | 'error' }

const VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

function isPushApiAvailable(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function getPushStatus(): PushStatus {
  if (!isPushApiAvailable()) {
    return isIosDevice() && !isStandaloneMode() ? 'not-installed' : 'unsupported'
  }
  if (!VAPID_KEY) return 'no-key'
  return Notification.permission
}

async function subscribeAndRegister(): Promise<void> {
  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  const sub = existing ?? (await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_KEY!),
  }))
  await registerDeviceToken(sub.toJSON())
}

/**
 * Xin quyền (nếu chưa hỏi) rồi đăng ký subscription lên server.
 *
 * Gọi từ một cú chạm của người dùng (nút "Bật thông báo") hoặc ngay sau đăng
 * nhập. Safari trên iPhone từ chối thẳng nếu lời xin quyền không đi kèm thao
 * tác người dùng, nên KHÔNG gọi hàm này tự động lúc mở app — dùng
 * `syncPushSubscription()` cho việc đó.
 */
export async function registerPushSubscription(): Promise<PushResult> {
  const status = getPushStatus()
  if (status === 'no-key') {
    console.warn('[push] VITE_VAPID_PUBLIC_KEY trống — bundle này không thể đăng ký push')
    return { ok: false, status }
  }
  if (status !== 'granted' && status !== 'default') return { ok: false, status }

  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return { ok: false, status: permission }
    await subscribeAndRegister()
    return { ok: true }
  } catch (e) {
    console.warn('[push] đăng ký thất bại', e)
    return { ok: false, status: 'error' }
  }
}

/**
 * Đồng bộ lại subscription khi mở app, CHỈ khi quyền đã được cấp — không bao
 * giờ bật hộp thoại xin quyền.
 *
 * Vì sao cần: server xoá token khi dịch vụ push báo hết hạn, và trình duyệt có
 * thể xoay endpoint. Trước đây việc đăng ký chỉ chạy lúc đăng nhập, nên tài xế
 * giữ đăng nhập lâu mất push âm thầm. Gọi `updateOrCreate` theo endpoint ở
 * backend nên lặp lại mỗi lần mở app là vô hại.
 */
export async function syncPushSubscription(): Promise<void> {
  if (getPushStatus() !== 'granted') return
  try {
    await subscribeAndRegister()
  } catch (e) {
    console.warn('[push] đồng bộ subscription thất bại', e)
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
