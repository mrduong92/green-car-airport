// frontend/src/push/native.ts
// Push cho app native qua FCM (@capacitor/push-notifications).
// Cùng chữ ký với web.ts để facade index.ts hoán đổi được.
import { PushNotifications, type PermissionStatus } from '@capacitor/push-notifications'
import { registerFcmToken, removeFcmToken } from '@/api/notifications'
import { useUiStore } from '@/stores/ui'
import { pushRoute, type PushData } from './route'
import { playNewRideSound } from './sound'
import type { PushResult, PushStatus } from './types'

const REGISTRATION_TIMEOUT_MS = 15_000

let permission: PushStatus = 'default'
let currentToken: string | null = null
let waiters: Array<(token: string) => void> = []

function toStatus(p: PermissionStatus['receive']): PushStatus {
  if (p === 'granted') return 'granted'
  if (p === 'denied') return 'denied'
  return 'default' // prompt | prompt-with-rationale
}

/** Đồng bộ như bản web: đọc trạng thái đã cache (cập nhật lúc init và sau mỗi lần xin quyền). */
export function getPushStatus(): PushStatus {
  return permission
}

/** register() không trả token — token về qua sự kiện `registration`. */
async function obtainToken(): Promise<string> {
  const token = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('FCM registration timeout')), REGISTRATION_TIMEOUT_MS)
    waiters.push((t) => { clearTimeout(timer); resolve(t) })
  })
  await PushNotifications.register()
  return token
}

export async function registerPushSubscription(): Promise<PushResult> {
  try {
    permission = toStatus((await PushNotifications.requestPermissions()).receive)
    if (permission !== 'granted') return { ok: false, status: permission }
    await registerFcmToken(await obtainToken())
    return { ok: true }
  } catch (e) {
    console.warn('[push] đăng ký FCM thất bại', e)
    return { ok: false, status: 'error' }
  }
}

/** Mở app: gửi lại token (FCM có thể xoay token). Không bao giờ hiện hộp xin quyền. */
export async function syncPushSubscription(): Promise<void> {
  try {
    permission = toStatus((await PushNotifications.checkPermissions()).receive)
    if (permission !== 'granted') return
    await registerFcmToken(await obtainToken())
  } catch (e) {
    console.warn('[push] đồng bộ FCM token thất bại', e)
  }
}

/** Đăng xuất: gỡ token khỏi server để máy này không nhận push của tài khoản cũ. */
export async function unregisterPushSubscription(): Promise<void> {
  try {
    const token = currentToken ?? (permission === 'granted' ? await obtainToken() : null)
    if (token) await removeFcmToken(token)
  } catch {
    // silently fail
  }
}

/**
 * Gọi MỘT lần lúc khởi động app native.
 * - Listener `pushNotificationActionPerformed` gắn sớm: Capacitor giữ sự kiện chạm
 *   thông báo lúc mở app nguội cho tới khi có listener.
 * - createChannel gọi lặp lại vô hại. Âm báo của kênh bị Android KHOÁ khi kênh đã
 *   tạo trên máy — đổi file âm báo = phải đổi id kênh (new_ride_v2).
 */
export async function initNativePush(
  navigate: (path: string) => void,
  opts: { rideChannel: boolean },
): Promise<void> {
  await PushNotifications.addListener('registration', ({ value }) => {
    currentToken = value
    const pending = waiters
    waiters = []
    pending.forEach((resolve) => resolve(value))
  })
  await PushNotifications.addListener('registrationError', (e) => {
    console.warn('[push] FCM registration lỗi', e)
  })
  await PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
    navigate(pushRoute((notification.data ?? {}) as PushData))
  })
  // App đang mở: hệ thống KHÔNG tự hiện thông báo FCM — tự phát âm báo + toast.
  await PushNotifications.addListener('pushNotificationReceived', (n) => {
    const data = (n.data ?? {}) as PushData & { channel?: string }
    if (data.channel === 'new_ride') playNewRideSound()
    const message = n.body || n.title
    if (message) useUiStore.getState().showToast(message, 'info')
  })

  if (opts.rideChannel) {
    await PushNotifications.createChannel({
      id: 'new_ride', name: 'Cuốc mới', description: 'Báo cuốc mới và Cuốc Free',
      importance: 5, sound: 'new_ride', vibration: true, visibility: 1,
    })
  }
  await PushNotifications.createChannel({
    id: 'general', name: 'Thông báo chung', description: 'Trạng thái chuyến, ví, khuyến mãi',
    importance: 4, vibration: true, visibility: 1,
  })

  permission = toStatus((await PushNotifications.checkPermissions()).receive)
}
