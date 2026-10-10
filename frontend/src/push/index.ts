// Facade push: chọn Web Push (trình duyệt) hay FCM (app native).
// Giữ NGUYÊN tên export của push.ts cũ — 7 nơi gọi import '@/push' không phải sửa.
import { isNativeApp } from '@/platform'
import * as native from './native'
import * as web from './web'

export type { PushStatus, PushResult } from './types'
export { initNativePush } from './native'

const impl = isNativeApp() ? native : web

export const getPushStatus = () => impl.getPushStatus()
export const registerPushSubscription = () => impl.registerPushSubscription()
export const syncPushSubscription = () => impl.syncPushSubscription()
export const unregisterPushSubscription = () => impl.unregisterPushSubscription()
