import Echo from 'laravel-echo'
import Pusher from 'pusher-js'
import { API_BASE } from '@/api/base'

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
  //
  // ⚠️ APP NATIVE (Capacitor) là ngoại lệ của toàn bộ lập luận trên. Ở đó trang
  // được nạp từ chính vỏ app chứ không từ server, nên `window.location` KHÔNG trỏ
  // vào hệ thống:
  //   - hostname là `app.greenca.vn` — tên giả đặt cho WebView (xem
  //     mobile/*/capacitor.config.ts), không có Reverb nào ở đó;
  //   - protocol là `https:` trên Android nhưng `capacitor:` trên iOS, nên suy ra
  //     TLS từ protocol sẽ cho ra sai trên iOS → nối cổng 8081 không TLS.
  // Cả hai đều hỏng IM LẶNG: không có lỗi nào, chỉ là realtime không bao giờ tới.
  //
  // Vì vậy khi API_BASE có giá trị (tức bản build cho app native) thì lấy host và
  // giao thức từ chính nó. Bản web để API_BASE rỗng nên hành vi không đổi.
  const apiBaseUrl = API_BASE ? new URL(API_BASE) : null
  const isSecure = apiBaseUrl
    ? apiBaseUrl.protocol === 'https:'
    : window.location.protocol === 'https:'
  const host =
    import.meta.env.VITE_REVERB_HOST || apiBaseUrl?.hostname || window.location.hostname
  // Dùng `||` chứ không `??`: khi build truyền biến RỖNG để bỏ override dev,
  // `??` sẽ để lọt chuỗi rỗng và Number('') ra 0 → nối vào cổng 0.
  const port = Number(import.meta.env.VITE_REVERB_PORT || (isSecure ? 443 : 8081))
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
    // Tuyệt đối hoá vì lý do như trên: trong app native, đường dẫn tương đối sẽ
    // trỏ vào vỏ app và trả 404 → xác thực kênh private thất bại.
    authEndpoint: `${API_BASE}/api/broadcasting/auth`,
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
