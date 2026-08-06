# Rename SaveGo → GreenCA + logo/favicon chữ G

**Ngày:** 2026-08-06
**Trạng thái:** design đã chốt, chờ implementation plan

## Bối cảnh

App đang hiển thị tên `Save Go` (UI) / `SaveGo` (PWA `short_name`). Tên chính thức đổi thành **GreenCA**.

Hai vấn đề phát hiện khi khảo sát:

1. **Tên bị hardcode ở 14 file** — không có single source of truth. Mỗi lần rename phải sửa tay khắp codebase.
2. **Không có logo thật.** Brand mark hiện tại là icon Material `directions_car` (+ badge máy bay vàng ở Splash) lặp lại ở 7 chỗ. `frontend/public/favicon.svg` là mark tím `#863bff` còn sót từ template khác, không liên quan brand.

Domain production đã là `greenca.vn` / `driver.greenca.vn` / `admin.greenca.vn` (xem `deploy/nginx/greenca.vn.conf`), nhưng email và nginx config cũ vẫn mang `savego.com.vn`.

## Mục tiêu

- Mọi text hiển thị đổi sang `GreenCA`, đọc từ **một** module hằng số.
- Logo monogram chữ G thay icon xe ở toàn bộ 7 điểm sử dụng, không đổi layout.
- Favicon + PWA icon sinh từ chính logo đó.
- Email/VAPID chuyển sang `greenca.vn`; dọn nginx config cũ.

Ngoài phạm vi: không đổi màu brand (`primary #006a36` giữ nguyên), không đổi domain nginx (đã đúng), không sửa spec/plan lịch sử trong `docs/superpowers/`.

## Kiến trúc

### Single source of truth

`frontend/src/brand.ts` — module hằng số thuần, **không import gì** (điều kiện để `vite.config.ts` phía Node import được):

```ts
export const BRAND = {
  name:         'GreenCA',
  tagline:      'AIRPORT TRANSFER · VIETNAM',
  legalName:    'GreenCA Co.',
  supportEmail: 'support@greenca.vn',
  zaloOa:       'GreenCA',
  domain:       'greenca.vn',
} as const
```

`vite.config.ts` import `./src/brand` và derive `APPS`:

| target | `title` / `name` | `shortName` |
|---|---|---|
| customer | `BRAND.name` | `BRAND.name` |
| driver | `${BRAND.name} Tài Xế` | `${BRAND.name} Tài Xế` |
| admin | `${BRAND.name} Admin` | `${BRAND.name} Admin` |

`description` cũng nội suy `BRAND.name`.

`index.html` bỏ hardcode, dùng placeholder:

```html
<meta name="apple-mobile-web-app-title" content="%APP_SHORT_NAME%" />
<title>%APP_TITLE%</title>
```

`appEntryPlugin` (đã tồn tại trong `vite.config.ts`) đổi từ match-string sang replace placeholder. Lý do: `.replace('content="SaveGo"', ...)` hiện tại **vỡ im lặng** khi tên đổi — không lỗi, chỉ là meta tag sai.

Backend: `APP_NAME="GreenCA"` trong `.env.example`. `MAIL_FROM_NAME="${APP_NAME}"` và `VITE_APP_NAME="${APP_NAME}"` đã tham chiếu nên tự theo.

**Kết quả:** rename lần sau = sửa `brand.ts` + `APP_NAME`.

### Logo mark

Glyph G dạng stroke (không fill) để scale mượt 16px → 512px. Grid 48×48:

```
circle center (24,24), r=15, stroke-width 6, linecap + linejoin: round
path: M36.29 15.40  A15 15 0 1 0 39 24  H26
```

- Điểm đầu `(36.29, 15.40)` = θ=35° trên đường tròn r=15.
- Cung 325° ngược chiều kim đồng hồ (`large-arc-flag 1`, `sweep-flag 0`) kết ở `(39, 24)` = θ=0°, điểm phải nhất.
- `H26` = gạch ngang thụt vào tâm — nét đặc trưng của G geometric.
- Gap 35° ở góc trên-phải. Bounds `6..42`, padding 12.5%.

`frontend/src/components/common/BrandMark.tsx` — props `{ size?: number, variant?: 'tint' | 'glass' | 'onDark' | 'tile', className?: string }`. Component render đúng vị trí icon `directions_car` đang nằm nên **không thay đổi layout**.

| variant | Nền | Glyph | Dùng ở |
|---|---|---|---|
| `tint` | `bg-primary-tint` + `rounded-logo` | `text-primary` | AuthShell (48), AppHeader (36), RegisterPage (48), DriverRegisterPage (48) |
| `glass` | `rgba(255,255,255,0.12)` + backdrop-blur | white | SplashPage (110) |
| `onDark` | `bg-white/10` | white | AdminLayout (36) |
| `tile` | gradient `160deg #006a36 → #004d27`, bo góc 22.5% | white | favicon, icon PNG, preview app-icon ở InstallPage |

`variant="tile"` scale glyph để chiếm ~58% tile: `transform="translate(5.28 5.28) scale(0.78)"` trên grid 48.

SplashPage giữ nguyên tile glass + badge máy bay vàng `#C8A24A` — chỉ đổi icon xe thành glyph G. Chữ G thuần mất tín hiệu "sân bay"; badge bù lại.

### Assets

| File | Nội dung |
|---|---|
| `frontend/public/favicon.svg` | variant `tile`, 48×48 — thay mark tím `#863bff` |
| `frontend/public/icons/icon-192.png` | tile, full-bleed |
| `frontend/public/icons/icon-512.png` | tile, full-bleed |
| `frontend/public/icons/icon-512-maskable.png` | **mới** — glyph co về 60% safe-zone |

`vite.config.ts` `manifest.icons`: entry `purpose: 'maskable'` trỏ sang `icon-512-maskable.png` thay vì dùng lại `icon-512.png` (đang bị Android crop mất viền).

PNG sinh bằng render SVG → PNG (thứ tự ưu tiên: `rsvg-convert` → `sharp` → headless Chrome). Xác nhận kết quả bằng cách đọc lại file PNG, không tin ngầm exit code.

## Phạm vi sửa

### Frontend

| File | Thay đổi |
|---|---|
| `src/brand.ts` | **mới** |
| `src/components/common/BrandMark.tsx` | **mới** |
| `vite.config.ts` | import `BRAND`, derive `APPS`, plugin dùng placeholder, manifest maskable icon |
| `index.html` | `%APP_TITLE%` + `%APP_SHORT_NAME%` |
| `src/sw.ts` | fallback title → `BRAND.name`; tag `savego-notification` → `greenca-notification` |
| `src/components/auth/AuthShell.tsx` | wordmark + `BrandMark variant="tint"` |
| `src/components/common/AppHeader.tsx` | wordmark (2 chỗ) + `BrandMark variant="tint"` |
| `src/layouts/AdminLayout.tsx` | wordmark + `BrandMark variant="onDark"` |
| `src/pages/SplashPage.tsx` | wordmark + `BrandMark variant="glass"`, giữ badge máy bay |
| `src/pages/RegisterPage.tsx` | wordmark + `BrandMark variant="tint"` |
| `src/pages/DriverRegisterPage.tsx` | `Save Go Driver` → `GreenCA Tài Xế` + `BrandMark variant="tint"` |
| `src/pages/InstallPage.tsx` | `Cài đặt SaveGo` → `Cài đặt GreenCA`, preview app-icon dùng `variant="tile"` |
| `src/pages/driver/LoginPage.tsx` | text `tài xế Save Go` |
| `src/pages/driver/ProfilePage.tsx` | share title + text |
| `src/pages/driver/WalletPage.tsx` | `Chuyển khoản đến Save Go Co.` → `BRAND.legalName` |
| `src/pages/customer/ProfilePage.tsx` | share title + text, `support@savego.com.vn` → `BRAND.supportEmail`, `Zalo OA: Save Go` → `BRAND.zaloOa` |

### Backend

| File | Thay đổi |
|---|---|
| `.env.example` | `APP_NAME="GreenCA"`, `MAIL_FROM_ADDRESS="noreply@greenca.vn"`, `VAPID_SUBJECT=mailto:admin@greenca.vn` |
| `config/services.php` | default VAPID subject → `mailto:admin@greenca.vn` |

Lưu ý: `backend/.env` (không commit) trên máy dev và trên server cần sửa tay tương ứng — ghi rõ trong plan như một bước thủ công.

### Deploy / docs

- Xoá `deploy/nginx/savego.conf` và `deploy/nginx/savego-common.conf`. Lý do: `deploy/nginx/README.md` đã ghi chúng là bẫy 502 (socket `php8.4-fpm.sock` sai với production PHP 8.5), và `greenca.vn.conf` + `greenca-common.conf` đã thay thế đầy đủ cả 3 app.
- `deploy/nginx/README.md`: bỏ hàng bảng và mục cảnh báo về `savego-*`, đổi `savego.com.vn` → `greenca.vn`.
- `CLAUDE.md`: dòng 96 đổi `savego.com.vn` / `driver.savego.com.vn` → `greenca.vn` / `driver.greenca.vn`.

## Verification

1. Screenshot logo render ở 512px và 16px, xem mắt thường **trước** khi wire vào toàn app.
2. Build cả 3 target pass:
   ```
   docker compose exec frontend npm run build:customer
   docker compose exec frontend npm run build:driver
   docker compose exec frontend npm run build:admin
   ```
3. Kiểm tra manifest sinh ra trong `dist*/manifest.webmanifest` mang đúng `name` / `short_name` từng app.
4. Grep `savego|SaveGo|Save Go` (loại `node_modules`, `.git`, `vendor`, `dist*`, `.claude/worktrees`) chỉ còn hit trong `docs/superpowers/` — spec và plan lịch sử, giữ nguyên.
5. `docker compose exec app php artisan test` pass (đảm bảo đổi `services.php` không phá gì).
