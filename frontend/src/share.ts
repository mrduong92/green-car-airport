// frontend/src/share.ts
import { Share } from '@capacitor/share'
import { isNativeApp } from '@/platform'

/** WebView Android không có navigator.share — app native dùng khay chia sẻ hệ thống. */
export function canShare(): boolean {
  return isNativeApp() || typeof navigator.share === 'function'
}

export async function shareLink(opts: { title: string; text: string; url: string }): Promise<void> {
  try {
    if (isNativeApp()) await Share.share({ ...opts, dialogTitle: 'Chia sẻ qua' })
    else await navigator.share(opts)
  } catch {
    // người dùng đóng khay chia sẻ — không phải lỗi
  }
}
