# Chính sách Cài đặt PWA (Progressive Web App)

## Tổng quan

GreenCar Airport được triển khai dưới dạng **PWA (Progressive Web App)** — cho phép user cài app lên màn hình chính mà không cần qua App Store / Play Store. Hệ thống hỗ trợ ba nền tảng: Android Chrome, iOS Safari, Desktop Chrome.

> **Mục tiêu:** Tài xế và khách hàng có thể cài GreenCar lên điện thoại, nhận push notification khi background, và xem layout cơ bản khi mất mạng.

---

## Nguyên tắc cốt lõi

> **Platform-aware install flow.** Android/Desktop có `beforeinstallprompt` — trigger native Chrome sheet trực tiếp. iOS không có sự kiện này — dẫn user đến trang hướng dẫn thủ công (Safari Share → Add to Home Screen).

> **Standalone detection.** Khi app đang chạy ở chế độ installed PWA (`display-mode: standalone` hoặc `navigator.standalone` trên iOS), toàn bộ install prompt bị ẩn. Không hiện lại banner hay menu item "Cài đặt" nếu đã cài.

> **canInstall = false khi đã cài.** Logic: `!isStandalone && !isInstalled && (!!deferredPrompt || isIos)`. Biến `isInstalled` được set khi browser phát `appinstalled` event.

---

## Lifecycle cài đặt

```
Browser tải trang → window fires beforeinstallprompt
    ↓
main.tsx: e.preventDefault() + lưu vào useUiStore.deferredInstallPrompt
    ↓
usePwaInstall hook: canInstall = true
    ↓
SplashPage: hiện banner "Cài đặt ứng dụng"
Driver/Customer ProfilePage: hiện row "Cài đặt ứng dụng"
    ↓
User bấm:
  ├─ Android/Desktop → triggerInstall() → native Chrome install sheet
  │       └─ Accepted → window.appinstalled event
  │                   → setDeferredInstallPrompt(null) + setInstalled(true)
  │                   → canInstall = false → banner biến mất
  └─ iOS → navigate('/install') → hướng dẫn thủ công 3 bước
```

---

## Cấu hình PWA

### Web App Manifest (`vite.config.ts`)

| Field | Giá trị |
|---|---|
| `name` | Green Car Airport |
| `short_name` | GreenCar |
| `display` | standalone |
| `orientation` | portrait |
| `theme_color` | #006a36 |
| `background_color` | #F8FAF9 |
| `start_url` | / |
| `scope` | / |

### Icons

| File | Kích thước | Purpose |
|---|---|---|
| `public/icons/icon-192.png` | 192×192 | any |
| `public/icons/icon-512.png` | 512×512 | any |
| `public/icons/icon-512.png` | 512×512 | maskable |

Icons được tạo bằng Python PIL: nền #006a36, biểu tượng xe + huy hiệu máy bay vàng. Maskable version có padding 10% theo safe zone spec.

### Service Worker

- **Strategy:** `injectManifest` (custom `src/sw.ts`, Vite inject precache manifest)
- **Precache:** tất cả JS/CSS/HTML/PNG/SVG/woff2 trong build output
- **Push handler:** nhận Web Push VAPID, hiện OS notification khi app đang background
- **Notification click:** focus hoặc mở cửa sổ app, navigate theo `data.url` trong payload

---

## Entry points cho user

| Màn hình | Điều kiện hiển thị | Hành động |
|---|---|---|
| SplashPage — banner dưới tagline | `canInstall === true` | Android/Desktop: native prompt; iOS: `/install` |
| Driver ProfilePage — row trong Actions | `canInstall === true` | navigate `/install` |
| Customer ProfilePage — row trong Menu | `canInstall === true` | navigate `/install` |
| Trang `/install` | luôn public (không cần login) | Hướng dẫn theo tab platform |

---

## Trang `/install` — Hướng dẫn cài đặt

Route: `/install` — **public**, không bọc trong RequireRole.

**Platform detection:** dựa trên `navigator.userAgent` — `/iphone|ipad|ipod/i` → iOS, `/android/i` → Android, còn lại → Desktop.

### Nội dung hướng dẫn theo platform

**Android Chrome:**
1. Đảm bảo đang dùng Chrome trên Android
2. Bấm menu ⋮ góc trên phải
3. Chọn "Thêm vào màn hình chính"

**iOS Safari:**
1. Đảm bảo đang dùng Safari trên iPhone / iPad
2. Bấm nút Chia sẻ 📤 thanh công cụ phía dưới
3. Cuộn xuống, chọn "Thêm vào Home Screen" → bấm Thêm

**Desktop Chrome:**
1. Đảm bảo đang dùng Google Chrome
2. Bấm biểu tượng ⊕ hoặc 💻 cuối thanh địa chỉ
3. Bấm "Cài đặt" trong hộp thoại xác nhận

**Lưu ý iOS:** Push notification chỉ hỗ trợ từ **iOS 16.4+**. iOS cũ vẫn cài được app nhưng không nhận thông báo.

**Button "Cài đặt ngay":** Chỉ hiện khi `canInstall && tab !== 'ios'` — iOS không có native prompt.

---

## Standalone mode detection

```ts
function isStandaloneMode(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  if ((navigator as { standalone?: boolean }).standalone === true) return true // iOS Safari
  return false
}
```

Khi `isStandalone === true`:
- `/install` hiện màn hình "Đã cài đặt ứng dụng" thay vì hướng dẫn
- `canInstall` luôn `false` → ẩn toàn bộ install UI

---

## Push Notification

| Trường hợp | Hành vi |
|---|---|
| App đang mở (foreground) | Service worker không hiện OS notification — app tự handle qua WebSocket/event |
| App background / minimize | Service worker hiện OS notification với title + body từ VAPID payload |
| User bấm notification | SW focus cửa sổ app + navigate theo `data.url` |

**VAPID:** Khoá public/private lưu trong `.env` backend (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`). Frontend đăng ký subscription qua `src/push.ts`, gửi lên `POST /api/push/subscribe`.

**iOS push:** Chỉ hoạt động khi app đã được Add to Home Screen (installed PWA) và iOS ≥ 16.4.

---

## Offline / Cache

Service worker precache toàn bộ build output — app shell (HTML + JS + CSS) luôn phục vụ từ cache khi offline. API calls fail gracefully với loading state; không có stale-while-revalidate cho dữ liệu động.

---

## Files liên quan

| File | Vai trò |
|---|---|
| `vite.config.ts` | VitePWA plugin config, manifest, icon list |
| `src/sw.ts` | Custom service worker — precache + push handler |
| `src/main.tsx` | Capture `beforeinstallprompt` + `appinstalled` events |
| `src/stores/ui.ts` | `deferredInstallPrompt`, `isInstalled` state |
| `src/hooks/usePwaInstall.ts` | Platform detection + `canInstall` + `triggerInstall()` |
| `src/pages/InstallPage.tsx` | Trang hướng dẫn 3 tab (Android / iOS / Desktop) |
| `public/icons/icon-192.png` | PWA icon 192×192 |
| `public/icons/icon-512.png` | PWA icon 512×512 (any + maskable) |
