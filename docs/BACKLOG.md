# Backlog — việc cần làm sau

> Tổng hợp 2026-08-09. Gom các vấn đề đã phát hiện và trao đổi nhưng **chưa làm**.
> Việc đã làm xong nằm ở `docs/DEPLOY.md` (mục PRODUCTION) — file này chỉ chứa việc còn nợ.
>
> Xếp theo mức độ chặn, không phải theo thứ tự phát hiện.

## Trạng thái tại thời điểm tổng hợp

| | |
|---|---|
| `origin/main` | `323fed1` (đã có Reverb) |
| **Production** | **`9e3bf49`** + fix nhãn (chỉ frontend) — **chưa có Reverb** |
| Dữ liệu thật | 21 user, 31 cuốc, 184 notification, 0 failed job |

> **Cập nhật 2026-08-09 (rạng sáng):** bảng trên đã LỖI THỜI. Mục P0-1 và P0-2
> đã xong — production hiện chạy Reverb đầy đủ (systemd `greenca-reverb`, nginx
> proxy WSS, `ext-event`, 4 queue worker, cron scheduler), đã load test đạt
> **4.996 kết nối đồng thời** (RSS 153MB, CPU 3,4%, API không ảnh hưởng).
> Chi tiết trong `docs/DEPLOY.md` mục PRODUCTION. Staging cũng đã có Reverb
> nhưng **chưa có `ext-event`** nên vẫn trần ~1.000.

---

## 🔴 P0 — Đang chặn, làm trước

### 1. Production đã tách khỏi `main`

Production chạy `9e3bf49` + một bản build frontend có fix nhãn "cuốc đặt trước".
`main` đã đi tiếp với Reverb. **Lần deploy tới KHÔNG được `git reset --hard origin/main`
như quy trình cũ** — sẽ kéo Reverb lên trong khi server chưa có hạ tầng, làm chết realtime.

Gỡ bằng cách làm xong mục 2.

### 2. Dựng Reverb trên production

Frontend trên `main` dùng `getEcho()` → WebSocket. Server hiện **chưa có** gói
`laravel/reverb`, chưa có `REVERB_*`, chưa có service, chưa có proxy WebSocket ở nginx.

Cần: `composer require`/`install` → sinh `REVERB_APP_ID/KEY/SECRET` → systemd
`greenca-reverb` (file mẫu đã có ở `deploy/systemd/greenca-reverb.service`) → thêm
proxy WebSocket vào nginx (`deploy/nginx/greenca-common.conf` đã có sẵn phần này) →
deploy → **test realtime thật** (đặt cuốc ở máy A, xem máy B có nhảy không).

⚠️ `REVERB_HOST` ở backend và frontend là **hai giá trị khác nhau** — xem ghi chú
trong commit `b817b2c~1`, session Reverb đã dính bẫy này.

### 3. PWA không tự cập nhật — người dùng kẹt ở giao diện cũ

`vite.config.ts` đặt `registerType: 'autoUpdate'` nhưng dùng `strategies: 'injectManifest'`,
mà ở chế độ đó plugin **không tự chèn** cơ chế cập nhật. Đã kiểm `sw.js` trên production:

| Kiểm tra | Kết quả |
|---|---|
| `skipWaiting` | 0 |
| `clientsClaim` | 0 |
| Xử lý `SKIP_WAITING` | 0 |
| Listener `message` | 0 |

`registerSW.js` cũng chỉ có đúng một dòng `navigator.serviceWorker.register(...)`,
không có logic cập nhật. Hệ quả: SW mới vào trạng thái **waiting** và **chỉ kích hoạt
khi người dùng đóng HẾT mọi cửa sổ app** — PWA đã cài thì thường không ai đóng hẳn,
nên có thể kẹt ở bản cũ vô thời hạn.

Header HTTP đã đúng (`no-cache, must-revalidate`), không phải nguyên nhân.

Hai mức sửa:
- **Nhẹ (khuyến nghị)**: thêm `skipWaiting()` + `clientsClaim()` vào `src/sw.ts`. Lần
  điều hướng kế tiếp là có bản mới, không reload đột ngột.
- **Đầy đủ**: thêm listener `SKIP_WAITING` + dùng virtual module của vite-plugin-pwa
  để `autoUpdate` chạy đúng nghĩa, kèm tự reload. ⚠️ Reload giữa chừng có thể làm tài
  xế đang nhập liệu mất dữ liệu form.

---

## 🟠 P1 — Hiệu năng notification (sẽ vỡ khi tăng trưởng)

### 4. Fan-out push không giới hạn

**Luồng hiện tại** khi khách đặt cuốc:

```
BookingController::store
  └─ SendNewBookingBroadcastJob::dispatch          → 1 job
       └─ query tài xế thoả điều kiện
            └─ mỗi tài xế: $driver->notify(...)    → ĐẺ THÊM 1 JOB RIÊNG mỗi tài xế
                 ├─ kênh 'database'  → INSERT 1 dòng notifications
                 └─ WebPushChannel   → query device_tokens
                                      → tạo MỚI client WebPush
                                      → POST HTTPS tới FCM/Mozilla
```

1 cuốc với N tài xế = **1 + N job**, không phải 1 job.

**Chi phí đo thật từ `/var/log/greenca-queue.log`:**

| Loại job | Thời gian |
|---|---|
| Tài xế không có thiết bị push | ~7 ms (thoát sớm) |
| Tài xế **có** thiết bị push | **~611 ms** (round-trip HTTPS) |

Production chạy **1 worker, tuần tự**. Ngoại suy cho 1000 cuốc:

| Số tài xế nhận | Số job | Thời gian |
|---|---|---|
| 50 | 50.000 | ~7 giờ |
| 100 | 100.000 | ~14 giờ |

⚠️ Tệ hơn: **cùng hàng đợi** với `trip_accepted`, `trip_completed`, `nạp điểm`. Tồn
đọng push làm chậm luôn những noti quan trọng đó.

⚠️ **VAPID không giúp gì** cho vấn đề này. Nó chỉ là cơ chế định danh server gửi,
không gộp/không nén/không giảm số request. Một subscription vẫn là một HTTPS POST.

**KHÔNG nên bỏ tính năng** — push cuốc mới là giá trị cốt lõi với tài xế. Vấn đề là
fan-out, không phải bản thân noti.

**Thứ tự đề xuất:**

1. **Dùng MỘT client WebPush cho cả lô** *(sửa nhỏ, lợi lớn, không đổi UX)*.
   Hiện mỗi noti tạo `new WebPush()` rồi `flush()` ngay → N round-trip **tuần tự**.
   Thư viện hỗ trợ `queueNotification()` nhiều subscription rồi `flush()` một lần,
   bên trong dùng `curl_multi` chạy **song song**. Cần chuyển fan-out vào trong một job.
2. **Tách hàng đợi** — push hàng loạt sang queue riêng (`--queue=push`) với worker
   riêng, để tồn đọng push không bao giờ làm chậm noti nghiệp vụ.
3. **Gộp noti + cooldown** *(sửa tận gốc)* — tối đa 1 push/tài xế/60 giây, nội dung
   gộp "3 cuốc mới gần bạn". Cắt đứt liên hệ giữa số cuốc và số push.
4. **Lọc theo khoảng cách** — chỉ bắn cho tài xế trong bán kính ~10km. `driver_profiles`
   đã có `latitude`/`longitude`, `TripController` đã có hàm `haversine`.
   ⚠️ Chặn: **hiện chỉ 2/9 tài xế có toạ độ** — phải làm app báo vị trí đều đặn trước.
5. Thêm worker — chỉ giảm triệu chứng, làm sau cùng.

### 5. Ba bộ lọc còn thiếu khi gửi push

Đã có: `role=driver`, `status=active`, `is_online=true`, và **loại xe** (mới thêm
`79e7a29`). Còn thiếu:

- **Khoảng cách** — tài xế Hà Nội vẫn nhận noti cuốc TP.HCM.
- **Tài xế đang bận** — `accept` giới hạn 5 cuốc đồng thời, nhưng noti vẫn bắn cho
  tài xế đã đủ 5. Họ bấm vào không nhận được — phiền y như bug `vehicle_type` vừa sửa.
- **Cuốc còn trống không** — job nằm queue, tới lúc chạy cuốc có thể đã có người nhận,
  vẫn bắn "Có cuốc mới!".

### 6. Bảng `notifications` phình + đã có sự cố

Kênh `database` ghi 1 dòng cho **mỗi** tài xế, độc lập với push. 1000 cuốc × 100 tài xế
= 100.000 dòng. Commit Reverb ghi nhận **"sự cố 2026-08-08: unread-count 48s"** khi
bảng mới có 184 dòng. Cần: index phù hợp, và/hoặc dọn định kỳ noti đã đọc/quá cũ.

---

## 🟡 P2 — Chất lượng, nợ kỹ thuật

### 7. `TripController` giữ bản sao quy tắc sức chứa

Quy tắc đã tách ra `App\Support\VehicleCapacity` (nguồn duy nhất) và `SendNewBookingBroadcastJob`
đã dùng. Nhưng `TripController` **vẫn giữ bản sao riêng** — lúc sửa không gộp được vì
file đang có thay đổi Reverb chưa commit của phiên khác.

Khi Reverb xong: cho `TripController::vehicleTypesFittingDriver()` và `fitsDriverVehicle()`
gọi `VehicleCapacity`, xoá bản sao. Test parity hai chiều đã có sẵn trong
`TripNotifyAndScheduleTest`.

### 8. Chưa có CI chạy test trên MySQL

Suite chạy **sqlite in-memory** nhưng production là **MySQL**. Mọi query dùng hàm riêng
của MySQL (`DATE_FORMAT`) hoặc phụ thuộc hành vi MySQL (cột nhập nhằng sau `join`,
`only_full_group_by`) **không được test che phủ** — đó chính là lý do bug 500 trang
Doanh thu lọt lên production.

Cần một job CI chạy suite trên MySQL. Trong lúc chưa có, chạy tay (lệnh ở `docs/DEPLOY.md`).

### 9. Frontend không có test unit

Chỉ có Playwright e2e. Bug ô "Thu Hộ" (`NaN` chặn đặt xe) lẽ ra một test schema bắt được
ngay. Cân nhắc thêm vitest cho schema/logic thuần.

### 10. Abenla trả `code 204 Fail` cho 2 số

Log production 2026-08-08: `0349793730` và `0917871751` không gửi được OTP
(`code 204`, khác hẳn lỗi `104 CanNotAccess` do chặn IP trước đây). **Chưa điều tra.**
Có thể là số không nhận được ZNS, hoặc nằm ngoài mạng hỗ trợ.

---

## 🔵 P3 — Vận hành, bảo mật

### 11. Đổi mật khẩu đã đi qua log

Các mật khẩu sau đã xuất hiện trong log phiên làm việc, nên đổi:

| Tài khoản | Ghi chú |
|---|---|
| Admin `0931919786` (khách hàng) | mật khẩu khởi tạo `913284` |
| QA customer `0868968312` | `683763` — tài khoản test |
| QA driver `0868968312` | `327035` — tài khoản test |
| **Mật khẩu DB production** | user `greenca` — đổi thì phải sửa cả `backend/.env` |

### 12. Dùng chung credential bên thứ 3 với staging

Production và staging **chung tài khoản** Abenla, SePay, VAPID, Goong. Test trên staging
đốt quota SMS của production; thu hồi/hết hạn key nào là **chết cả hai môi trường**.
Nên tách khi có điều kiện.

### 13. SePay chưa nối — nạp điểm hoàn toàn thủ công

Quyết định 2026-08-08: nạp tay trước. Nhưng app tài xế **vẫn hiện mã QR VietQR**
(Techcombank `19030370078022`), tài xế quét và **chuyển tiền thật**, mà **không có gì
tự cộng điểm và không có thông báo nào**.

⚠️ Rủi ro vận hành: phải có người **theo dõi sao kê ngân hàng** rồi cộng tay qua
`POST /admin/drivers/{user}/topup`. Nội dung chuyển khoản là mã `GCA0000xx` của tài xế.
Không ai theo dõi thì tài xế chuyển tiền xong ngồi chờ mãi.

Khi muốn bật tự động: trỏ webhook về `https://greenca.vn/api/webhooks/sepay`, đối chiếu
`SEPAY_WEBHOOK_API_KEY` với dashboard, kiểm `FEATURE_AUTO_TOPUP`.

### 14. Dọn tài khoản/dữ liệu test trên production

DB thật đang lẫn tài khoản QA: `Test Auth QA`, `Test Driver QA`, `Referral Test 01`,
`Referral Driver 01`, `QA Admin Test` (đang khoá). Trong 31 cuốc, **17 cuốc ngày 07/08
là data test** và 2 cuốc là chủ app tự đặt tự nhận. Nên dọn trước khi mở rộng người dùng,
hoặc ít nhất đánh dấu để không lẫn vào báo cáo doanh thu.

### 15. Redis `maxmemory=0`

Không giới hạn bộ nhớ. `maxmemory-policy noeviction` là **đúng** cho queue (đổi sang
`allkeys-lru` sẽ khiến job bị xoá = mất thông báo), nhưng nên đặt giới hạn và theo dõi,
hoặc tách cache/session sang Redis DB khác với queue.

### 16. Staging sẽ mất bypass `000000` ở lần deploy tới

Code mới (`environment(['local','testing'])`) đã ở `main`. Lần deploy staging kế tiếp
sẽ tắt bypass ở đó luôn. Chuẩn bị tài khoản có mật khẩu trên staging trước, không thì
mất đường đăng nhập để test.

---

## ⚪ Quyết định nghiệp vụ còn treo

### 17. Voucher 200k cho khách tự đăng ký

Hiện chỉ khách **có mã giới thiệu** mới được 200k (4 voucher × 50k), và phải **hoàn thành
chuyến đầu tiên**. Khách tự đăng ký không được gì.

Đã bàn phương án tặng mọi khách mới, chốt các tham số (sau chuyến đầu / 4×50k / không
cộng dồn) nhưng **quyết định giữ nguyên logic cũ, chưa làm**. Khi làm: chỉ cần bỏ dòng
early-return `if ($customer->referred_by_user_id === null) return;` trong
`ReferralService::processCustomerReferral` và chỉ phát thưởng cho người giới thiệu khi
thực sự có mã.

### 18. Prefix mã giới thiệu

Đã đổi `SGO` → `GCA` toàn hệ thống. Mã cũ dạng `SGO-xxxxxx` đã phát ra vẫn còn hiệu lực,
không bị đổi ngược. Chấp nhận tồn tại song song.

---

## Lọc người nhận thông báo "có cuốc mới"

Đây là nguồn tải lớn nhất của hàng đợi: mỗi cuốc sinh **một job cho mỗi tài xế
online**, mỗi job ~0,4s vì gọi HTTP ra dịch vụ push. Lọc càng kỹ càng giảm cả
tải hàng đợi lẫn phiền nhiễu cho tài xế.

Đã làm (2026-08-09):

- Lọc theo **loại xe** — bỏ tài xế có xe không chở nổi cuốc
- Lọc theo **hạn mức việc** — bỏ tài xế đã đủ `MAX_ACTIVE_TRIPS`, họ có bấm nhận
  cũng chỉ ăn 422
- **Kiểm cuốc còn trống** ngay đầu job — job nằm hàng đợi một lúc mới chạy, trong
  khoảng đó cuốc có thể đã bị nhận hoặc huỷ
- Bỏ kênh `database`, chỉ còn web push (bảng `notifications` không phình nữa)

### 🟡 Còn lại: lọc theo khoảng cách — CẦN CHỦ APP CHỐT SỚM

Tài xế ở TP.HCM đang nhận thông báo cuốc ở Hà Nội. Đây là bộ lọc mạnh nhất còn
chưa có — ở quy mô nhiều tỉnh, nó cắt được phần lớn số job.

**Chặn ở chỗ: hệ thống chưa lưu vị trí tài xế.** Không có route cập nhật vị trí,
app không gọi `watchPosition`, cột `driver_profiles.latitude/longitude` nằm im.
Đây cũng chính là lý do app tài xế hiện hiển thị "cách bạn **? km**" và tính năng
sắp xếp "gần nhất" đang vô dụng.

Làm xong việc lưu vị trí sẽ mở khoá cùng lúc **ba** thứ:

1. Lọc thông báo theo bán kính
2. **Bắn theo đợt** — báo 10 tài xế gần nhất trước, 15s chưa ai nhận thì mở rộng
   (cách chuẩn của ngành gọi xe; giảm cả tải lẫn tranh chấp giữa tài xế)
3. Sửa luôn "cách bạn ? km" và sắp xếp theo khoảng cách

Cần chủ app quyết: tần suất gửi vị trí (ảnh hưởng pin điện thoại tài xế và lưu
lượng ghi DB), và có lưu lịch sử di chuyển hay chỉ giữ vị trí mới nhất.

## Ghi chú về quy trình

- **Không chạy `php artisan tinker` dưới `www-data`** — psysh không ghi được config nên
  script **im lặng không thực thi**. Chạy bằng root rồi `chown -R www-data:www-data
  storage bootstrap/cache`.
- **Build frontend luôn phải có `npm install`** trong cùng lệnh — thiếu nó thì `tsc:
  not found`, build **im lặng không tạo file**, và rsync sẽ đẩy bundle cũ. Luôn so hash
  trước/sau khi build.
- **Khi có phiên khác đang làm việc trên cùng repo**: dùng `git worktree` riêng, đừng
  `git add` rồi `git commit` cách nhau — phiên kia có thể `git add -A` xen vào giữa và
  commit của bạn sẽ nuốt trọn công việc dở dang của họ (đã xảy ra 2 lần trong ngày 08/08).
