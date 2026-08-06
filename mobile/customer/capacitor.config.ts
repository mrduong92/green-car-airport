import type { CapacitorConfig } from '@capacitor/cli'

// Vỏ ứng dụng native cho app khách hàng GreenCA.
// Không chứa logic nghiệp vụ — chỉ nạp bundle web đã build ở frontend/dist.
//
// Build lại bundle rồi đồng bộ sang đây:
//   cd frontend && VITE_API_BASE_URL=https://webco.io.vn npm run build:customer
//   cd mobile/customer && npx cap sync
const config: CapacitorConfig = {
  // KHÔNG đổi được sau khi phát hành lên store — đổi là thành app mới.
  appId: 'vn.greenca.customer',
  appName: 'GreenCA',
  webDir: '../../frontend/dist',

  server: {
    androidScheme: 'https',
    // Mặc định Capacitor nạp WebView từ origin `https://localhost` (Android) và
    // `capacitor://localhost` (iOS). Cả hai đều có host `localhost`, mà `localhost`
    // nằm trong danh sách SANCTUM_STATEFUL_DOMAINS mặc định của Laravel → Sanctum
    // coi request là first-party SPA, chuyển sang luồng session/cookie và bắt CSRF
    // → mọi request trả 419 "CSRF token mismatch".
    //
    // Đặt hostname riêng để origin không còn là `localhost`; app dùng Bearer token
    // nên không cần luồng stateful. Xem thêm mục CORS/Sanctum trong spec.
    hostname: 'app.greenca.vn',
  },
}

export default config
