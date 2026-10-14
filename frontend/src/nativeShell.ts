// frontend/src/nativeShell.ts
import { App } from '@capacitor/app'
import { StatusBar, Style } from '@capacitor/status-bar'
import { isNativeApp } from '@/platform'

/** Hành vi vỏ app native. Không làm gì trên web. */
export function initNativeShell(): void {
  if (!isNativeApp()) return

  // Mặc định nút Back Android thoát app ngay cả khi đang ở trang con.
  void App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back()
    else void App.exitApp()
  })

  // Style.Dark = chữ sáng trên nền tối (màu primary).
  StatusBar.setBackgroundColor({ color: '#006a36' }).catch(() => {})
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {})
}
