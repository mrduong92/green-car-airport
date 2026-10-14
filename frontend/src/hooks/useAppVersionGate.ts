// frontend/src/hooks/useAppVersionGate.ts
import { useEffect, useState } from 'react'
import { App } from '@capacitor/app'
import { getAppVersion } from '@/api/appVersion'
import { isNativeApp } from '@/platform'
import { evaluateGate, type VersionGate } from '@/utils/appVersion'

/**
 * Kiểm phiên bản lúc mở app và mỗi lần quay lại từ nền. Chỉ chạy trong app native.
 * Phiên bản lấy từ tầng native (App.getInfo) — KHÔNG từ hằng số trong bundle,
 * vì nếu sau này có cập nhật OTA thì hai số sẽ lệch nhau.
 * Mọi lỗi → giữ 'ok' (fail-open): server sập không được khoá người dùng ngoài app.
 */
export function useAppVersionGate(app: 'customer' | 'driver'): VersionGate {
  const [gate, setGate] = useState<VersionGate>({ state: 'ok' })

  useEffect(() => {
    if (!isNativeApp()) return
    let cancelled = false

    const check = async () => {
      try {
        const [{ version }, info] = await Promise.all([App.getInfo(), getAppVersion(app)])
        if (!cancelled) setGate(evaluateGate(version, info))
      } catch {
        // fail-open
      }
    }

    void check()
    const sub = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void check()
    })

    return () => {
      cancelled = true
      void sub.then((h) => h.remove())
    }
  }, [app])

  return gate
}
