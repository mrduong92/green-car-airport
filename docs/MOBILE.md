# Thiết bị & công cụ để phát triển / kiểm thử app di động

Tài liệu này liệt kê những gì cần có để build và kiểm thử app native (Capacitor) cho Save Go.
Thiết kế kỹ thuật: `docs/superpowers/specs/2026-08-02-mobile-native-apps-design.md`.

---

## 1. Máy phát triển

| Thành phần | Yêu cầu | Ghi chú |
|---|---|---|
| Máy tính | **macOS bắt buộc** để build iOS | Build Android chạy được trên cả macOS/Windows/Linux, nhưng iOS thì không có đường nào khác |
| Node.js | ≥ 22 | Yêu cầu của Capacitor |
| Xcode | **26.x** với SDK iOS 26 | Bắt buộc để nộp App Store kể từ 28/04/2026 |
| Android Studio | Bản hiện hành + Android SDK | Đã kèm sẵn JDK, không cần cài Java riêng |
| Dung lượng trống | ~80 GB | Xcode ~40 GB, Android Studio ~15 GB, ảnh máy ảo ~10 GB/cái, còn lại cho build |
| RAM | 16 GB là tối thiểu dùng được | Bật đồng thời emulator + 7 container Docker + Xcode sẽ chật; xem mục 5 |

### Máy hiện tại của dự án

MacBook Pro 16-inch 2019 (Intel i9-9880H), macOS 15.7.7, 16 GB RAM.

- **Dùng được ngay:** cài **Xcode 26.3** (bản cuối còn chạy trên macOS Sequoia 15.6+), build và nộp App Store bình thường.
- **Không cài qua Mac App Store** — App Store chỉ phục vụ bản mới nhất, bản đó đòi macOS Tahoe 26.2. Tải bản 26.3 qua `xcodes install 26.3` hoặc từ `developer.apple.com/download/all`.
- **Nâng macOS lên Tahoe 26** nếu muốn dùng Xcode 26.4+. Máy này nằm trong số ít model Intel còn được Tahoe hỗ trợ.
- ⚠️ **Hạn dùng:** Xcode 27 chỉ chạy trên Apple Silicon. Khi Apple bắt buộc SDK iOS 27 (dự kiến khoảng 04/2027), máy Intel không nộp được App Store nữa → cần dự trù máy Apple Silicon hoặc dịch vụ build cloud trong vòng ~1 năm.

---

## 2. iOS — cần thiết bị gì cho việc gì

| Muốn kiểm thử | Cần | Tài khoản Apple |
|---|---|---|
| Giao diện, luồng đặt xe, bản đồ, bàn phím, vùng an toàn | iOS Simulator (kèm Xcode) | Miễn phí |
| Hành vi thật trên máy thật: cảm ứng, hiệu năng, GPS, camera | **iPhone thật + cáp USB** | Miễn phí (Apple ID thường) |
| **Push notification** | iPhone thật | **Trả phí — 99 USD/năm** |
| Gửi bản test cho người khác cài | iPhone của họ | **Trả phí** (TestFlight) |

### Ba mức, theo thứ tự tốn kém

**a) Apple ID miễn phí + cáp USB**
Cài app lên chính iPhone của mình. Bản cài **hết hạn sau 7 ngày**, phải cắm cáp cài lại. **Không có push notification** — quyền gửi thông báo đẩy là entitlement Apple chỉ cấp cho tài khoản trả phí, không có cách lách.

**b) iOS Simulator**
Miễn phí, kiểm được giao diện và phần lớn luồng nghiệp vụ. Không nhận được push thật; chỉ giả lập payload cục bộ bằng `xcrun simctl push`.
*Lưu ý:* Simulator có hỗ trợ nhận push thật qua APNs, nhưng **chỉ trên máy Apple Silicon** — máy Intel không dùng được đường này.

**c) Tài khoản trả phí 99 USD/năm**

| Cách phân phối | Số người | Cần Apple duyệt? | Ghi chú |
|---|---|---|---|
| **TestFlight nội bộ** ⭐ | tối đa 100 | **Không** | Dùng được ngay sau khi build xử lý xong (~15 phút). Bản test sống 90 ngày. Cách chuẩn để đưa cho tài xế/khách thật dùng thử |
| TestFlight bên ngoài | tối đa 10.000 | Có, bản duyệt nhẹ | Nhanh hơn duyệt phát hành chính thức |
| Ad Hoc | tối đa 100 thiết bị | Không | Phải khai trước UDID từng máy, bất tiện hơn TestFlight |

**Tài khoản cá nhân được duyệt trong 1–2 ngày** (không cần mã D-U-N-S), còn tài khoản doanh nghiệp mất 2–3 tuần. Nếu cần mở khoá test push iOS sớm, có thể mở tài khoản cá nhân dùng riêng cho việc test với mã ứng dụng tạm (`vn.com.savego.driver.test`), giữ mã thật sạch cho tài khoản doanh nghiệp sau này.

---

## 3. Android — cần thiết bị gì cho việc gì

**Không bắt buộc có điện thoại Android** để phát triển, kể cả để test push. Đây là khác biệt lớn so với iOS: **không cần tài khoản Play Console để test bất cứ thứ gì.**

| Muốn kiểm thử | Cần |
|---|---|
| Giao diện, luồng nghiệp vụ, **push FCM thật** | Android Emulator với system image **có Google Play Services** |
| Hành vi ngủ đông ở nền của từng hãng máy | **Điện thoại Android thật** — bắt buộc ở bước nghiệm thu |
| Gửi bản test cho người khác | File APK gửi qua Zalo/Drive, người nhận bật "cho phép cài từ nguồn không xác định" |

### Android Emulator

Khi tạo máy ảo trong Android Studio, **chọn system image có nhãn "Google Play" hoặc "Google APIs"** — bản trần không có Play Services nên không đăng ký được với Firebase và push sẽ không về.

Trên máy Intel: chọn ảnh **x86_64**, chạy nhanh hơn hẳn ARM.

### Vì sao vẫn cần một máy Android thật

Emulator không phản ánh đúng cách Samsung / Xiaomi / Oppo tự ý ngủ đông ứng dụng ở nền để tiết kiệm pin — đúng cái ảnh hưởng trực tiếp tới việc **tài xế có nhận được thông báo cuốc mới khi khoá máy hay không**. Không cần mua máy, mượn một buổi ở bước nghiệm thu là đủ.

### Điện thoại Android thật — thiết lập một lần

1. **Cài đặt → Giới thiệu điện thoại** → bấm 7 lần vào **Số bản dựng** để mở "Tuỳ chọn nhà phát triển".
2. Vào **Tuỳ chọn nhà phát triển** → bật **Gỡ lỗi qua USB**.
3. Cắm cáp vào máy tính → trên điện thoại chọn **Cho phép**.
4. Kiểm tra: `adb devices` phải liệt kê thiết bị.

---

## 4. Bảng tổng hợp

| | iOS | Android |
|---|---|---|
| Máy tính | **macOS bắt buộc** | macOS / Windows / Linux |
| Test giao diện không cần thiết bị | Simulator (miễn phí) | Emulator (miễn phí) |
| Test push không cần thiết bị thật | ❌ không thể | ✅ Emulator có Play Services |
| Test push cần trả phí | ✅ **99 USD/năm** | ❌ miễn phí |
| Cần tài khoản store để test | ✅ có | ❌ không |
| Thiết bị thật bắt buộc ở nghiệm thu | iPhone | 1 máy Android (ưu tiên Samsung/Xiaomi) |
| Gửi bản test cho người khác | TestFlight (cần trả phí) | File APK (miễn phí) |

**Bộ tối thiểu để đi được đến lúc phát hành:** 1 MacBook + 1 iPhone + 1 máy Android mượn ở bước cuối + tài khoản Apple 99 USD/năm + tài khoản Google Play 25 USD một lần.

---

## 5. Lưu ý khi chạy trên máy 16 GB RAM

Emulator + 7 container Docker của dự án + Xcode bật cùng lúc sẽ hết RAM.

Cách gọn nhất: **cho app trỏ về server staging thay vì Docker local**, khỏi phải chạy backend trên máy khi test app.

```bash
VITE_API_BASE_URL=https://driver.webco.io.vn npm run build:driver
```

Nếu vẫn muốn trỏ về Docker local thì phải dùng IP LAN của máy (điện thoại cùng WiFi) hoặc ngrok — `vite.config.ts` đã cho phép host ngrok sẵn. Lưu ý Android chặn HTTP không mã hoá, nên ngrok (https) tiện hơn IP LAN.

---

## 6. Hai chỗ vướng — đã gặp thật khi làm POC

**URL API.** Trong app, trang được nạp từ vỏ ứng dụng chứ không phải từ server, nên `baseURL: '/api'` tương đối sẽ trỏ vào chính vỏ app và mọi request chết. Phải truyền `VITE_API_BASE_URL` khi build cho app — áp dụng cho **cả axios lẫn `EventSource`** của luồng SSE.

**CSRF token mismatch (419) — cái này mất nhiều thời gian nhất.** Mặc định Capacitor nạp WebView từ `https://localhost` (Android) / `capacitor://localhost` (iOS). Cả hai có host `localhost`, mà `localhost` nằm trong danh sách mặc định của `SANCTUM_STATEFUL_DOMAINS` (`config/sanctum.php:21-26`; `.env` không khai biến này nên đang dùng mặc định). Sanctum tưởng app là SPA first-party, chuyển sang luồng session/cookie và bắt CSRF → mọi request trả 419.

Triệu chứng rất dễ chẩn đoán sai thành lỗi CORS. Cách nhận biết: app **có** gọi được server (thấy toast lỗi từ server, không phải lỗi mạng), nội dung lỗi là `CSRF token mismatch.`

Cách xử lý, đặt hostname riêng trong `capacitor.config.ts`:

```ts
server: { androidScheme: 'https', hostname: 'app.greenca.vn' }
```

Và khai tường minh trên server để bịt gốc: `SANCTUM_STATEFUL_DOMAINS=greenca.vn,driver.greenca.vn,admin.greenca.vn`.

**CORS thì không vướng.** Staging đang trả `Access-Control-Allow-Origin: *` (mặc định của Laravel 11+ khi không có `config/cors.php`), nên app gọi API được ngay. Chỉ cần lưu ý nếu sau này siết CORS về danh sách cụ thể thì phải thêm origin của WebView.

**Gỡ lỗi:** mở Chrome trên máy tính → `chrome://inspect` → thấy WebView của app → dùng DevTools y như debug web. Với iOS thì dùng Safari → Develop → chọn thiết bị. Xem log nhanh không cần GUI:

```bash
adb logcat -d | grep -iE "Capacitor|Console"
```
