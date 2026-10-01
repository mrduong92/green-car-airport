import { useState, useEffect, useCallback } from 'react'
import { getPushStatus, registerPushSubscription, type PushStatus, type PushResult } from '@/push'

/**
 * Trạng thái push của máy này + hành động bật, dùng chung cho hàng cài đặt
 * trong Hồ sơ và banner nhắc trên trang Cuốc xe.
 *
 * Đọc lại trạng thái khi app quay lại foreground: người dùng có thể vừa sang
 * cài đặt hệ thống gỡ chặn rồi quay về, hoặc vừa thêm app vào màn hình chính.
 */
export function usePushStatus() {
  const [status, setStatus] = useState<PushStatus>(() => getPushStatus())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') setStatus(getPushStatus())
    }
    document.addEventListener('visibilitychange', refresh)
    return () => document.removeEventListener('visibilitychange', refresh)
  }, [])

  const enable = useCallback(async (): Promise<PushResult> => {
    setBusy(true)
    try {
      const result = await registerPushSubscription()
      setStatus(getPushStatus())
      return result
    } finally {
      setBusy(false)
    }
  }, [])

  return { status, busy, enable }
}
