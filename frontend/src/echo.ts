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

  echo = new Echo({
    broadcaster: 'reverb',
    key: import.meta.env.VITE_REVERB_APP_KEY,
    wsHost: import.meta.env.VITE_REVERB_HOST,
    wsPort: Number(import.meta.env.VITE_REVERB_PORT ?? 8081),
    wssPort: Number(import.meta.env.VITE_REVERB_PORT ?? 443),
    forceTLS: (import.meta.env.VITE_REVERB_SCHEME ?? 'http') === 'https',
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
