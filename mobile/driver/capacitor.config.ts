import type { CapacitorConfig } from '@capacitor/cli'

// Vỏ ứng dụng native cho app tài xế GreenCA — chỉ nạp bundle web, không chứa logic nghiệp vụ.
// Build: `make android-driver` (xem docs/MOBILE.md).
const config: CapacitorConfig = {
  // KHÔNG đổi được sau khi phát hành lên store — đổi là thành app mới.
  appId: 'vn.greenca.driver',
  appName: 'GreenCA Tài Xế',
  webDir: '../../frontend/dist-driver-native',
  server: {
    androidScheme: 'https',
    // Hostname riêng thay cho `localhost` — xem giải thích CSRF 419 ở mobile/customer/capacitor.config.ts.
    hostname: 'driver-app.greenca.vn',
  },
  plugins: {
    SplashScreen: { launchShowDuration: 800, backgroundColor: '#F8FAF9', showSpinner: false },
  },
}

export default config
