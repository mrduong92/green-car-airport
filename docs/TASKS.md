# TASKS.md — Green Car Airport

Trạng thái: `[ ]` chưa làm · `[x]` hoàn thành · `[-]` đang làm · `[~]` bỏ qua / không áp dụng

---

## 0. Thiết lập môi trường (Setup)

| # | Việc cần làm | Ghi chú |
|---|---|---|
| 0.1 | `[ ]` Copy `.env.example` → `.env` trong `backend/` | Đã có file mẫu |
| 0.2 | `[ ]` Chạy `make artisan key:generate` | Cần APP_KEY trước khi boot |
| 0.3 | `[ ]` Chạy `make migrate` để tạo bảng DB | 10 migration file có sẵn |
| 0.4 | `[ ]` Chạy `make fresh` (seed dữ liệu mẫu) | Cần viết seeder trước |
| 0.5 | `[ ]` Viết `DatabaseSeeder` với tài xế, khách, booking mẫu | Phục vụ dev/test |

---

## 1. Backend — Sửa lỗi API response không khớp Frontend

> Frontend đã được viết với các type cụ thể trong `types.d.ts`. Backend cần trả về đúng shape.

| # | Việc cần làm | File | Ghi chú |
|---|---|---|---|
| 1.1 | `[ ]` Sửa `DashboardController::index()` | `Admin/DashboardController.php` | FE expects: `trips_today`, `trips_today_change`, `revenue_today`, `drivers_online`, `drivers_total`, `app_fee_today`, `recent_trips[]`. BE đang trả về tổng cộng dồn, không có "hôm nay". |
| 1.2 | `[ ]` Sửa `RevenueController::index()` | `Admin/RevenueController.php` | FE expects: `{period, total_revenue, app_fee, trips_completed, avg_per_trip, chart:[{label, revenue, fee}]}`. BE đang trả `rows/total/total_fee/total_trips`. Cần hỗ trợ `period=today/week/month`. |
| 1.3 | `[ ]` Sửa `TripController::index()` | `Driver/TripController.php` | FE expects `App.Trip`: `duration_min`, `is_new`, `customer_phone_masked`. BE đang trả `customer_name`, `customer_phone` (field name khác). |
| 1.4 | `[ ]` Sửa `DriverController::index()` | `Admin/DriverController.php` | FE expects paginated `{data, current_page, last_page, total}` với field `points` (số dư ví). Cần thêm pagination, search (name/phone/biển số), filter by status, và include wallet points. |
| 1.5 | `[ ]` Sửa `BookingController::index()` | `Customer/BookingController.php` | FE gọi `r.data.data` (paginated), BE đang trả plain array. Cần wrap vào paginated response hoặc FE cần sửa. |

---

## 2. Backend — Nghiệp vụ còn thiếu

| # | Việc cần làm | File | Ghi chú |
|---|---|---|---|
| 2.1 | `[ ]` Sửa hệ thống điểm: tài xế nạp điểm trước, khấu trừ 20% khi hoàn thành cuốc | `Driver/TripController.php` → `creditEarning()` | Hiện tại đang **cộng** điểm sau mỗi cuốc (sai spec). Spec: tài xế pre-fund ví điểm → hoàn thành cuốc → trừ `price × 20% / 1000` điểm |
| 2.2 | `[ ]` Thêm endpoint admin nạp điểm cho tài xế | Route mới: `PATCH /admin/drivers/{user}/topup` | Admin nhập số tiền nhận được → tự động quy đổi thành điểm (1.000đ = 1 điểm) và ghi `wallet_transactions` type=`topup` |
| 2.3 | `[ ]` Giới hạn tài xế nhận tối đa 3 cuốc đang active | `Driver/TripController::accept()` | Đếm `Booking::where(driver_id, status IN [accepted, in_progress])->count()`, trả 422 nếu >= 3 |
| 2.4 | `[ ]` Tự động huỷ booking sau 24h không có tài xế nhận | Tạo `Jobs/ExpireBookingsJob.php` + schedule trong `Console/Kernel.php` | `Booking::where(status, finding_driver)->where(created_at, <, now()-24h)->update(status, expired)` |
| 2.5 | `[ ]` Phạt 50.000đ khi khách huỷ sau 1h | `Customer/BookingController::cancel()` | Nếu `now() - created_at > 60 phút` → ghi nhận penalty vào bảng (hoặc field `penalty_amount` trong bookings) → cộng vào cuốc tiếp theo của khách |
| 2.6 | `[ ]` Thêm trạng thái `picking_up` vào `TripController::updateStatus()` | `Driver/TripController.php` | FE flow: `accepted → picking_up → in_progress → completed`. BE hiện bỏ qua `picking_up`. |
| 2.7 | `[ ]` Block khách hàng (không chỉ tài xế) | Tạo `Admin/CustomerController.php` + routes | `PATCH /admin/customers/{user}/block`. Khi block: không cho tạo booking mới. |
| 2.8 | `[ ]` Chặn đăng ký lại bằng SĐT hoặc biển số đã bị block | `Auth/OtpController::verify()` + `Driver/ProfileController::update()` | Khi verify OTP: kiểm tra user bị block → trả 403. Khi cập nhật biển số: kiểm tra biển số đã bị block. |
| 2.9 | `[ ]` Thêm endpoint lấy danh sách cuốc của tài xế đang thực hiện | Route mới: `GET /driver/trips/mine` | TripDetailPage cần lấy trip theo ID từ API riêng, không thể dùng `getAvailableTrips()`. Trả các booking của tài xế đang login có status `accepted/picking_up/in_progress`. |
| 2.10 | `[ ]` Lưu lý do block vào DB | Migration: thêm `blocked_reason` vào `driver_profiles` (và `users` cho khách) | FE gửi `reason` trong body block request nhưng BE đang bỏ qua. |
| 2.11 | `[ ]` Thêm trường tọa độ tài xế (lat/lng) | Migration: thêm `latitude`, `longitude` vào `driver_profiles` | Cần cho tính năng sort theo khoảng cách gần nhất |
| 2.12 | `[ ]` Sắp xếp cuốc theo khoảng cách khi `sort=nearest` | `Driver/TripController::index()` | Dùng Haversine formula trên MySQL hoặc tính trong PHP. Cần tài xế có vị trí đã cập nhật. |

---

## 3. Backend — Tính năng mới (Push Notification)

| # | Việc cần làm | Ghi chú |
|---|---|---|
| 3.1 | `[ ]` Thêm bảng `push_subscriptions` (endpoint, p256dh, auth, user_id) | Migration mới |
| 3.2 | `[ ]` Endpoint đăng ký push: `POST /driver/push-subscription` | Lưu Web Push subscription object |
| 3.3 | `[ ]` Cài package `minishlink/web-push` | `composer require minishlink/web-push` |
| 3.4 | `[ ]` Tạo `Jobs/SendPushNotificationJob.php` | Gửi push đến tất cả tài xế đang online khi có booking mới |
| 3.5 | `[ ]` Dispatch job trong `BookingController::store()` sau khi tạo booking | Trigger khi booking được tạo thành công |

---

## 4. Frontend — Sửa lỗi API mismatch

| # | Việc cần làm | File | Ghi chú |
|---|---|---|---|
| 4.1 | `[ ]` Sửa `TripDetailPage` — không dùng `getAvailableTrips()` để tìm trip | `driver/TripDetailPage.tsx` | Sau khi BE có `GET /driver/trips/mine`, gọi endpoint đó. Hiện tại không tìm được trip đã nhận vì chỉ query `finding_driver`. |
| 4.2 | `[ ]` Sửa `TripListPage` — hiển thị điểm thực từ wallet API | `driver/TripListPage.tsx` | Đang hardcode "1,240 điểm". Cần gọi `getWallet()` và hiển thị `wallet.points`. |
| 4.3 | `[ ]` Sửa `BookingHistoryPage` — xử lý response plain array (không phải paginated) | `customer/BookingHistoryPage.tsx` | Đang gọi `r.data.data` nhưng BE trả `r.data` (array). Sửa sau khi quyết định ở task 1.5. |
| 4.4 | `[ ]` Sửa `RevenuePage` — khớp với shape BE mới | `admin/RevenuePage.tsx` | Sau khi task 1.2 xong. |
| 4.5 | `[ ]` Sửa `DashboardPage` — khớp với shape BE mới | `admin/DashboardPage.tsx` | Sau khi task 1.1 xong. |
| 4.6 | `[ ]` Sửa `DriversPage` — khớp paginated response và thêm `points` | `admin/DriversPage.tsx` | Sau khi task 1.4 xong. |

---

## 5. Frontend — Tính năng còn thiếu

| # | Việc cần làm | File | Ghi chú |
|---|---|---|---|
| 5.1 | `[ ]` Trang quản lý khách hàng cho Admin | Tạo `admin/CustomersPage.tsx` + route `/admin/customers` | Danh sách khách, tìm kiếm, block. Thêm vào `AdminLayout` nav. |
| 5.2 | `[ ]` Form onboarding tài xế mới (điền thông tin xe) | Tạo `driver/OnboardingPage.tsx` | Sau OTP verify với số tài xế chưa có profile → redirect đến onboarding. Điền: tên, hãng xe, model, biển số, năm, màu → gọi `PUT /driver/profile`. |
| 5.3 | `[ ]` Form chỉnh sửa thông tin xe trên ProfilePage | `driver/ProfilePage.tsx` | Hiện tại chỉ hiển thị, không có nút Edit. Cần inline edit form. |
| 5.4 | `[ ]` Cập nhật vị trí tài xế khi bật online | `driver/TripListPage.tsx` | Khi toggle online=true, gọi `navigator.geolocation.getCurrentPosition()` và gửi `PATCH /driver/status` với `{online: true, latitude, longitude}`. |
| 5.5 | `[ ]` Hiển thị thông báo penalty khi đặt xe (nếu có nợ 50k) | `customer/BookingFormPage.tsx` | Nếu khách có pending penalty → hiện banner cảnh báo "Phí phạt 50.000đ sẽ được cộng vào cuốc này". |
| 5.6 | `[ ]` Thêm trạng thái `expired` vào `StatusBadge` | `components/common/StatusBadge.tsx` | Booking hết hạn 24h cần có badge riêng. |

---

## 6. PWA & Push Notification (Frontend)

| # | Việc cần làm | Ghi chú |
|---|---|---|
| 6.1 | `[ ]` Kiểm tra/hoàn thiện `manifest.json` (name, icons, theme_color, display) | Cần icon 192px và 512px. `theme_color: #006a36` |
| 6.2 | `[ ]` Viết service worker xử lý push event | `public/sw.js` — show notification khi nhận push từ server |
| 6.3 | `[ ]` Xin quyền push notification và đăng ký subscription | `driver/TripListPage.tsx` — khi bật online lần đầu, xin permission, lưu subscription lên BE (task 3.2) |
| 6.4 | `[ ]` Kiểm tra PWA installable trên Chrome (Lighthouse audit) | Lighthouse PWA checklist |

---

## 7. Chất lượng & Kiểm thử

| # | Việc cần làm | Ghi chú |
|---|---|---|
| 7.1 | `[ ]` Viết Feature test: luồng đặt xe end-to-end | `tests/Feature/BookingFlowTest.php` |
| 7.2 | `[ ]` Viết Feature test: tài xế nhận và hoàn thành cuốc, kiểm tra điểm bị trừ | `tests/Feature/TripCompletionTest.php` |
| 7.3 | `[ ]` Viết Feature test: huỷ cuốc sau 1h → kiểm tra penalty | `tests/Feature/CancellationPenaltyTest.php` |
| 7.4 | `[ ]` Chạy `make lint` (Laravel Pint) và sửa lỗi style | — |
| 7.5 | `[ ]` Chạy `tsc --noEmit` trong frontend container để kiểm tra TypeScript | — |

---

## Thứ tự ưu tiên triển khai

```
Tuần 1 (Core chạy được):
  0.1→0.3  Thiết lập môi trường
  1.1      Fix Dashboard API
  1.2      Fix Revenue API
  1.3      Fix Trip API (field names)
  2.1      Sửa wallet system (deduct không phải credit)
  4.1      Fix TripDetailPage data source
  4.2      Fix TripListPage hardcoded points

Tuần 2 (Nghiệp vụ đủ):
  1.4      Fix Driver list API (pagination + points)
  1.5      Fix Booking history API
  2.3      Giới hạn 3 cuốc/tài xế
  2.4      Auto-expiry 24h (scheduled job)
  2.5      Penalty 50k huỷ sau 1h
  2.2      Admin nạp điểm tài xế
  2.9      Endpoint /driver/trips/mine
  4.3→4.6  Fix các trang FE còn mismatch

Tuần 3 (Tính năng còn thiếu):
  2.6      Thêm trạng thái picking_up
  2.7→2.8  Block khách + chặn đăng ký lại
  2.10     Lưu lý do block
  5.1      Trang Admin/CustomersPage
  5.2      Driver onboarding form
  5.3      ProfilePage edit form

Tuần 4 (Nâng cao):
  2.11→2.12 Geo sorting
  3.1→3.5   Push notifications (BE)
  5.4       Cập nhật vị trí tài xế (FE)
  6.1→6.4   PWA hoàn chỉnh
  7.1→7.5   Tests
```
