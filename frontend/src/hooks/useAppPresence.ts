import { useEffect } from 'react'

const HEARTBEAT_MS = 45_000 // server giữ cờ 70 giây (DriverAppPresence::TTL_SECONDS)

// Báo server "tài xế đang mở app" để không push cuốc Free khi app đang trên màn hình (toast + tab
// Free realtime đã đủ). Không chặn được ở service worker: iOS thu hồi đăng ký push nếu nhận push mà
// không hiện thông báo. fetch keepalive thay vì axios: lệnh báo "rời app" gửi lúc trang đang bị ẩn
// / đóng vẫn phải tới được server.
function report(active: boolean) {
  const token = localStorage.getItem('token')
  if (!token) return
  fetch('/api/driver/app-presence', {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ active }),
  }).catch(() => { /* mất mạng → cờ tự hết hạn phía server */ })
}

export function useAppPresence() {
  useEffect(() => {
    const sync = () => report(document.visibilityState === 'visible')
    const leave = () => report(false)

    sync()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') report(true)
    }, HEARTBEAT_MS)
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('pagehide', leave)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('pagehide', leave)
      leave()
    }
  }, [])
}
