// Đăng ký service worker + tự cập nhật bản mới (thay registerSW.js mặc định của vite-plugin-pwa,
// vốn chỉ kiểm tra bản mới MỘT lần lúc trang tải).
//
// Vì sao: app cài như PWA trên iPhone mở lại từ nền KHÔNG tải lại trang → không bao giờ kiểm tra bản
// mới; tắt hẳn mở lại thì lần đầu vẫn chạy bản cũ từ precache (bản mới chỉ cài ngầm), phải mở lần hai
// mới thấy code mới. sw.ts đã skipWaiting + clientsClaim nên bản mới kích hoạt ngay khi cài xong —
// thiếu mỗi việc chủ động hỏi bản mới và tải lại trang khi nó đã nắm quyền.

const UPDATE_EVERY_MS = 60 * 60_000
// Bản mới nắm quyền trong khoảng này sau khi vừa mở app → tải lại ngay (người dùng chưa kịp thao tác).
// Muộn hơn thì đợi tới lúc app xuống nền mới tải lại, không cắt ngang thao tác đang làm.
const RELOAD_WINDOW_MS = 15_000

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return

  // Lần cài đầu tiên (chưa có SW nào điều khiển trang) không phải "bản mới" — không tải lại.
  const hadController = navigator.serviceWorker.controller !== null
  let visibleSince = Date.now()
  let reloadPending = false

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return
    if (document.visibilityState === 'hidden' || Date.now() - visibleSince < RELOAD_WINDOW_MS) {
      window.location.reload()
    } else {
      reloadPending = true
    }
  })

  window.addEventListener('load', () => {
    // Dev: vite-plugin-pwa (devOptions) phục vụ SW ở /dev-sw.js dạng module.
    const register = import.meta.env.DEV
      ? navigator.serviceWorker.register('/dev-sw.js?dev-sw', { scope: '/', type: 'module' })
      : navigator.serviceWorker.register('/sw.js', { scope: '/' })

    register.then((registration) => {
      const checkForUpdate = () => { registration.update().catch(() => { /* mất mạng → lần sau */ }) }

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          visibleSince = Date.now()
          checkForUpdate()
        } else if (reloadPending) {
          window.location.reload()
        }
      })
      setInterval(() => {
        if (document.visibilityState === 'visible') checkForUpdate()
      }, UPDATE_EVERY_MS)
    }).catch(() => { /* trình duyệt chặn SW → app vẫn chạy, chỉ mất offline/push */ })
  })
}
