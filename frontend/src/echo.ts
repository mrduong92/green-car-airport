import Echo from 'laravel-echo'
import Pusher from 'pusher-js'

// Reverb nói giao thức Pusher nên client vẫn là pusher-js.
;(window as unknown as { Pusher: typeof Pusher }).Pusher = Pusher

let echo: Echo<'reverb'> | null = null

/**
 * Kết nối WebSocket tới Reverb.
 *
 * Vì sao dùng WebSocket thay cho SSE: PHP-FPM giữ TRỌN 1 process (~50MB) cho mỗi
 * kết nối SSE, nên trần là ~90 người dùng realtime đồng thời trên máy 8GB — và
 * khi cạn worker thì mọi API khác cũng chết theo. Reverb giữ hàng nghìn kết nối
 * trong một event loop riêng, không đụng tới pool PHP-FPM.
 *
 * ⚠️ Kênh là PRIVATE nên client phải xác thực. Dự án dùng Bearer token chứ không
 * phải session cookie, nên authEndpoint trỏ vào /api/broadcasting/auth (route tự
 * khai báo trong nhóm auth:sanctum) và tự đính token vào header.
 */
export function getEcho(token: string): Echo<'reverb'> {
  if (echo) return echo

  // Mặc định kết nối về CHÍNH domain đang mở, không phải một host cố định nướng
  // vào lúc build. Lý do: 3 app nằm trên 3 subdomain (greenca.vn,
  // driver.greenca.vn, admin.greenca.vn) — chốt cứng một host thì 2 app còn lại
  // nối cross-origin và phải mở allowed_origins của Reverb, thừa một chỗ để
  // cấu hình sai. Cùng domain thì nginx đã proxy sẵn `location /app/`.
  //
  // Chỉ dev mới cần override, vì Reverb chạy ở cổng 8081 riêng.
  const isSecure = window.location.protocol === 'https:'
  const host = import.meta.env.VITE_REVERB_HOST || window.location.hostname
  const port = Number(import.meta.env.VITE_REVERB_PORT ?? (isSecure ? 443 : 8081))
  const forceTLS = import.meta.env.VITE_REVERB_SCHEME
    ? import.meta.env.VITE_REVERB_SCHEME === 'https'
    : isSecure

  echo = new Echo({
    broadcaster: 'reverb',
    key: import.meta.env.VITE_REVERB_APP_KEY,
    wsHost: host,
    wsPort: port,
    wssPort: port,
    forceTLS,
    enabledTransports: ['ws', 'wss'],
    authEndpoint: '/api/broadcasting/auth',
    auth: {
      headers: { Authorization: `Bearer ${token}` },
    },
  })

  return echo
}

/**
 * Ngắt kết nối và xoá instance. PHẢI gọi khi đăng xuất: Echo giữ token cũ trong
 * closure, không huỷ thì người đăng nhập tiếp theo vẫn xác thực bằng token cũ.
 */
export function disconnectEcho(): void {
  echo?.disconnect()
  echo = null
}
