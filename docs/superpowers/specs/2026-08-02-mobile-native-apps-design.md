# App Native Android/iOS bằng Capacitor — Design Spec

**Date:** 2026-08-02
**Scope:** Đóng gói app Khách hàng và app Tài xế thành ứng dụng native Android + iOS bằng Capacitor, phát hành lên CH Play và App Store. Thay Web Push bằng FCM/APNs cho bản native. Bổ sung chức năng xoá tài khoản (bắt buộc theo chính sách store).

---

## Vấn đề

GreenCA hiện là PWA với 3 build target (`dist/` khách hàng, `dist-driver/` tài xế, `dist-admin/` admin). Chủ sản phẩm cần app có mặt trên CH Play và App Store vì bốn lý do:

1. **Marketing và uy tín** — người dùng phổ thông tìm app trên store, không ai biết "Thêm vào màn hình chính".
2. **Push notification không tin cậy** — iOS Safari chỉ cho phép Web Push khi PWA đã được cài vào màn hình chính (iOS 16.4+), và iOS thu hồi quyền khá tuỳ tiện. Tài xế bỏ lỡ cuốc là thiệt hại trực tiếp.
3. **Trải nghiệm** — không phụ thuộc trình duyệt, có splash native, không thanh địa chỉ.
4. **Yêu cầu từ chủ app**.

## Mục tiêu

- Hai ứng dụng native trên cả CH Play và App Store: **GreenCA** (khách hàng) và **GreenCA Tài Xế**.
- Giữ **một codebase UI duy nhất** — `frontend/src` phục vụ đồng thời web PWA và app native. Sửa một lần, chạy cả hai.
- Push notification native qua FCM (Android) và APNs (iOS, chuyển tiếp bởi FCM), với chuông riêng độ ưu tiên cao cho thông báo "Có cuốc mới" xuyên qua chế độ im lặng/Tập trung.
- Đạt điều kiện duyệt của Apple và Google ngay từ vòng nộp đầu: xoá tài khoản trong app, tài khoản demo cho reviewer, khai báo quyền riêng tư, đủ tính năng native để không bị coi là website đóng gói.
- PWA hiện tại tiếp tục hoạt động nguyên vẹn trong và sau dự án.

## Ngoài phạm vi

- **Theo dõi vị trí tài xế realtime.** Hệ thống hiện chỉ dùng GPS một lần để điền điểm đón; bản đồ hiển thị lộ trình của khách chứ không cập nhật vị trí xe. Không bổ sung trong đợt này — sẽ là spec riêng.
- **App Admin.** Giữ nguyên PWA web trên `admin.*`. Admin dùng desktop, lên store không có giá trị và dễ bị Apple từ chối vì "app chỉ dành cho nội bộ".
- **Universal Links / App Links** (mở link `greenca.vn` bằng app). Cần đặt file xác thực lên server và cấu hình cả hai nền tảng; giá trị chủ yếu là marketing. Phase sau.
- **Cập nhật OTA** (đẩy bản sửa lỗi JS không qua store, ví dụ Capgo). Phase sau.
- **CI/CD ký và nộp tự động.** Tần suất phát hành ban đầu thấp, dựng pipeline ký app tốn công ngang phần còn lại. Build thủ công qua Xcode/Android Studio, có Makefile hỗ trợ hai nhịp đầu.
- **Viết lại UI bằng React Native hoặc Flutter.** Xem mục "Phương án đã cân nhắc".
- **Đăng nhập sinh trắc học, widget, Live Activity, CarPlay/Android Auto.**

---

## Phương án đã cân nhắc

| Phương án | Kết luận |
|---|---|
| **Capacitor** — bọc bundle web hiện có, gọi API native qua plugin | **Chọn.** Tái sử dụng ~95% code, team React hiện tại làm được, ~4 tuần. Đánh đổi: UI vẫn render bằng WebView, rủi ro Apple 4.2. |
| **React Native / Expo** — viết lại UI, dùng chung tầng API | Loại. Viết lại ~40 màn hình, 3-5 tháng, cần dev mobile, từ đó mọi tính năng phải làm hai lần. Goong Maps không có SDK React Native chính thức. Trái ràng buộc "nhanh, team hiện tại". |
| **Flutter** | Loại. Cùng chi phí như React Native nhưng tái sử dụng 0% (Dart), và bản thân Flutter cũng tự vẽ UI lên canvas chứ không dùng widget gốc của OS — không "native" hơn Capacitor về mặt bản chất giao diện. |
| **TWA (Android) + PWABuilder (iOS)** | Loại. Rẻ nhất (1-2 ngày) nhưng không kiểm soát được gì, và iOS gần như chắc chắn bị từ chối theo điều 4.2. |

**Ranh giới thiết kế cần giữ:** mọi thứ chạm vào API hệ điều hành phải nằm sau một facade ở tầng web (`src/push/`, `src/platform.ts`). Nếu sau này app tài xế cần chuyển sang native thật, phần thay thế là các facade đó, không đụng đến app khách hàng và không đụng đến logic nghiệp vụ.

---

## 1. Cấu trúc repo

Nguyên tắc: **web build là nguồn duy nhất**. Hai project native chỉ là vỏ, không chứa logic nghiệp vụ.

```
green-car-airport/
├── frontend/
│   ├── dist/                      # app khách hàng đọc thư mục này
│   ├── dist-driver/               # app tài xế đọc thư mục này
│   ├── package.json               # thêm các gói plugin Capacitor (cho bundle JS)
│   └── src/
│       ├── platform.ts            # MỚI — isNativeApp(), nhận biết nền tảng
│       ├── push/                  # MỚI — tách từ push.ts
│       │   ├── index.ts           #   facade: chọn web hay native
│       │   ├── web.ts             #   nguyên mã push.ts hiện tại
│       │   ├── native.ts          #   FCM qua Capacitor
│       │   └── route.ts           #   ánh xạ action → đường dẫn (dùng chung với sw.ts)
│       └── sw.ts                  # dùng lại route.ts thay vì tự ánh xạ
├── mobile/
│   ├── customer/
│   │   ├── capacitor.config.ts    # appId vn.greenca.customer, webDir ../../frontend/dist
│   │   ├── package.json           # các plugin Capacitor (cho cap sync sinh mã native)
│   │   ├── android/               # project Android Studio — commit vào git
│   │   └── ios/                   # project Xcode — commit vào git
│   └── driver/                    # tương tự, appId vn.greenca.driver
└── docs/MOBILE.md                 # MỚI — hướng dẫn build, ký, phát hành
```

**Vì sao hai thư mục native riêng thay vì một:** mỗi app cần app ID, tên, icon, chứng chỉ ký và bản ghi store riêng. Capacitor chỉ hỗ trợ một `capacitor.config.ts` cho mỗi project native; gộp lại phải viết script đổi config qua lại — dễ ký nhầm chứng chỉ, hậu quả không sửa được.

**Về việc khai báo plugin ở hai nơi.** Các gói plugin Capacitor phải xuất hiện trong `frontend/package.json` (vì mã trong `frontend/src` import chúng khi build bundle JS) *và* trong `mobile/<app>/package.json` (vì `npx cap sync` đọc dependencies tại thư mục project để sinh mã native tương ứng). Hai nơi phục vụ hai mục đích khác nhau nhưng phải cùng phiên bản. Giải pháp: một script `scripts/check-capacitor-deps.mjs` so khớp danh sách và **fail** nếu lệch, chạy tự động trong bước sync.

*Đã cân nhắc npm workspaces để khai báo một lần* — loại, vì `frontend` chạy trong container Docker với `node_modules` riêng, chuyển sang workspaces sẽ phải sửa `docker-compose.yml` và Dockerfile, rủi ro cao hơn lợi ích.

### Định danh ứng dụng

| | Khách hàng | Tài xế |
|---|---|---|
| App ID | `vn.greenca.customer` | `vn.greenca.driver` |
| Tên hiển thị | GreenCA | GreenCA Tài Xế |
| webDir | `../../frontend/dist` | `../../frontend/dist-driver` |

App ID **không đổi được** sau khi phát hành lên store. Chốt trước khi tạo bản ghi ứng dụng.

---

## 2. Ba thay đổi bắt buộc ở tầng web

### 2.1 URL API tuyệt đối

`frontend/src/api/axios.ts` hiện dùng `baseURL: '/api'` tương đối, dựa vào proxy của Vite khi dev và cùng origin khi production. Trong app native, trang được nạp từ `capacitor://localhost` (iOS) hoặc `https://localhost` (Android), nên `/api` trỏ vào chính vỏ app và mọi request chết.

Thêm biến `VITE_API_BASE_URL`:

```ts
const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_BASE_URL ?? ''}/api`,
  ...
})
```

- Build web: để trống → giữ nguyên hành vi hiện tại, không hồi quy.
- Build cho app native: `VITE_API_BASE_URL=https://greenca.vn`.

**Áp dụng cho cả SSE.** `useCustomerStream.ts` và `useDriverStream.ts` tạo `EventSource` — phải dùng cùng base URL, nếu không realtime chết trong app mà API vẫn chạy, rất khó truy.

### 2.2 Origin của WebView, Sanctum và CORS

**Đã kiểm chứng bằng POC trên emulator Android** (xem `docs/MOBILE.md`) — đây là chỗ vướng thật, không phải lo xa.

Mặc định Capacitor nạp WebView từ `https://localhost` (Android) và `capacitor://localhost` (iOS). **Cả hai đều có host là `localhost`**, mà `localhost` nằm trong danh sách mặc định của `SANCTUM_STATEFUL_DOMAINS` (xem `config/sanctum.php:21-26`, và `.env` hiện **không** khai biến này nên đang dùng mặc định).

Hệ quả: middleware `EnsureFrontendRequestsAreStateful` của Sanctum coi request từ app là first-party SPA, chuyển nó sang luồng session/cookie và bắt CSRF token. Mọi request từ app trả **419 `CSRF token mismatch`** — đăng nhập không thể thực hiện. Triệu chứng dễ chẩn đoán sai thành lỗi CORS hoặc lỗi mạng.

**Cách xử lý — làm cả hai:**

1. **Đặt hostname riêng cho WebView** trong `capacitor.config.ts` của cả hai app:

```ts
server: {
  androidScheme: 'https',
  hostname: 'app.greenca.vn',   // app tài xế: 'driver-app.greenca.vn'
}
```

Origin trở thành `https://app.greenca.vn`, không còn khớp `localhost` → Sanctum để request đi luồng stateless bằng Bearer token, đúng như app cần. Sửa được ở phía client, không cần đụng server, và xử lý luôn cho cả iOS.

2. **Khai tường minh `SANCTUM_STATEFUL_DOMAINS`** trên server, chỉ gồm các domain SPA thật:

```
SANCTUM_STATEFUL_DOMAINS=greenca.vn,driver.greenca.vn,admin.greenca.vn
```

Bước 1 là đủ để app chạy, nhưng bước 2 mới là sửa đúng gốc: dựa vào danh sách mặc định có `localhost` là một cái bẫy sẽ nổ lại ở bất kỳ client nào chạy trên localhost.

**CORS.** Backend hiện không có `config/cors.php` (Laravel 11+ dùng mặc định của framework), và mặc định đó trả `Access-Control-Allow-Origin: *` — **đã kiểm chứng trên staging**, nên app gọi API được ngay mà chưa cần sửa gì. Nếu sau này siết CORS về danh sách cụ thể thì phải thêm origin của app:

```php
'allowed_origins' => [
    'https://greenca.vn',
    'https://driver.greenca.vn',
    'https://admin.greenca.vn',
    'https://app.greenca.vn',          // WebView app khách hàng
    'https://driver-app.greenca.vn',   // WebView app tài xế
],
```

Áp dụng cho cả route API lẫn endpoint SSE.

### 2.3 Cờ nền tảng

`src/platform.ts` cung cấp `isNativeApp()`. Đọc `window.Capacitor?.isNativePlatform?.()` bằng optional chaining, **không import `@capacitor/core` ở tầng chung** — để bundle web không phải kéo thêm thư viện chỉ để trả về `false`.

Dùng để ẩn những thứ chỉ có nghĩa trên web:

- Route và trang `InstallPage` ("Thêm vào màn hình chính") — trên app native vừa vô nghĩa vừa là tín hiệu rõ ràng cho reviewer Apple rằng đây là website đóng gói.
- Hook `usePwaInstall` và mọi nút gợi ý cài PWA.
- Banner cập nhật service worker.

Đăng ký service worker cũng bỏ qua khi chạy native — bản native dùng plugin push, không dùng `sw.ts`; để cả hai cùng chạy sẽ sinh thông báo trùng.

---

## 3. Push notification

Đây là phần duy nhất chạm sâu vào backend.

### 3.1 Vì sao dùng FCM cho cả hai nền tảng

Android bắt buộc đi qua FCM. iOS bắt buộc đi qua APNs. Firebase nhận khoá APNs `.p8` của tài khoản Apple Developer và tự chuyển tiếp, nên backend chỉ cần một bộ mã gửi và một loại token. Web Push hiện tại **giữ nguyên không đụng vào** — admin và người dùng trình duyệt chạy như cũ.

### 3.2 Schema `device_tokens`

Bảng hiện tại mang hình dạng của Web Push: `endpoint` (unique, NOT NULL), `p256dh`, `auth` đều bắt buộc. Token FCM chỉ là một chuỗi đơn.

Migration mới:

- Thêm `fcm_token` (`string`, nullable, unique).
- Nới `endpoint`, `p256dh`, `auth` thành nullable.
- `platform` giữ nguyên, các giá trị hợp lệ: `web` | `android` | `ios`.

Ràng buộc "phải có *hoặc* bộ Web Push *hoặc* `fcm_token`" đặt ở tầng validate của `DeviceTokenController` và ở model, không đặt ở DB (MySQL 8 có CHECK constraint nhưng biểu thức điều kiện theo cột khác gây khó khi migrate ngược).

`DeviceTokenController::store` nhận thêm dạng payload thứ hai: `{ platform: 'android'|'ios', fcm_token: string }`. Upsert theo `fcm_token` để cài lại app không sinh bản ghi rác. `destroy` nhận `fcm_token` hoặc `endpoint`.

### 3.3 Gộp kênh gửi

Hiện có `App\Channels\WebPushChannel`, được khai báo trong `via()` của **cả 12** lớp notification trong `app/Notifications/`. Nếu thêm `FcmChannel` song song thì phải sửa `via()` của cả 12 lớp, và mỗi lớp notification mới sau này lại phải nhớ khai báo hai kênh.

Thay vào đó gộp thành một kênh:

```
App\Channels\PushChannel              # lấy device_tokens của người nhận, chia theo platform
├── App\Push\WebPushTransport         # nguyên mã WebPushChannel hiện tại
└── App\Push\FcmTransport             # mới
```

Thay đổi ở 12 lớp notification chỉ gồm hai việc cơ học: `via()` trả `PushChannel::class` thay vì `WebPushChannel::class`, và đổi tên phương thức `toWebPush` → `toPush`. Nội dung payload giữ nguyên từng chữ. Sau này thêm nền tảng mới chỉ cần thêm transport.

`toPush` trả về hình dạng trung tính như hiện nay (`title`, `body`, `data`), thêm một khoá tuỳ chọn `channel` để phân biệt mức độ khẩn:

```php
return [
    'title'   => 'Có cuốc mới!',
    'body'    => "...",
    'data'    => ['action' => 'view_trip', 'booking_id' => $this->booking->id],
    'channel' => 'new_trip',           // chỉ NewBookingAvailableNotification dùng
];
```

Mỗi transport tự dịch hình dạng trung tính này sang định dạng riêng của nó.

### 3.4 FcmTransport

Gửi qua **FCM HTTP v1 API**, xác thực bằng OAuth2 từ service account JSON. Thư viện: `kreait/firebase-php`. (Phương án nhẹ hơn là `google/auth` + Guzzle tự dựng request — cân nhắc lại nếu `kreait` kéo quá nhiều dependency.)

Cấu hình trong `config/services.php`:

```php
'fcm' => [
    'credentials' => env('FIREBASE_CREDENTIALS'),   // đường dẫn tới service account JSON
],
```

File JSON đặt ngoài repo, mount vào container, quyền đọc hạn chế. **Không commit.**

**Chuông cuốc mới phải xuyên qua chế độ im lặng** — đây là lý do chính của cả dự án, nên message cho `channel: 'new_trip'` phải đặt:

- Android: `android.priority = high`, `android.notification.channel_id = 'new_trip'`, âm báo riêng.
- iOS: `apns.headers.apns-priority = 10`, `apns.payload.aps.sound` là âm báo riêng, và `interruption-level = 'time-sensitive'` để lọt qua chế độ Tập trung.

Các thông báo khác dùng kênh mặc định.

Message gửi kèm **cả khối `notification` lẫn khối `data`**. Khối `notification` để hệ điều hành tự hiển thị kể cả khi app đã bị kill (message chỉ có `data` trên iOS rất không tin cậy khi app không chạy); khối `data` mang `action` và `booking_id` để điều hướng khi người dùng chạm vào.

**Dọn token chết:** FCM trả mã lỗi khi token không còn hợp lệ (gỡ app, cài lại máy) — gặp `UNREGISTERED` hoặc `INVALID_ARGUMENT` thì xoá bản ghi, đúng cách `WebPushChannel` đang xử lý subscription hết hạn.

**Hỏng thì không kéo sập:** thiếu credentials hoặc Firebase lỗi thì chỉ ghi log cảnh báo và trả về. Thông báo trong ứng dụng (bảng `notifications`) và luồng SSE vẫn hoạt động — đúng triết lý "push là phụ" của mã hiện tại.

### 3.5 Tầng frontend

`src/push/index.ts` là facade giữ nguyên chữ ký hàm hiện tại (`registerPushSubscription`, `unregisterPushSubscription`), bên trong rẽ nhánh theo `isNativeApp()`. Nơi gọi ở tầng trên **không đổi một dòng**.

`src/push/native.ts` dùng **`@capacitor-firebase/messaging`** chứ không phải `@capacitor/push-notifications`. Lý do: plugin mặc định trả về token APNs trên iOS, buộc backend phải nói chuyện trực tiếp với Apple; plugin Firebase trả token FCM đồng nhất trên cả hai nền tảng, giữ backend chỉ một đường.

Trách nhiệm của `native.ts`:

- Xin quyền thông báo **sau khi đăng nhập thành công**, không xin lúc mở app lần đầu — tỉ lệ đồng ý cao hơn hẳn. Android 13+ bắt buộc xin quyền `POST_NOTIFICATIONS` lúc chạy.
- Lấy token, gửi lên `/api/device-token` với `platform` tương ứng.
- Lắng nghe sự kiện token bị làm mới → gửi lại lên server.
- Nhận thông báo khi app đang mở → hiện toast qua `useUiStore`, giống hành vi web hiện tại.
- Nhận sự kiện chạm vào thông báo → điều hướng.
- Đăng ký kênh thông báo `new_trip` trên Android khi khởi động app tài xế (kênh phải tồn tại phía client thì FCM mới dùng được `channel_id`).
- Khi đăng xuất: xoá token trên server và huỷ đăng ký.

**Chống lệch logic điều hướng.** `sw.ts` đang chứa đoạn ánh xạ `action` → đường dẫn (`view_booking` → `/customer/booking/:id`, `view_trip` → `/driver/trips/:id`, `view_wallet` → `/driver/wallet`). Bản native cần y hệt. Tách thành `src/push/route.ts` dùng chung cho cả service worker lẫn native — nếu không, thêm một loại thông báo mới sẽ nhớ sửa chỗ này mà quên chỗ kia.

### 3.6 Thiết lập Firebase (ngoài code)

Một dự án Firebase tên **SaveGo**, đăng ký 4 ứng dụng: khách hàng Android, khách hàng iOS, tài xế Android, tài xế iOS. Tải `google-services.json` (Android) và `GoogleService-Info.plist` (iOS) bỏ vào từng project native.

iOS cần tạo khoá APNs `.p8` trong tài khoản Apple Developer rồi tải lên Firebase. **Bước này chặn** — không có tài khoản Apple thì không test được push iOS.

---

### 3.7 Đảm bảo tài xế thực sự nhận được thông báo

Gửi push thành công không có nghĩa tài xế nhận được. Samsung, Xiaomi, Oppo, Vivo đều có cơ chế tiết kiệm pin riêng, hung hãn hơn Android gốc nhiều: đưa app vào diện "bị hạn chế" sau vài ngày ít mở, chặn tự khởi động sau khi khởi động lại máy, và làm chậm hoặc chặn hẳn thông báo. Ở Việt Nam đây đúng là những hãng chiếm thị phần lớn nhất — phải coi là trường hợp mặc định, không phải ngoại lệ.

Emulator chạy Android gốc nên **không bao giờ tái hiện được**. Chỉ phát hiện được trên máy thật, và đây là lý do chính buộc phải có máy thật ở bước nghiệm thu.

**Xử lý trong app tài xế:** một màn hình "Đảm bảo nhận được cuốc", hiện tự động một lần sau khi hồ sơ tài xế được duyệt, và truy cập lại được từ phần Cài đặt:

- Nhận diện hãng máy qua `Build.MANUFACTURER`, hiển thị đúng các bước cho hãng đó.
- Nút mở thẳng màn hình cài đặt hệ thống tương ứng (tối ưu pin, tự khởi động).
- Hiển thị trạng thái hiện tại: app có đang bị đưa vào diện tối ưu pin hay không.

**Lưu ý chính sách:** quyền `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` bị Google Play hạn chế, xin trực tiếp qua API có thể bị từ chối khi duyệt. An toàn hơn là **dẫn người dùng tới màn hình cài đặt hệ thống** để họ tự bật.

iOS không có vấn đề này — APNs do hệ điều hành quản lý, hãng máy không can thiệp được.

---

## 4. Xoá tài khoản

Apple (điều 5.1.1(v)) và Google đều bắt buộc: app cho phép đăng ký tài khoản thì phải cho xoá ngay trong app. Đây là **phần việc mới**, không nằm trong phạm vi "chỉ đóng gói", nhưng không có là bị từ chối chắc chắn.

**Endpoint:** `DELETE /api/account`, trong nhóm `auth:sanctum`, áp dụng cho mọi vai trò.

**Điều kiện chặn** (trả 422 kèm lý do tiếng Việt):

- Còn booking đang hoạt động — trạng thái không thuộc `{completed, cancelled, expired}`.
- Là tài xế và số dư ví (`wallets.points`) khác 0 — phải tất toán trước, tránh tranh chấp.
- Là cộng tác viên và còn điểm chưa quy đổi (cùng bảng `wallets`).

*Số dư đúng bằng 0 thì cho xoá.* Luồng tất toán trước khi xoá cần chốt với chủ sản phẩm khi triển khai; mặc định của spec này là chặn và hiển thị hướng dẫn liên hệ tổng đài.

**Khi cho phép xoá:**

- Ẩn danh hoá bản ghi `users`: `phone` → `deleted_{id}`, `name` → "Người dùng đã xoá", xoá email/địa chỉ nếu có. Giữ hàng để các khoá ngoại từ `bookings`, `wallet_transactions` không gãy — dữ liệu đối soát tài chính phải còn.
- Xoá toàn bộ `device_tokens` của user.
- Thu hồi toàn bộ personal access token của Sanctum.
- Đánh dấu thời điểm xoá để loại khỏi các danh sách quản trị.

Số điện thoại được giải phóng, người dùng đăng ký lại bằng số cũ sẽ tạo tài khoản mới hoàn toàn.

**Giao diện:** mục "Xoá tài khoản" trong phần Cài đặt của cả app khách hàng và app tài xế. Hộp thoại xác nhận hai bước, nêu rõ hậu quả không hoàn tác. Không bắt nhập lại OTP — thiết bị đã đăng nhập là đủ, thêm bước OTP làm tăng tỉ lệ bỏ dở mà không tăng an toàn đáng kể.

**Trang web công khai:** Google yêu cầu một URL mô tả quy trình xoá tài khoản, truy cập được mà không cần đăng nhập. Tạo trang tĩnh mới trong CMS có sẵn (`StaticPage`) với slug `xoa-tai-khoan`, khai trong form Data Safety.

---

## 5. Phiên bản, tương thích và buộc cập nhật

Đây là hệ quả kiến trúc lớn nhất của việc có app, và nó ràng buộc cả backend chứ không riêng phần mobile.

### 5.1 Bản cũ tồn tại vĩnh viễn

Web SPA: mỗi lần tải lại trang là code mới nhất, nên **không bao giờ tồn tại client cũ hơn lần deploy gần nhất**. App thì bundle nằm trong file cài trên máy người dùng, và không ai bắt buộc họ cập nhật — một tài xế hoàn toàn có thể đang chạy bản build từ một năm trước.

Hai hệ quả bắt buộc phải chấp nhận:

**Backend không được đổi API theo kiểu phá vỡ tương thích nữa.** Trước đây sửa API và sửa frontend cùng lúc là xong. Từ khi có app, mỗi thay đổi phải tự hỏi "bản app cũ nhất còn đang chạy ngoài kia có gọi được không". Đổi tên trường, bỏ trường, đổi kiểu dữ liệu, siết validate — đều là thay đổi phá vỡ. Cách làm: chỉ thêm trường mới và giữ trường cũ; nếu buộc phải phá vỡ thì nâng `min_supported` (mục 5.2) trước, đợi người dùng cập nhật, rồi mới đổi.

**Sai sót không sửa được bằng deploy.** Web: deploy lại 2 phút. App: build lại → nộp store → chờ duyệt 1–3 ngày → rồi vẫn phải chờ người dùng bấm cập nhật.

### 5.2 Cơ chế buộc cập nhật — phải có ngay ở bản phát hành đầu tiên

Endpoint công khai, không cần đăng nhập:

```
GET /api/app/version?platform=android|ios
→ { "min_supported": "1.2.0", "latest": "1.4.0", "store_url": "https://..." }
```

App gọi lúc khởi động và mỗi lần quay lại từ nền:

- Phiên bản hiện tại **thấp hơn `min_supported`** → màn chặn toàn màn hình, chỉ có nút mở store, không bỏ qua được.
- Thấp hơn `latest` nhưng vẫn đạt `min_supported` → banner nhắc nhẹ, bỏ qua được.

Ba chi tiết dễ làm sai:

1. **Lấy phiên bản từ tầng native** (`@capacitor/app` → `getInfo()`), không lấy từ hằng số trong bundle JS — nếu sau này dùng cập nhật OTA thì hai con số sẽ lệch nhau.
2. **Hỏng thì cho qua (fail-open).** Endpoint lỗi hoặc máy mất mạng → cho vào app bình thường. Làm ngược lại thì server sập đồng nghĩa toàn bộ người dùng bị khoá ngoài app.
3. **Phải có mặt ngay ở bản đầu tiên.** Cơ chế này chỉ bảo vệ được những bản đã chứa nó. Thêm ở phiên bản 2 thì đúng những người không cập nhật — tức đối tượng cần nó nhất — lại là những người không có nó.

`min_supported` lưu trong bảng cấu hình để admin sửa được, mặc định bằng phiên bản phát hành đầu tiên.

### 5.3 Lưu token đăng nhập

Token hiện nằm trong `localStorage` qua `persist` của Zustand. Trong WebView, dữ liệu này có thể bị hệ điều hành xoá khi máy sắp hết dung lượng → tài xế bị đăng xuất giữa ca mà không hiểu vì sao, và đó là lúc khó hỗ trợ nhất.

Chuyển sang kho lưu trữ an toàn của hệ điều hành (Keychain trên iOS, Keystore/EncryptedSharedPreferences trên Android) qua plugin. Bản web giữ nguyên `localStorage` — cùng một facade, hai cách hiện thực, đúng mô hình đã dùng cho push ở mục 3.5.

---

## 6. Vượt cửa duyệt store

### 6.1 Tài khoản demo cho reviewer — bẫy lớn nhất

App đăng nhập bằng OTP qua SMS. Reviewer của Apple ở nước ngoài không nhận được tin nhắn về số Việt Nam, không vào được app, và từ chối ngay.

Mã hiện tại đã siết đúng: `OtpController.php:98` là `$bypass = app()->environment(['local', 'testing'])`, nên trên production luôn cần OTP thật — mã `000000` không phải đường bypass. Điều đó đúng về mặt an toàn nhưng khiến người duyệt không có cách nào vào app, nên cần một đường riêng có kiểm soát dành cho reviewer:

```
AUTH_REVIEW_PHONE=0900000000
AUTH_REVIEW_OTP=<mã 6 số ngẫu nhiên, không phải 000000>
```

`OtpController::verify` chấp nhận cặp này **chỉ khi số điện thoại khớp chính xác** `AUTH_REVIEW_PHONE`. Không có biến thì tính năng tắt hoàn toàn. Tài khoản reviewer cần được seed sẵn dữ liệu hợp lý (vài chuyến, một vài thông báo) để reviewer thấy được app hoạt động; với app tài xế thì tài khoản phải ở trạng thái đã duyệt và có chuyến khả dụng.

Ghi cặp số/mã này vào ô ghi chú khi nộp App Store Connect và Play Console.

### 6.2 Rủi ro điều 4.2 — "chỉ là website đóng gói"

Apple loại app chỉ mở WebView lên một trang web. Cách xử lý không phải giấu giếm, mà là dùng thật những thứ chỉ app mới làm được:

| Tính năng | Giá trị thật | Plugin |
|---|---|---|
| Push native, chuông riêng cho cuốc mới | Lý do số một của dự án | `@capacitor-firebase/messaging` |
| Splash screen + màu thanh trạng thái | Mở app không thấy màn trắng của trình duyệt | `@capacitor/splash-screen`, `@capacitor/status-bar` |
| Chia sẻ mã giới thiệu qua khay chia sẻ hệ thống | Đã có tính năng giới thiệu — gửi mã qua Zalo/Messenger một chạm | `@capacitor/share` |
| Mở Google Maps/Apple Maps chỉ đường tới điểm đón | Tài xế đang phải tự copy địa chỉ | không cần plugin (URL scheme) |
| Giữ màn hình sáng khi đang chạy chuyến | Tài xế không phải chạm liên tục | `@capacitor-community/keep-awake` |
| Rung phản hồi khi nhận cuốc, khi bấm nút chính | Cảm giác native | `@capacitor/haptics` |
| Huy hiệu số thông báo chưa đọc trên icon | Thấy ngay không cần mở app | `@capawesome/capacitor-badge` |
| Nút back cứng Android điều hướng đúng | Không có thì thoát app giữa chừng | `@capacitor/app` |
| Banner mất mạng | WebView mất mạng chỉ hiện trang lỗi trống | `@capacitor/network` |

Danh sách phiên bản cụ thể của từng gói chốt khi triển khai, theo bản tương thích với Capacitor đang dùng.

Ngoài ra ở tầng CSS: tắt hiệu ứng nảy khi cuộn quá đà, chặn tự zoom khi focus ô nhập trên iOS, tôn trọng vùng an toàn tai thỏ và thanh gạt dưới.

### 6.3 Quyền riêng tư và khai báo

- **Nhãn App Privacy** (Apple) và **form Data Safety** (Google): khai số điện thoại, vị trí (chỉ khi dùng, để điền điểm đón), dữ liệu chuyến đi, dữ liệu sử dụng.
- Link tới trang `privacy` và `terms` — **đã có sẵn** trong CMS tĩnh.
- Link tới trang `xoa-tai-khoan` (mục 4).
- `Info.plist` phải có câu giải thích **bằng tiếng Việt** cho từng quyền. Ví dụ quyền vị trí: "GreenCA dùng vị trí của bạn để tự động điền điểm đón." Để trống là bị loại.
- `AndroidManifest.xml`: `INTERNET`, `POST_NOTIFICATIONS` (Android 13+), `ACCESS_FINE_LOCATION` + `ACCESS_COARSE_LOCATION`.

### 6.4 Nạp ví tài xế và quy định thanh toán

Apple bắt buộc dùng In-App Purchase (chiết khấu 15-30%) cho hàng hoá số, nhưng **miễn trừ cho dịch vụ đời thực**. Điểm ví tài xế là phí hoa hồng cho dịch vụ vận tải thật, thuộc diện miễn trừ — giống Grab/Be. Rủi ro thấp nhưng không bằng không.

**Quyết định:** giữ chức năng nạp ví trong app. **Phương án dự phòng** nếu Apple chất vấn: chuyển việc nạp tiền sang web, app tài xế chỉ hiển thị số dư và một liên kết mở trình duyệt.

### 6.5 Tài khoản nhà phát triển — đường găng của dự án

Hiện **chưa có tài khoản nào**. Đây là việc mất thời gian chờ nhất, phải khởi động ngay ngày đầu:

- **Apple Developer Program** — 99 USD/năm. Đăng ký dưới danh nghĩa doanh nghiệp cần mã **D-U-N-S**, xin mã mất khoảng 1-2 tuần, Apple duyệt thêm vài ngày.
- **Google Play Console** — 25 USD một lần. **Bắt buộc đăng ký dạng tổ chức, không đăng ký cá nhân.** Tài khoản cá nhân mở mới bị buộc chạy thử nghiệm khép kín với tối thiểu 12 người thật trong 14 ngày liên tục trước khi được phát hành công khai — riêng khoản đó đã dài hơn toàn bộ phần lập trình.

---

## 7. Build và phát hành

### 7.1 Điều kiện môi trường

Máy phát triển hiện tại **chưa đủ**:

| Thành phần | Hiện tại | Cần |
|---|---|---|
| Node.js | v20.19.4 | ≥ 22 (yêu cầu của Capacitor) |
| Xcode | chỉ có Command Line Tools | Xcode đầy đủ từ App Store |
| Android Studio | chưa cài | cài, kèm Android SDK |
| Thiết bị thật | — | tối thiểu 1 iPhone + 1 máy Android (push iOS không chạy trên giả lập) |

### 7.2 Quy trình

Ba nhịp: build web → đồng bộ sang vỏ native → mở IDE ký và nộp. Hai nhịp đầu gói vào Makefile:

```
make mobile-check        # so khớp phiên bản plugin giữa frontend/ và mobile/*
make mobile-sync-customer   # build:customer với VITE_API_BASE_URL rồi cap sync
make mobile-sync-driver
make mobile-open-ios-customer / -android-customer / -ios-driver / -android-driver
```

Nhịp thứ ba thủ công qua Xcode và Android Studio — đó là chỗ ký chứng chỉ.

**Đồng bộ số hiệu phiên bản.** Ba nơi (web, Android `versionCode`/`versionName`, iOS `CFBundleShortVersionString`/build number) rất dễ lệch, mà store từ chối bản nộp trùng số build. Script nhỏ đọc phiên bản từ `frontend/package.json` rồi ghi xuống cả hai project native, chạy tự động trong bước sync.

**Icon và splash** sinh từ ảnh nguồn bằng `@capacitor/assets`, hai bộ riêng cho hai app.

**Live reload khi phát triển:** đặt tạm `server.url` trong `capacitor.config.ts` trỏ về Vite dev server trên máy để không phải build lại mỗi lần sửa. Phải nhớ gỡ trước khi build phát hành — ghi rõ trong `docs/MOBILE.md` và thêm bước kiểm trong danh sách kiểm phát hành.

### 7.3 Khoá ký — thứ không được mất

Mất keystore Android là **vĩnh viễn** không cập nhật được app đã phát hành: phải đăng app mới và bỏ toàn bộ người dùng cũ. Ngay khi tạo: cất vào nơi lưu trữ bí mật của công ty, và bật **Play App Signing** để Google giữ bản sao dự phòng. Chứng chỉ iOS quản lý qua tài khoản Apple Developer, mất thì tạo lại được.

---

## 8. Kiểm thử

**Playwright hiện có** — giữ nguyên, chạy trên bản web. Vỏ native không đổi hành vi web nên bộ e2e này vẫn là lưới an toàn cho phần logic. Cần bổ sung một kiểm tra hồi quy: `VITE_API_BASE_URL` để trống thì URL sinh ra vẫn đúng như cũ.

**Pest bổ sung:**

- `PushChannel` chia đúng thiết bị theo `platform`, gọi đúng transport.
- Người dùng có cả token web lẫn token native thì nhận qua cả hai đường.
- `FcmTransport` dựng đúng độ ưu tiên và `channel_id` cho `channel: 'new_trip'`, dùng mặc định cho các thông báo khác.
- Token bị FCM báo `UNREGISTERED` thì bản ghi bị xoá.
- Thiếu credentials Firebase thì không ném exception và không chặn việc lưu thông báo vào DB.
- `DeviceTokenController` chấp nhận cả hai dạng payload, từ chối payload thiếu cả `endpoint` lẫn `fcm_token`.
- `DELETE /api/account`: chặn đúng ba trường hợp; khi cho phép thì ẩn danh hoá user, xoá device token, thu hồi Sanctum token, và không làm gãy khoá ngoại từ `bookings`.

**Kiểm thử thiết bị thật** (bắt buộc, không thay thế được bằng giả lập):

- Nhận thông báo cuốc mới khi app ở nền và khi khoá màn hình.
- Thông báo cuốc mới kêu chuông riêng, xuyên qua chế độ Tập trung/Không làm phiền.
- Chạm thông báo mở đúng màn hình, cả khi app đang tắt hẳn.
- Đăng nhập OTP thật, đăng xuất, đăng nhập lại.
- Bản đồ Goong: kéo thả, chọn điểm đón, tự động điền vị trí hiện tại.
- Bàn phím không che ô nhập; không tự zoom khi focus.
- Nút back cứng Android ở mọi màn hình chính.
- Mất mạng giữa chừng rồi có lại.
- Vùng an toàn trên máy có tai thỏ và máy có thanh gạt dưới.
- Xoá tài khoản: cả trường hợp bị chặn lẫn trường hợp thành công.
- **Nhận cuốc sau khi để máy nằm im vài giờ** — bài kiểm quan trọng nhất, chỉ có ý nghĩa trên máy thật (xem mục 3.7). Chạy trên ít nhất một máy Samsung và một máy Xiaomi.
- Buộc cập nhật: đặt `min_supported` cao hơn phiên bản đang cài → app phải chặn; tắt mạng → app phải cho vào bình thường (fail-open).
- Token còn sau khi tắt app hoàn toàn và khởi động lại máy.

---

## 9. Lộ trình

Đường găng là thủ tục tài khoản, không phải lập trình. Hai luồng chạy song song.

| | Việc |
|---|---|
| **Luồng hành chính** (bắt đầu ngày đầu tiên) | Xin mã D-U-N-S → đăng ký Apple Developer; đăng ký Google Play **dạng tổ chức**; tạo dự án Firebase và 4 app; cài Node 22, Xcode, Android Studio |
| **Tuần 1 — Backend** | Migration `device_tokens`; gộp `PushChannel` + hai transport; `FcmTransport`; `SANCTUM_STATEFUL_DOMAINS` tường minh; endpoint xoá tài khoản; endpoint `/api/app/version`; cấu hình tài khoản reviewer; trang tĩnh `xoa-tai-khoan`; test Pest |
| **Tuần 2 — Frontend web** | `platform.ts`; tách `src/push/`; `route.ts` dùng chung với `sw.ts`; `VITE_API_BASE_URL` cho axios và SSE **(đã xong ở POC)**; ẩn UI web-only; giao diện xoá tài khoản; màn chặn buộc cập nhật; facade lưu token |
| **Tuần 3 — Vỏ native** | Khởi tạo hai project Capacitor **(app khách hàng đã xong ở POC)**; icon/splash; cài và cấu hình plugin; `google-services.json` / `GoogleService-Info.plist`; chuỗi quyền tiếng Việt; các chạm native mục 6.2; màn hướng dẫn tối ưu pin cho app tài xế (mục 3.7); Makefile và script đồng bộ phiên bản |
| **Tuần 4 — Kiểm thử và nộp** | Kiểm thử thiết bị thật; ảnh chụp màn hình và mô tả cho store; khai Data Safety và App Privacy; nộp |

Sau khi nộp: Apple thường duyệt 1-3 ngày mỗi vòng, dự trù 2-3 vòng cho lần đầu. Google thường trong 24 giờ.

**Thứ tự này cho phép dừng an toàn ở bất kỳ đâu.** Xong tuần 1 và 2 thì bản web đã có push gọn hơn và có chức năng xoá tài khoản — giá trị độc lập, không phụ thuộc app native.

---

## 10. Rủi ro

| Rủi ro | Mức | Xử lý |
|---|---|---|
| Không có tài khoản Apple kịp tiến độ | Cao | Khởi động thủ tục ngày đầu; nếu chậm thì phát hành Android trước, iOS sau |
| Apple từ chối theo điều 4.2 | Trung bình | Đã chuẩn bị danh sách tính năng native mục 6.2; nếu vẫn bị, bổ sung Universal Links và widget theo dõi chuyến rồi nộp lại — không đổi công nghệ |
| Reviewer không đăng nhập được vì OTP | Cao nếu quên | Tài khoản reviewer mục 6.1 là hạng mục bắt buộc trong danh sách kiểm trước khi nộp |
| Đường bỏ qua OTP dành cho reviewer bị lạm dụng | Trung bình | Chỉ chấp nhận khi số điện thoại khớp chính xác `AUTH_REVIEW_PHONE`; không khai biến thì tính năng tắt hoàn toàn. Không dùng mã dễ đoán như `000000`. Có test Pest chặn trường hợp số khác dùng được mã reviewer |
| Mất keystore Android | Rất cao nếu xảy ra | Bật Play App Signing; cất khoá vào kho bí mật công ty ngay khi tạo |
| Push trùng (vừa web vừa native trên cùng thiết bị) | Thấp | Chấp nhận. Người dùng gỡ PWA sau khi cài app là hết. Không đáng dựng cơ chế khử trùng |
| Bản đồ Goong giật trong WebView | Trung bình | Giảm số marker, tắt hiệu ứng thừa. Nếu vẫn nặng thì cân nhắc plugin bản đồ native ở phase sau |
| Cấu hình `server.url` live-reload lọt vào bản phát hành | Trung bình | Bước kiểm bắt buộc trong danh sách kiểm phát hành |
| **Hãng máy Android giết app nền → tài xế mất thông báo cuốc** | **Cao** | Emulator không tái hiện được. Màn hướng dẫn tối ưu pin (mục 3.7) + bắt buộc nghiệm thu trên máy Samsung và Xiaomi thật |
| Đổi API phá vỡ tương thích với bản app cũ đang chạy | Cao, tích luỹ theo thời gian | Chỉ thêm trường, không bỏ/đổi trường (mục 5.1). Khi buộc phải phá vỡ thì nâng `min_supported` trước, đợi người dùng cập nhật |
| Quên đưa cơ chế buộc cập nhật vào bản đầu tiên | Cao, không sửa được về sau | Đưa vào danh sách kiểm bắt buộc trước khi nộp. Bản 1 không có nó thì vĩnh viễn không tiếp cận được nhóm người dùng không cập nhật |
| Token bị hệ điều hành xoá → tài xế đăng xuất giữa ca | Trung bình | Chuyển sang Keychain/Keystore (mục 5.3) thay vì `localStorage` |

**Đường lui tổng thể:** dự án này **cộng thêm** chứ không thay thế. PWA chạy nguyên vẹn suốt quá trình. Nếu store từ chối hoặc dự án dừng giữa chừng, không có gì đổ vỡ — người dùng vẫn dùng web như cũ, và các thay đổi backend đều có giá trị độc lập.
