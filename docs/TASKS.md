# TASKS.md — Green Car Airport

Trạng thái: `[x]` xong · `[ ]` chưa làm · `[!]` có lỗi / mismatch cần sửa

---

## A1 — Auth / Đăng nhập

| | Việc cần làm |
|---|---|
| `[x]` | OTP send + verify (BE + FE) |
| `[x]` | Dev bypass: OTP `000000` luôn thành công |
| `[x]` | Sanctum token, logout |
| `[x]` | Role guard: customer / driver / admin redirect đúng trang |

---

## A2 — Đặt xe (Khách — BookingFormPage)

| | Việc cần làm | Ghi chú |
|---|---|---|
| `[x]` | Address autocomplete (Goong) — pickup + destination | Suppress re-fire sau khi chọn |
| `[x]` | Chọn loại xe (sedan_4 / suv_5 / mpv_7) | |
| `[x]` | Date chips (7 ngày kể từ hôm nay) | |
| `[x]` | Time grid (0h–23h30, 30 phút/chip, 3 hàng scroll ngang) | |
| `[x]` | Tính khoảng cách (Goong Distance Matrix + Haversine fallback) | |
| `[x]` | Giá tham khảo từ API price-configs + auto-fill giá trung bình | |
| `[x]` | Áp dụng voucher | |
| `[x]` | Tạo booking với GPS coords (pickup_lat/lng, destination_lat/lng) | |
| `[ ]` | Banner cảnh báo nếu khách đang có penalty 50k chưa trả | Cần BE trả `pending_penalty` trong user info |

---

## A3 — Trạng thái đặt xe (Khách — BookingStatusPage)

| | Việc cần làm |
|---|---|
| `[x]` | Polling trạng thái booking (refetchInterval) |
| `[x]` | Hiển thị thông tin tài xế khi đã nhận |
| `[x]` | Nút huỷ chuyến |
| `[ ]` | Hiển thị thông báo penalty 50k khi huỷ sau 1h |

---

## A4 — Lịch sử đặt xe (Khách — BookingHistoryPage)

| | Việc cần làm | Ghi chú |
|---|---|---|
| `[!]` | FE gọi `r.data.data` (paginated), BE trả plain array → list luôn rỗng | Sửa BE để paginate hoặc FE đổi thành `r.data` |
| `[ ]` | Filter theo trạng thái (Tất cả / Hoàn thành / Đã huỷ) hoạt động | Phụ thuộc vào fix trên |

---

## B1 — Danh sách cuốc (Tài xế — TripListPage)

| | Việc cần làm |
|---|---|
| `[x]` | Danh sách cuốc available (polling 15 giây) |
| `[x]` | Toggle online / offline |
| `[x]` | Lấy GPS khi bật online, gửi lên BE |
| `[x]` | Sort mới nhất / gần nhất (Haversine BE) |
| `[x]` | Badge `~X km tới điểm đón` khi có vị trí |
| `[x]` | Hiển thị điểm ví thực từ API |
| `[ ]` | Push notification khi có cuốc mới (Phase 1 spec) |

---

## B2 — Thực hiện cuốc (Tài xế — TripDetailPage)

| | Việc cần làm | Ghi chú |
|---|---|---|
| `[x]` | Xem chi tiết cuốc (pickup, destination, giá, phí app, thực nhận) | |
| `[x]` | Flow trạng thái: accepted → picking_up → in_progress → completed (FE) | |
| `[!]` | BE `updateStatus()` chưa xử lý `picking_up` → FE gọi sẽ lỗi 422 | Thêm `picking_up` vào `$map` trong TripController |
| `[ ]` | Giới hạn tài xế nhận tối đa 3 cuốc active | Check trong `TripController::accept()` |
| `[ ]` | Placeholder bản đồ tuyến đường (Phase 2) | |

---

## B3 — Ví điểm (Tài xế — WalletPage)

| | Việc cần làm | Ghi chú |
|---|---|---|
| `[x]` | Hiển thị số điểm + lịch sử giao dịch | |
| `[!]` | Logic điểm **sai spec**: hiện đang CỘNG điểm sau cuốc | Spec: tài xế pre-fund ví → hoàn thành cuốc → **TRỪ** phí 20% |
| `[ ]` | Endpoint admin nạp điểm: `PATCH /admin/drivers/{id}/topup` | Admin nhập số tiền → quy đổi 1.000đ = 1 điểm |
| `[ ]` | Kiểm tra số dư tối thiểu trước khi nhận cuốc (nếu áp dụng pre-fund) | |

---

## B4 — Hồ sơ tài xế (Driver — ProfilePage)

| | Việc cần làm | Ghi chú |
|---|---|---|
| `[x]` | Xem thông tin xe + hồ sơ | |
| `[ ]` | Form chỉnh sửa thông tin xe (inline edit) | |
| `[ ]` | Màn hình onboarding cho tài xế mới chưa có profile | Sau OTP verify → redirect nếu chưa có `driverProfile` |

---

## C1 — Dashboard Admin

| | Việc cần làm | Ghi chú |
|---|---|---|
| `[!]` | BE trả stats tổng cộng dồn; FE cần stats **hôm nay** | FE dùng: `trips_today`, `trips_today_change`, `revenue_today`, `drivers_online`, `drivers_total`, `app_fee_today`, `recent_trips[]` |
| `[!]` | BE không trả `drivers_online`, `recent_trips[]` | Sửa `DashboardController::index()` |

---

## C2 — Quản lý tài xế (Admin — DriversPage)

| | Việc cần làm | Ghi chú |
|---|---|---|
| `[!]` | FE gọi `r.data.data` (paginated), BE trả plain array → list rỗng | Sửa BE để trả paginated hoặc FE đổi thành `r.data` |
| `[!]` | BE `formatDriver()` không có trường `points` → FE hiển thị undefined | Thêm wallet points vào response |
| `[!]` | BE không xử lý search (name/phone/biển số) và filter by status | Thêm `where` clause vào `DriverController::index()` |
| `[!]` | `blockDriver()` gửi `reason` nhưng BE bỏ qua, không lưu DB | Thêm `blocked_reason` vào `driver_profiles`, lưu khi block |
| `[ ]` | Admin nạp điểm cho tài xế (button + modal) | Gọi `PATCH /admin/drivers/{id}/topup` |
| `[ ]` | Unblock tài xế | |

---

## C3 — Quản lý voucher (Admin — VouchersPage)

| | Việc cần làm |
|---|---|
| `[x]` | CRUD voucher (tạo / xem / deactivate) |
| `[x]` | Hiển thị usage_count / usage_limit |

---

## C4 — Bảng giá (Admin — PriceConfigPage)

| | Việc cần làm |
|---|---|
| `[x]` | CRUD bảng giá (tạo / sửa / ẩn/hiện) |
| `[x]` | Seed data 6 dòng (airport + provincial × 3 loại xe) |
| `[x]` | BookingFormPage lấy giá từ API thay vì hardcode |

---

## C5 — Báo cáo doanh thu (Admin — RevenuePage)

| | Việc cần làm | Ghi chú |
|---|---|---|
| `[!]` | BE trả `{rows, total, total_fee, total_trips}` với param `?days=30` | FE dùng: `{total_revenue, app_fee, trips_completed, avg_per_trip, chart:[{label, revenue, fee}]}` với param `?period=today/week/month` |
| `[ ]` | Nút "Xuất Excel" chưa có chức năng | |

---

## C6 — Quản lý khách hàng (Admin — CustomersPage)

| | Việc cần làm | Ghi chú |
|---|---|---|
| `[ ]` | Tạo `admin/CustomersPage.tsx` + route `/admin/customers` | Danh sách khách, tìm kiếm, xem lịch sử đặt xe |
| `[ ]` | Thêm vào nav `AdminLayout` | |
| `[ ]` | `GET /admin/customers` — list với search, filter | |
| `[ ]` | `PATCH /admin/customers/{id}/block` — block khách | |

---

## N1 — Nghiệp vụ nền

| | Việc cần làm | Ghi chú |
|---|---|---|
| `[ ]` | Penalty 50k khi khách huỷ sau 1h | BE: check `created_at` trong `cancel()` → ghi `penalty_amount` → cộng vào cuốc tiếp |
| `[ ]` | Auto-expiry cuốc sau 24h không có tài xế nhận | Tạo `ExpireBookingsJob` + schedule mỗi 5 phút |
| `[ ]` | Chặn tài xế/khách bị block đăng nhập lại | `OtpController::verify()` check `status=blocked` → 403 |
| `[ ]` | Chặn tài xế bị block đăng ký lại bằng biển số đã block | `ProfileController::update()` check biển số |

---

## N2 — Push Notification

| | Việc cần làm |
|---|---|
| `[ ]` | Migration: bảng `push_subscriptions` |
| `[ ]` | `POST /driver/push-subscription` — lưu Web Push subscription |
| `[ ]` | Install `minishlink/web-push` |
| `[ ]` | `SendPushNotificationJob` — gửi push đến tài xế online khi booking mới |
| `[ ]` | Dispatch job trong `BookingController::store()` |
| `[ ]` | FE service worker xử lý push event |
| `[ ]` | FE xin quyền notification + đăng ký subscription khi bật online |

---

## N3 — PWA

| | Việc cần làm |
|---|---|
| `[ ]` | Kiểm tra `manifest.json`: name, icons 192/512px, `theme_color: #006a36`, `display: standalone` |
| `[ ]` | Service worker hoạt động (offline fallback) |
| `[ ]` | Lighthouse PWA audit đạt installable |

---

## Phase 2 — Bản đồ tương tác Goong (chưa làm)

> Spec đầy đủ: `docs/specs/driver-location.md`

| | Việc cần làm |
|---|---|
| `[ ]` | Install `@goongmaps/goong-js` |
| `[ ]` | Component `TripMap.tsx`: driver marker + trip pins + bottom sheet nhận cuốc |
| `[ ]` | Toggle List/Map trong TripListPage |

---

## Thứ tự ưu tiên gợi ý

```
Đợt 1 — Sửa lỗi hiển thị (broken UX):
  A4  Fix BookingHistoryPage (r.data.data → r.data hoặc paginate BE)
  B2  Fix picking_up status trong TripController
  C1  Fix DashboardController (stats hôm nay + drivers_online + recent_trips)
  C2  Fix DriversPage (paginate + search/filter + points + block reason)
  C5  Fix RevenueController (period=today/week/month + đúng field names)

Đợt 2 — Nghiệp vụ thiếu:
  B3  Sửa logic điểm (deduct thay vì credit) + admin topup endpoint
  B2  Giới hạn 3 cuốc/tài xế
  N1  Penalty 50k + auto-expiry 24h

Đợt 3 — Tính năng còn thiếu:
  C6  Quản lý khách hàng (Admin)
  B4  Driver onboarding + edit profile
  N1  Block check khi login/đăng ký lại

Đợt 4 — Nâng cao:
  N2  Push Notification
  N3  PWA audit
  Phase 2  Bản đồ tương tác
```
