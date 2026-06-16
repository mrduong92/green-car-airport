# TASKS.md — Green Car Airport

Trạng thái: `[x]` xong · `[ ]` chưa làm · `[!]` có lỗi / mismatch cần sửa

---

## A1 — Auth / Đăng nhập

| | Việc cần làm | Ghi chú |
|---|---|---|
| `[x]` | OTP gửi mã (BE + FE) | `POST /api/auth/otp/send` |
| `[x]` | Đăng nhập bằng mật khẩu 6 số | `POST /api/auth/login` — không tốn OTP |
| `[x]` | Đăng ký: xác minh OTP → đặt mật khẩu | `POST /api/auth/register` |
| `[x]` | Quên mật khẩu: xác minh OTP → đặt lại | `POST /api/auth/reset-password` |
| `[x]` | Dev bypass: OTP/mật khẩu `000000` luôn pass | `APP_ENV=local` hoặc giá trị `000000` |
| `[x]` | Dev mock toggle: bật/tắt quick-login buttons | Persist localStorage `dev_mock_login` |
| `[x]` | Sanctum token, logout | |
| `[x]` | Role guard: customer / driver / admin redirect đúng trang | |
| `[x]` | Chặn user bị block đăng nhập | `AuthController::login()` check `driver_profiles.status = blocked` → 403 |

---

## A2 — Đặt xe (Khách — BookingFormPage)

| | Việc cần làm | Ghi chú |
|---|---|---|
| `[x]` | Address autocomplete (Goong) — pickup + destination | |
| `[x]` | Chọn loại xe (sedan_4 / suv_5 / mpv_7) | |
| `[x]` | Date chips (7 ngày kể từ hôm nay) | |
| `[x]` | Time grid (0h–23h30, 30 phút/chip, 3 hàng scroll ngang) | |
| `[x]` | Tính khoảng cách (Goong Distance Matrix + Haversine fallback) | |
| `[x]` | Giá tham khảo từ API price-configs + auto-fill giá trung bình | |
| `[x]` | Áp dụng voucher | |
| `[x]` | Tạo booking với GPS coords | |
| `[ ]` | Banner cảnh báo nếu khách đang có penalty 50k chưa trả | BE trả `pending_penalty` trong `/auth/me` nhưng FE chưa hiển thị cảnh báo |

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

| | Việc cần làm |
|---|---|
| `[x]` | Danh sách lịch sử (BE trả plain array, FE dùng `r.data`) |
| `[x]` | Filter theo trạng thái (Tất cả / Hoàn thành / Đã huỷ) |

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
| `[x]` | Push notification khi có cuốc mới |

---

## B2 — Thực hiện cuốc (Tài xế — TripDetailPage)

| | Việc cần làm | Ghi chú |
|---|---|---|
| `[x]` | Xem chi tiết cuốc (pickup, destination, giá, phí app, thực nhận) | |
| `[x]` | Flow trạng thái: accepted → picking_up → in_progress → completed | |
| `[x]` | Giới hạn tài xế nhận tối đa 3 cuốc active | `TripController::accept()` check `$activeCount >= 3` |
| `[ ]` | Placeholder bản đồ tuyến đường (Phase 2) | |

---

## B3 — Ví điểm (Tài xế — WalletPage + TopUpPage)

| | Việc cần làm | Ghi chú |
|---|---|---|
| `[x]` | Hiển thị số điểm + lịch sử giao dịch | |
| `[x]` | Tài xế nạp điểm qua chuyển khoản ngân hàng (Sepay webhook) | Auto-credit khi tiền vào TK công ty; idempotent theo `sepay_id` |
| `[x]` | TopUpPage: QR VietQR + mã chuyển khoản + lịch sử nạp | Polling 15 giây |
| `[x]` | Trừ phí app 20% khi tài xế nhận cuốc | `TripController` debit khi accept |
| `[x]` | Credit 80% thu nhập khi hoàn thành cuốc | `TripController::creditEarning()` |
| `[ ]` | Admin nạp điểm thủ công cho tài xế | `PATCH /admin/drivers/{id}/topup` — chưa có; Sepay tự động đã thay thế phần lớn nhu cầu này |

---

## B4 — Hồ sơ tài xế (Driver — ProfilePage)

| | Việc cần làm | Ghi chú |
|---|---|---|
| `[x]` | Xem thông tin xe + hồ sơ | |
| `[x]` | Form chỉnh sửa thông tin xe (bottom sheet) | |
| `[x]` | Onboarding tài xế mới chưa có profile | Login → `needs_onboarding` → redirect `/driver/profile` + auto-open edit sheet + banner |

---

## C1 — Dashboard Admin

| | Việc cần làm |
|---|---|
| `[x]` | Stats hôm nay: `trips_today`, `trips_today_change`, `revenue_today`, `app_fee_today` |
| `[x]` | `drivers_online`, `drivers_total` |
| `[x]` | `recent_trips[]` |

---

## C2 — Quản lý tài xế (Admin — DriversPage)

| | Việc cần làm | Ghi chú |
|---|---|---|
| `[x]` | Danh sách tài xế (BE `->get()`, FE `r.data`) | |
| `[x]` | Search (name / phone) và filter by status | |
| `[x]` | `formatDriver()` trả `points` (wallet) | Eager load wallet + `$u->wallet?->points ?? 0` |
| `[x]` | `blockDriver()` lưu `blocked_reason` vào DB | Migration + fillable + lưu khi block |
| `[x]` | Unblock tài xế | `PATCH /admin/drivers/{id}/unblock` — nút "Bỏ chặn" trên card |
| `[x]` | Admin nạp điểm thủ công cho tài xế (button + modal) | `POST /admin/drivers/{id}/topup` + modal DriversPage |

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

| | Việc cần làm |
|---|---|
| `[x]` | BE hỗ trợ `?period=today/week/month` |
| `[x]` | Trả đúng fields: `total_revenue`, `app_fee`, `trips_completed`, `avg_per_trip`, `chart[]` |
| `[ ]` | Nút "Xuất Excel" |

---

## C6 — Quản lý khách hàng (Admin — CustomersPage)

| | Việc cần làm | Ghi chú |
|---|---|---|
| `[x]` | Trang `CustomersPage.tsx` + route `/admin/customers` | |
| `[x]` | Danh sách khách + search | `GET /admin/customers?search=` |
| `[x]` | Xem lịch sử đặt xe của khách | `GET /admin/customers/{id}/bookings` + bottom sheet |
| `[x]` | `PATCH /admin/customers/{id}/block` — block khách | block + unblock + login check |

---

## N1 — Nghiệp vụ nền

| | Việc cần làm | Ghi chú |
|---|---|---|
| `[x]` | Penalty 50k khi khách huỷ sau 1h | `BookingController::cancel()`: check `diffInMinutes > 60` → `increment('pending_penalty', 50_000)` |
| `[x]` | Auto-expiry cuốc sau 24h không có tài xế nhận | `ExpireStaleBookings` command + `Schedule::command()->hourly()` trong `console.php` |
| `[x]` | Chặn user bị block đăng nhập | `AuthController::login()` check `driver_profiles.status = blocked` → 403 |
| `[ ]` | Chặn tài xế bị block đăng ký lại bằng biển số đã block | `ProfileController::update()` check biển số |

---

## N2 — Push Notification

| | Việc cần làm |
|---|---|
| `[x]` | Bảng `push_subscriptions` + `POST /push/subscribe` |
| `[x]` | `minishlink/web-push` + WebPushChannel |
| `[x]` | Push khi có cuốc mới (tài xế online) |
| `[x]` | Push khi cuốc được nhận / cập nhật trạng thái |
| `[x]` | Push khi nạp điểm thành công (Sepay) |
| `[x]` | FE service worker: nhận push, hiện OS notification khi background |
| `[x]` | FE xin quyền notification + đăng ký subscription khi login |

---

## N3 — PWA

| | Việc cần làm |
|---|---|
| `[x]` | Icons 192/512px, `theme_color: #006a36`, `display: standalone` |
| `[x]` | Service worker: precache offline + push handler |
| `[x]` | Trang `/install`: hướng dẫn Android / iOS / Desktop |
| `[x]` | Install banner trên SplashPage + row trong Profile pages |
| `[x]` | `canInstall` ẩn khi đang chạy standalone mode |

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
Đợt 1 — Lỗi còn lại (broken UX / data sai):
  C2  formatDriver() thiếu wallet points
  C2  blockDriver() không lưu blocked_reason
  A1  Chặn user bị block đăng nhập (login() check status)

Đợt 2 — Nghiệp vụ thiếu:
  N1  Penalty 50k khi huỷ sau 1h
  N1  Auto-expiry cuốc 24h (ExpireBookingsJob)
  B4  Driver onboarding (redirect nếu chưa có driverProfile)

Đợt 3 — Tính năng còn thiếu:
  C6  Block khách hàng (Admin)
  C6  Xem lịch sử đặt xe của khách
  A2/A3  Hiển thị & cảnh báo penalty trên FE
  C5  Xuất Excel

Đợt 4 — Nâng cao:
  B4  Driver onboarding flow
  Phase 2  Bản đồ tương tác Goong
```
