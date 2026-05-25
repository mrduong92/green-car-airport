# Push Notification — Spec

## Tổng quan

Gửi push notification đến khách hàng và tài xế khi trạng thái booking/trip thay đổi. Không dùng Firebase — dùng **Web Push API + VAPID** (browser-native, miễn phí, không cần tài khoản ngoài).

---

## Transport: Web Push VAPID

| | Web Push VAPID |
|---|---|
| Chi phí | ✅ Miễn phí hoàn toàn |
| Tài khoản ngoài | ✅ Không cần (không cần Firebase) |
| Android PWA | ✅ Chrome, Edge |
| iOS PWA (≥16.4) | ✅ Safari |
| Desktop | ✅ Chrome, Firefox, Edge |
| Background push (app đóng) | ✅ |
| Cài đặt | ✅ Generate VAPID key pair 1 lần, lưu `.env` |

> Kỹ thuật: Chrome route qua Google push servers nhưng transparent — không cần account hay config Firebase gì.

---

## Use Cases

### Khách hàng (8 trigger)

| # | Trigger | Tiêu đề | Nội dung |
|---|---|---|---|
| K1 | `store()` → `finding_driver` | Đặt xe thành công | Đang tìm tài xế cho chuyến #{id}... |
| K2 | `accept()` → `accepted` | Tìm được tài xế! | {driver_name} đang trên đường đến đón bạn |
| K3 | `updateStatus()` → `in_progress` | Chuyến đi bắt đầu | Bạn đang trên đường đến {destination} |
| K4 | `updateStatus()` → `completed` | Hoàn thành chuyến | Cảm ơn bạn! Chuyến #{id} · {final_price}đ |
| K5 | Driver `cancel()` → `finding_driver` | Tài xế đã huỷ cuốc | Đang tìm tài xế mới cho bạn... |
| K6 | `bookings:expire` (24h) → `cancelled` | Không tìm được tài xế | Chuyến #{id} đã bị huỷ do không có tài xế |
| K7 | Customer `cancel()` → `cancelled` | Đã huỷ chuyến | Chuyến #{id} đã được huỷ thành công |
| K8 | Affiliate reward → voucher created | Nhận thưởng giới thiệu! | Bạn nhận được voucher 50k từ lần giới thiệu |

### Tài xế (5 trigger)

| # | Trigger | Tiêu đề | Nội dung |
|---|---|---|---|
| T1 | `store()` → `finding_driver` | Có cuốc mới! | {pickup} → {destination} · {price}đ · {distance}km |
| T2 | `accept()` thành công | Nhận cuốc thành công | Cuốc #{id} đã nhận. Hãy đến đón khách. |
| T3 | Customer `cancel()` khi đã `accepted` | Khách đã huỷ chuyến | Khách huỷ cuốc #{id}. Phí app đã trừ không hoàn. |
| T4 | `updateStatus()` → `completed` | Hoàn thành chuyến! | Bạn nhận {net_earning}đ từ cuốc #{id} |
| T5 | Admin block driver | Tài khoản bị khoá | Tài khoản của bạn đã bị tạm khoá. Liên hệ hỗ trợ. |

> **T1** là broadcast đến **tất cả driver `is_online = true`** — gửi qua queue để không block response.

---

## Architecture

```
Controller action
    ↓
$user->notify(new XxxNotification(...))   [ShouldQueue]
    ↓
WebPushChannel (minishlink/web-push) + database channel
    ↓
Browser push service → PWA Service Worker
    ↓  background           ↓  foreground (app đang mở)
OS notification          postMessage → in-app toast
    ↓
click → navigate đến booking/trip
```

---

## Schema

### `device_tokens` table (migration mới)
| Cột | Kiểu | Mô tả |
|---|---|---|
| `user_id` | FK → users.id | Chủ sở hữu |
| `subscription` | `json` | Push subscription object: `{ endpoint, keys: { p256dh, auth } }` |
| `platform` | `string` default `web` | web / android / ios |
| `last_used_at` | `timestamp` nullable | Cập nhật mỗi khi gửi thành công |
| UNIQUE | `(user_id, subscription->endpoint)` | Tránh duplicate |

> Tự dọn expired subscriptions: khi `minishlink/web-push` báo subscription expired → xoá row.

### `notifications` table
Dùng Laravel built-in: `php artisan notifications:table`. Lưu lịch sử + `read_at` (null = chưa đọc).

---

## Môi trường / Config

```env
# backend/.env
VAPID_PUBLIC_KEY=Bxxx...          # generate 1 lần bằng VAPID::createVapidKeys()
VAPID_PRIVATE_KEY=xxx...
VAPID_SUBJECT=mailto:admin@greencar.vn

# frontend/.env
VITE_VAPID_PUBLIC_KEY=Bxxx...     # same as backend public key
```

**Không cần** Firebase account, service account JSON, hay Firebase console.

---

## Backend — Files cần tạo/sửa

| File | Thay đổi |
|---|---|
| `database/migrations/[ts]_create_device_tokens_table.php` | Tạo mới |
| `database/migrations/[ts]_create_notifications_table.php` | `artisan notifications:table` |
| `app/Models/DeviceToken.php` | Tạo mới |
| `app/Channels/WebPushChannel.php` | Custom channel — gửi qua minishlink, dọn expired |
| `app/Notifications/` (13 classes) | K1–K8, T1–T5 — tất cả `ShouldQueue` |
| `app/Http/Controllers/DeviceTokenController.php` | `store()` + `destroy()` |
| `app/Http/Controllers/NotificationController.php` | `index()`, `unreadCount()`, `readAll()`, `markRead()` |
| `app/Http/Controllers/Customer/BookingController.php` | Dispatch K1, K7 |
| `app/Http/Controllers/Driver/TripController.php` | Dispatch K2, K3, K4, K5, T2, T3, T4; broadcast T1 |
| `app/Console/Commands/ExpireStaleBookings.php` | Dispatch K6 |
| `routes/api.php` | 6 routes mới (device-token + notifications) |
| `composer.json` | `minishlink/web-push` |

---

## Frontend — Files cần tạo/sửa

| File | Thay đổi |
|---|---|
| `src/push.ts` | `registerPushSubscription()` — request permission, subscribe, POST /device-token |
| `public/sw-push.js` | Handle `push` event (show OS notification) + `notificationclick` (navigate) |
| `vite.config.ts` | Tích hợp sw-push.js vào service worker (injectManifest mode) |
| `src/hooks/useNotifications.ts` | Tạo mới — unread count + foreground message → toast |
| `src/api/notifications.ts` | Tạo mới — `getNotifications`, `getUnreadCount`, `readAll`, `markRead` |
| `src/pages/customer/NotificationsPage.tsx` | Replace placeholder: list + đọc + navigate |
| `src/pages/driver/NotificationsPage.tsx` | Replace placeholder: list + đọc + navigate |
| `src/layouts/CustomerLayout.tsx` | Badge đỏ trên tab Thông báo |
| `src/layouts/DriverLayout.tsx` | Badge đỏ trên tab Thông báo |

---

## Notification click → deep link

| `data.action` | Navigate đến |
|---|---|
| `view_booking` | `/customer/booking/{data.booking_id}` |
| `view_trip` | `/driver/trips/{data.booking_id}` |
| `view_wallet` | `/driver/wallet` |
| _(default)_ | `/` |

---

## Verification

```bash
# Generate VAPID keys:
php artisan tinker
>>> \Minishlink\WebPush\VAPID::createVapidKeys()
# Copy vào .env

make fresh

# 1. Đăng nhập → browser hỏi permission → allow
#    → POST /device-token với subscription object ✓

# 2. Driver nhận cuốc (K2):
#    → customer nhận "Tìm được tài xế!" notification ✓

# 3. New booking (T1 broadcast):
#    → tất cả driver is_online=true nhận "Có cuốc mới!" ✓

# 4. Background push:
#    → đóng tab → trigger status change → OS notification xuất hiện ✓
#    → click notification → mở app đúng trang ✓

# 5. Foreground toast:
#    → app đang mở → nhận push → hiện toast thay vì OS notification ✓

# 6. Badge unread:
#    → nhận notification → tab Thông báo hiện badge đỏ ✓
#    → mở NotificationsPage → đọc hết → badge biến mất ✓

# 7. Logout:
#    → DELETE /device-token → xoá subscription → không nhận push nữa ✓

# 8. Expired subscription cleanup:
#    → simulate expired endpoint → WebPushChannel tự xoá row ✓
```
