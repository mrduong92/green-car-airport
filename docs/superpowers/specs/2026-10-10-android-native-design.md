# Bản Android native (khách hàng + tài xế) có push FCM — Design Spec

**Date:** 2026-10-10
**Nhánh:** `feat/android-native` (từ `origin/main`), 1 PR.
**Spec gốc:** `docs/superpowers/specs/2026-08-02-mobile-native-apps-design.md` trên nhánh `poc/capacitor-android` — toàn bộ dự án native (2 app × 2 nền tảng). Spec này là **lát Android đầu tiên** của dự án đó; chỗ nào hai spec lệch nhau thì spec này thắng cho phạm vi của nó.

---

## Mục tiêu

Hai app Android đã ký — **GreenCA** (`vn.greenca.customer`) và **GreenCA Tài Xế** (`vn.greenca.driver`) — chạy toàn bộ tính năng PWA hiện tại, có **push FCM thật** với âm báo riêng "Green CA, Green CA" cho cuốc mới, trỏ về **staging** (`webco.io.vn` / `driver.webco.io.vn`).

Đầu ra mỗi app: một **APK** để gửi Zalo cài thử và một **AAB** sẵn sàng upload Play closed testing, **cùng chữ ký** để bản từ Play cài đè được lên bản APK.

PWA web giữ nguyên hành vi.

## Ngoài phạm vi (lát sau)

- iOS — làm sau khi Android ổn. Thiết kế giữ sẵn chỗ: push đi qua FCM nên iOS chỉ thêm khối `apns` trong `FcmTransport`.
- Xoá tài khoản, tài khoản reviewer (`AUTH_REVIEW_PHONE`), lưu token bằng Keystore — bắt buộc trước khi nộp **production**, không chặn closed testing.
- Proxy Goong — PR riêng (code viết dở đang nằm untracked trong working tree chính: `PlacesController`, `GoongClient`, migration `goong_api_calls`, `PlacesProxyTest`).
- Màn hướng dẫn tắt tối ưu pin theo hãng máy — chờ kết quả nghiệm thu máy thật.
- Âm báo xuyên chế độ Không làm phiền; âm báo lặp liên tục kiểu cuộc gọi đến (Play chỉ cấp full-screen intent cho app gọi điện/báo thức từ Android 14).
- Build trỏ production — cùng quy trình, chỉ đổi `VITE_API_BASE_URL` lúc build.

## Quyết định đã chốt

| Vấn đề | Chọn | Lý do |
|---|---|---|
| Nhánh | Nhánh mới từ `origin/main`, cherry-pick 4 commit của `poc/capacitor-android` | POC tụt 65 commit; cherry-pick 4 commit ít xung đột hơn rebase |
| Gửi FCM | `kreait/laravel-firebase` + `PushChannel` tự viết | Mỗi notification viết payload **một lần** (`toPush`), transport tự dịch ra Web Push / FCM. Thêm iOS không đụng 13 notification |
| Bundle native | Mode Vite `native` trên 2 config hiện có, xuất `dist-native/`, `dist-driver-native/` | Không đè bản build web, không dính cấu hình native vào web |
| Bản đồ Goong | Giữ `@goongmaps/goong-js` trong WebView | WebView Android là Chromium, có WebGL; SDK native chỉ đáng khi có theo dõi xe realtime (ngoài phạm vi) |
| Khoá ký | Tự tạo app signing key, nộp cho Play App Signing bằng "Use my own key" | APK Zalo và bản Play cùng chữ ký → cài đè, không phải gỡ app |
| Âm báo | TTS tiếng Việt, là **bản chính thức** | GreenCA không thu giọng thật |
| Buộc cập nhật | Có ngay trong lát này | Cơ chế chỉ bảo vệ những bản đã chứa nó |

---

## 1. Vỏ app và tương thích tính năng

### Cấu trúc

```
mobile/
├── .gitignore
├── keystore.properties          # gitignore — đường dẫn + mật khẩu keystore
├── customer/                    # từ POC
│   ├── capacitor.config.ts      # appId vn.greenca.customer, webDir ../../frontend/dist-native
│   ├── package.json             # version app + plugin Capacitor (cho cap sync)
│   └── android/                 # commit vào git
└── driver/                      # MỚI, dựng giống customer
    ├── capacitor.config.ts      # appId vn.greenca.driver, webDir ../../frontend/dist-driver-native
    ├── package.json
    └── android/
```

- Tên app: **GreenCA**, **GreenCA Tài Xế** — lấy từ `frontend/src/brand.ts`, không hardcode chỗ khác.
- `server: { androidScheme: 'https', hostname: 'app.greenca.vn' }` (khách) / `'driver-app.greenca.vn'` (tài xế). Bắt buộc: hostname mặc định `localhost` khớp `SANCTUM_STATEFUL_DOMAINS` mặc định → Sanctum bắt CSRF → mọi request 419 (đã dính ở POC).
- Phiên bản Capacitor 8, minSdk 24, targetSdk 36.
- Plugin JS khai ở **cả** `frontend/package.json` (để bundle) và `mobile/<app>/package.json` (để `cap sync` sinh mã native), **cùng phiên bản**: `@capacitor/core`, `@capacitor/app`, `@capacitor/push-notifications`, `@capacitor/share`, `@capacitor/status-bar`, `@capacitor/splash-screen`. Dev: `@capacitor/cli`, `@capacitor/android`, `@capacitor/assets`.

### Bảng tương thích PWA → WebView

| Tính năng | Chỗ dùng | Xử lý |
|---|---|---|
| Web Push | `src/push.ts` | Tách `src/push/` — mục 3 |
| Trang/banner cài PWA | `InstallPage`, `usePwaInstall`, `AppHeader`, `SplashPage`, `bootstrap.tsx`, 2 `ProfilePage`, `PushNotificationSettings` | Ẩn khi `isNativeApp()`; route `/install` không đăng ký trong native |
| `navigator.share` | `pages/customer/ProfilePage`, `pages/driver/ProfilePage` | WebView không hỗ trợ → facade `src/share.ts`: native dùng `@capacitor/share`, web giữ nguyên |
| `navigator.geolocation` | `AddressInput`, `driver/TripListPage` | Khai `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` trong `AndroidManifest.xml`; Capacitor tự hiện hộp xin quyền |
| `tel:` | `driver/TripDetailPage`, `customer/ProfilePage`, `customer/BookingStatusPage` | Capacitor mở intent ngoài — chỉ kiểm thử |
| Clipboard | `driver/TopUpPage`, 2 `ProfilePage` | Chỉ kiểm thử |
| `zalo://` | Cuốc Free | Kiểm thử; bị chặn thì dùng `@capacitor/app-launcher` |
| Bản đồ + REST Goong | `GoongTripMap`, `api/goong.ts`, `useGoongAutocomplete` | Chạy nguyên trong WebView. Kiểm: key Goong có khoá theo domain không (nếu có → thêm origin app vào whitelist Goong); hiệu năng trên máy thật |
| Nút Back Android | — | `@capacitor/app` `backButton`: còn lịch sử thì `history.back()`, ở trang gốc thì `App.exitApp()` |
| Icon, splash, status bar | — | `@capacitor/assets` sinh từ `public/icons`; status bar màu `primary` `#006a36`, chữ sáng |

`src/platform.ts` (mới): `isNativeApp()` = `Capacitor.isNativePlatform()`. Mọi nhánh native/web đi qua hàm này hoặc một facade.

### Buộc cập nhật

**Backend:** `GET /api/app/version?app=customer|driver&platform=android` — công khai, không auth.

```json
{ "min_supported": "1.0.0", "latest": "1.0.0", "store_url": "https://play.google.com/store/apps/details?id=vn.greenca.driver" }
```

- `min_supported`, `latest` lưu `AppSetting`, key `app_version_{platform}_{app}_min` / `_latest` (4 key). Chưa có thì lấy mặc định `config/app_versions.php` (`1.0.0`).
- `store_url` lấy từ `config/app_versions.php` theo app.
- Admin sửa 4 giá trị ở trang Cài đặt hiện có: thêm vào `AppSettingController` (show + validate `regex:/^\d+\.\d+\.\d+$/`) và một nhóm "Phiên bản app" trên trang cài đặt admin.
- Tham số sai → 422.

**Frontend:** `src/hooks/useAppVersionGate.ts` + `components/common/ForceUpdateScreen.tsx`, chỉ chạy khi `isNativeApp()`.

- Gọi lúc khởi động và mỗi lần app quay lại từ nền (`App.addListener('appStateChange')`).
- Phiên bản hiện tại lấy từ `App.getInfo().version` — **không** lấy từ hằng số trong bundle.
- `< min_supported` → màn chặn toàn màn hình, chỉ có nút "Cập nhật" mở `store_url`.
- `< latest` → banner nhắc, bỏ qua được.
- Endpoint lỗi / mất mạng → **cho vào app** (fail-open).
- So sánh semver tự viết 10 dòng, không thêm thư viện.

---

## 2. Push — backend

### Dữ liệu

Migration mới (không sửa migration cũ) trên `device_tokens`:

- Thêm `fcm_token` `string(255)` nullable, unique.
- `endpoint`, `p256dh`, `auth` → nullable.
- `platform` giữ nguyên cột, nhận thêm `android` (sau này `ios`).

Mỗi dòng là **một** trong hai loại: có `endpoint` (Web Push) hoặc có `fcm_token` (FCM). `DeviceToken::$fillable` thêm `fcm_token`.

### API `device-token` — tương thích ngược

`POST /api/device-token`:

- Dạng cũ `{ subscription: {endpoint, keys{p256dh, auth}}, platform? }` — giữ nguyên, bản web đang chạy vẫn gửi dạng này.
- Dạng mới `{ fcm_token, platform: 'android' }` → `updateOrCreate(['fcm_token' => …], ['user_id' => …, 'platform' => …, 'last_used_at' => now()])`. Cùng một máy đăng nhập tài khoản khác → token chuyển sang user mới.
- Validate: phải có đúng một trong hai (`required_without`).

`DELETE /api/device-token`: nhận `endpoint` **hoặc** `fcm_token`, luôn lọc theo `user_id` hiện tại.

### `PushChannel`

```
app/Channels/
├── PushChannel.php                # thay WebPushChannel
└── Push/
    ├── PushTransport.php          # interface: send(Collection $tokens, array $payload): void
    ├── WebPushTransport.php       # nguyên mã WebPushChannel hiện tại
    └── FcmTransport.php           # kreait Messaging::sendMulticast
```

`PushChannel::send()`: bỏ qua nếu notification không có `toPush`; lấy token của user; chia nhóm `endpoint` / `fcm_token`; gọi transport tương ứng với nhóm không rỗng. Mỗi transport tự bắt lỗi, ghi `Log::warning`, không ném ra ngoài — một transport hỏng không chặn transport kia.

`FcmTransport`:

- Không cấu hình `FIREBASE_CREDENTIALS` → không gửi, `Log::warning` một lần mỗi lần gọi, return.
- Dùng `MulticastSendReport`: token nằm trong `invalidTokens()` / `unknownTokens()` → xoá dòng `device_tokens`; thành công → cập nhật `last_used_at`.

`WebPushChannel.php` bị xoá; 13 notification đổi `via()` sang `PushChannel::class` và đổi tên `toWebPush` → `toPush`.

### Payload `toPush`

Giữ nguyên khung hiện tại, thêm 2 khoá tuỳ chọn:

```php
[
    'title'   => 'Có cuốc mới!',
    'body'    => '…',
    'data'    => ['action' => 'view_trip', 'booking_id' => 123],
    'tag'     => 'greenca-free-ride',   // tuỳ chọn, như hiện tại
    'channel' => 'new_ride',            // MỚI, tuỳ chọn: 'new_ride' | 'general' (mặc định)
    'ttl'     => 300,                   // MỚI, tuỳ chọn, giây
]
```

`WebPushTransport` bỏ qua `channel`, `ttl` (gửi nguyên payload như hôm nay — `sw.ts` không đổi hành vi).

`FcmTransport` dịch:

| Payload | Message FCM |
|---|---|
| `title`, `body` | `notification.title`, `notification.body` — hệ thống tự hiện kể cả khi app bị tắt |
| `data.*` | `data`, mọi giá trị ép `(string)`; thêm `data.channel` để JS biết kênh khi app đang mở |
| `tag` | `android.notification.tag` |
| `channel` | `android.notification.channel_id` (mặc định `general`) |
| luôn | `android.priority = 'high'` |
| `ttl` | `android.ttl = "{ttl}s"` |

Dùng kênh `new_ride` + `ttl = 300`: `NewBookingAvailableNotification`, `FreeRideMatchNotification`. Mọi notification khác: `general`, không ttl.

### Cấu hình

- `composer require kreait/laravel-firebase`; publish `config/firebase.php`.
- `.env`: `FIREBASE_CREDENTIALS=/path/ngoài/git/firebase-service-account.json`. Thêm vào `.env.example` (để trống) và `docs/DEPLOY.md` (đặt file ở đâu, quyền đọc cho `www-data`).
- Push đi qua queue — phải có queue worker (đã đúng hôm nay).

---

## 3. Push — frontend

### `src/push.ts` → `src/push/`

```
src/push/
├── index.ts    # facade — export đúng các tên hiện có
├── web.ts      # nguyên mã push.ts
├── native.ts   # @capacitor/push-notifications
└── route.ts    # pushRoute(data): string — action → đường dẫn
```

`index.ts` export `getPushStatus`, `registerPushSubscription`, `syncPushSubscription`, `unregisterPushSubscription`, type `PushStatus`, `PushResult` — chọn `native.ts` khi `isNativeApp()`, ngược lại `web.ts`. 7 nơi gọi (`PushNotificationSettings`, `useLogout`, `usePushStatus`, `useAuthLogin`, `DriverRegisterPage`, `useNotifications`, `RegisterPage`) import `@/push` không phải sửa.

`route.ts`: chuyển đoạn ánh xạ ở `sw.ts` (`view_booking`, `view_trip`, `view_wallet`, `open_url` chỉ nhận đường dẫn bắt đầu `/` và không bắt đầu `//`) thành hàm thuần; `sw.ts` import lại hàm này.

### `native.ts`

- **`getPushStatus()`** — đồng bộ như bản web, đọc trạng thái quyền đã cache (cập nhật bởi `checkPermissions()` lúc khởi động và sau mỗi lần xin quyền): `prompt` / `prompt-with-rationale` → `default`, `granted` → `granted`, `denied` → `denied`. Không bao giờ trả `not-installed` / `no-key`.
- **`registerPushSubscription()`** — `requestPermissions()` (Android 13+ hiện hộp thoại) → `register()` → chờ sự kiện `registration` → `POST /device-token { fcm_token, platform: 'android' }`.
- **`syncPushSubscription()`** — chỉ khi đã `granted`: `register()` rồi gửi lại token (FCM có thể xoay token).
- **`unregisterPushSubscription()`** — `DELETE /device-token { fcm_token }` với token đã nhớ.
- **Khởi tạo một lần** (`initNativePush(navigate)`, gọi từ `bootstrap.tsx`):
  - `createChannel` `new_ride` — tên hiển thị "Cuốc mới", `importance: 5`, `sound: 'new_ride'`, rung — và `general` — "Thông báo chung", `importance: 4`. Gọi lặp lại vô hại.
  - `pushNotificationActionPerformed` → `navigate(pushRoute(data))`.
  - `pushNotificationReceived` (app đang mở, hệ thống không tự hiện): `data.channel === 'new_ride'` → phát âm báo; mọi loại → toast qua `useUiStore`.

API `src/api/notifications.ts`: `registerDeviceToken` / `removeDeviceToken` mở rộng nhận dạng FCM.

### Âm báo

- Nguồn duy nhất: `frontend/public/sounds/new_ride.ogg`.
- Bước build native chép sang `mobile/<app>/android/app/src/main/res/raw/new_ride.ogg` (tên resource: chữ thường, số, `_`).
- Phát khi app đang mở: `new Audio('/sounds/new_ride.ogg').play()`. Rủi ro: chính sách autoplay của WebView. Kiểm trên emulator; nếu bị chặn thì chuyển sang `@capacitor/local-notifications` hiện một thông báo cục bộ trên kênh `new_ride` (hệ thống tự phát đúng âm báo của kênh).
- **Kênh khoá âm báo khi đã tạo trên máy** — file phải chốt trước bản đầu tiên gửi đi. Đổi về sau = kênh mới `new_ride_v2`.

**Tạo file:**

- Google Cloud Text-to-Speech, giọng `vi-VN` Neural2/Wavenet, trong project GCP của Firebase (bật Text-to-Speech API). Không dùng `say` của macOS — giấy phép giọng hệ thống Apple không cho dùng thương mại.
- Nội dung "Green CA, Green CA", dài 2–4 giây, lặp sẵn trong file (Android chỉ phát một lần).
- Thử nhiều cách viết phiên âm (`Grin Xi Ây`, `Green C A`, SSML `<say-as>`…), xuất 2–3 phương án → chủ dự án nghe và chọn. Chuẩn hoá âm lượng, xuất `.ogg` (Vorbis, mono, 44.1 kHz).

---

## 4. Build, ký, phiên bản

### Mode Vite `native`

- `frontend/.env.native` (commit — chỉ có URL công khai): `VITE_API_BASE_URL`. Khách → `https://webco.io.vn`, tài xế → `https://driver.webco.io.vn`; Makefile truyền đè theo app, file chỉ giữ mặc định.
- `createAppConfig` ở mode `native`:
  - `injectRegister: false`, không đăng ký service worker.
  - `outDir` → `dist-native` / `dist-driver-native`.
  - **Không** áp `assertDeployEnv` phần VAPID (native không dùng Web Push); `VITE_REVERB_APP_KEY` vẫn bắt buộc.
- Script: `build:customer:native`, `build:driver:native`.
- `.gitignore` thêm `dist-native/`, `dist-driver-native/`, `dist-mobile/`.

### Khoá ký

- **Một keystore cho cả 2 app**: `~/.greenca/greenca-release.jks`, alias `greenca`, RSA 4096, hạn 30 năm.
- `mobile/keystore.properties` (gitignore): `storeFile`, `storePassword`, `keyAlias`, `keyPassword`. `build.gradle` đọc file này; thiếu file → build release dừng với thông báo rõ ràng.
- Khi tạo app trên Play Console: Play App Signing → **"Use my own key"** → tải khoá lên bằng PEPK. Bản Play và APK Zalo cùng chữ ký.
- **Chủ dự án cất bản sao keystore + mật khẩu vào kho bí mật công ty.** Mất khoá = không bao giờ cập nhật được app trên Play.

### Phiên bản

- `mobile/<app>/package.json` → `version` (bắt đầu `1.0.0`), riêng từng app.
- `build.gradle` đọc file đó: `versionName = version`, `versionCode = major*10000 + minor*100 + patch`.

### Makefile

```
make android-customer
make android-driver
```

Mỗi lệnh:

1. Build bundle web mode `native` (trong container `frontend`).
2. Chép `public/sounds/new_ride.ogg` → `res/raw/`.
3. `npx cap sync android` (máy host, trong `mobile/<app>`).
4. `./gradlew assembleRelease bundleRelease` với `JAVA_HOME` = JDK 21.
5. Chép ra `dist-mobile/greenca-<app>-<version>.apk` và `.aab`.

### Môi trường máy build

- JDK 21: `brew install --cask temurin@21` (máy đang chỉ có JDK 18). Makefile tự tìm bằng `/usr/libexec/java_home -v 21`.
- Android SDK đã có; emulator `android-36 google_apis_playstore x86_64` đã có.
- Node ≥ 22 trên host cho Capacitor CLI.

### Firebase (chủ dự án làm)

1. Đăng nhập `console.firebase.google.com` bằng **Google account phát hành** (cùng account dùng cho Play Console).
2. Tạo project `GreenCA`, tắt Google Analytics (không cần).
3. Thêm app Android `vn.greenca.customer` (tên "GreenCA") → tải `google-services.json`.
4. Thêm app Android `vn.greenca.driver` (tên "GreenCA Tài Xế") → tải `google-services.json` thứ hai. (Một project chứa cả 2 app → backend dùng chung một service account.)
5. Project settings → Service accounts → **Generate new private key** → file JSON.
6. Google Cloud Console cùng project → bật **Cloud Text-to-Speech API** (để tạo âm báo).
7. Gửi 3 file qua kênh riêng tư, không qua chat nhóm. `google-services.json` đặt ở `mobile/<app>/android/app/` (commit được — không phải bí mật); service account JSON chỉ đặt trên server, **không commit**.

---

## 5. Kiểm thử và nghiệm thu

### Tự động (trước khi mở PR)

**Backend — PHPUnit** (`make test`), fake `Kreait\Firebase\Contract\Messaging`:

- `FcmTransport`: dịch đúng `channel_id`, `tag`, `priority`, `ttl`; mọi giá trị `data` là chuỗi; có `data.channel`; token invalid/unknown bị xoá; thành công cập nhật `last_used_at`.
- `PushChannel`: user có cả token web và FCM → gọi cả hai transport; thiếu `FIREBASE_CREDENTIALS` → Web Push vẫn gửi; notification không có `toPush` → không làm gì.
- `NewBookingAvailableNotification`, `FreeRideMatchNotification` → `channel = new_ride`, `ttl = 300`; notification khác → không có `channel`.
- `DeviceTokenController`: dạng `subscription` cũ vẫn chạy; dạng `fcm_token` tạo dòng; cùng `fcm_token` user khác → chuyển chủ; thiếu cả hai → 422; `DELETE` theo `fcm_token` chỉ xoá của chính user.
- `GET /api/app/version`: mặc định từ config; ưu tiên `AppSetting`; tham số sai → 422; không cần auth.
- `AppSettingController`: lưu/đọc 4 key phiên bản, chặn chuỗi không phải semver.
- 3 test đang gọi `toWebPush` (`NewBookingNotificationChannelsTest`, `FreeRideAlertTest`, `FreeRideMergeTest`) đổi sang `toPush` / `PushChannel`.
- Toàn bộ suite cũ xanh.

**Frontend:**

- `build:customer`, `build:driver`, `build:admin` mode production vẫn build và vẫn chặn khi thiếu VAPID.
- `build:customer:native`, `build:driver:native` build được khi không có VAPID.
- `npm run test:e2e` trên web xanh (smoke, referral, free-rides) — bảo đảm tách `push/`, `route.ts`, ẩn UI PWA không làm hỏng web.

**Build native:** `make android-customer`, `make android-driver` ra đủ APK + AAB; `apksigner verify --print-certs` hai APK cùng SHA-256 chứng chỉ.

### Emulator (`android-36 google_apis_playstore`)

| App | Kịch bản |
|---|---|
| Cả 2 | Splash → đăng nhập PIN → API chạy, không 419. Back Android quay lại trang trước, ở trang gốc thì thoát. Không còn trang/banner cài PWA. Icon, tên app, status bar đúng |
| Cả 2 | Buộc cập nhật: đặt `min` > phiên bản app → màn chặn; đặt `latest` > phiên bản → banner; tắt mạng → vẫn vào app |
| Khách | Đặt xe: autocomplete Goong, GPS (vị trí giả), bản đồ lộ trình, chia sẻ mã giới thiệu mở khay hệ thống, `tel:` mở trình gọi, sao chép mã |
| Khách | Tài xế nhận cuốc → khách nhận push FCM khi app ở nền; chạm → đúng trang chuyến |
| Tài xế | Khách đặt xe → push "Có cuốc mới" kêu "Green CA, Green CA" ở 3 trạng thái: đang mở, ở nền, bị vuốt tắt. Chạm → đúng chuyến. Đang mở thì danh sách cập nhật realtime qua Reverb |
| Tài xế | Cuốc Free → kênh `new_ride`, không đè push cuốc trả khách; nút `zalo://` mở Zalo (nếu có cài) |
| Tài xế | Đăng xuất → hết nhận push. Đăng nhập tài khoản khác trên cùng máy → push về đúng người |

### Máy thật (1 máy Xiaomi hoặc Samsung, mượn)

- Khoá màn hình 30 phút (Doze) → đặt cuốc → push về và kêu.
- Bản đồ Goong mượt, GPS thật đúng.
- Hãng máy chặn chạy nền → ghi các bước tắt tối ưu pin vào `docs/MOBILE.md`.

### Tiêu chí xong

1. Mọi kịch bản emulator đạt + kịch bản Doze trên máy thật đạt.
2. 2 cặp APK + AAB đã ký cùng khoá.
3. `docs/MOBILE.md` cập nhật: cài JDK, tạo Firebase, keystore, `make android-*`, cài APK, biến môi trường server; `docs/DEPLOY.md` thêm `FIREBASE_CREDENTIALS`.
4. PR `feat/android-native` với test tự động xanh.

---

## Rủi ro

| Rủi ro | Xử lý |
|---|---|
| Autoplay âm báo trong WebView bị chặn | Phương án dự phòng `@capacitor/local-notifications` (mục 3) |
| Key Goong khoá theo domain | Thêm origin `app.greenca.vn`, `driver-app.greenca.vn` vào whitelist Goong |
| ROM Xiaomi/Samsung giết app ở nền → mất push | Notification message + `priority high` là mức tốt nhất phía server; phần còn lại là cài đặt tối ưu pin của người dùng → tài liệu hướng dẫn, màn hướng dẫn trong app ở lát sau |
| Phiên bản plugin Capacitor lệch giữa `frontend/` và `mobile/<app>/` | Ghim cùng phiên bản chính xác; kiểm trong bước build |
| Staging deploy thiếu `FIREBASE_CREDENTIALS` | FCM tự tắt có log, Web Push không ảnh hưởng; checklist trong `DEPLOY.md` |
| Mất keystore | Bản sao trong kho bí mật công ty + bản Google giữ qua Play App Signing |
