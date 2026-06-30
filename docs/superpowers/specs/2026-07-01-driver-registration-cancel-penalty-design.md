# Design: Đăng ký tài xế & Hủy chuyến có phí phạt

**Ngày:** 2026-07-01

---

## 1. Đăng ký tài xế

### Vấn đề

Hiện tại `RegisterPage.tsx` chỉ tạo user với `role=customer`. Tài xế muốn đăng ký phải dùng cùng form, bị redirect vào `/customer/booking` và không có chỗ điền thông tin xe. Flow gây confusing.

### Thiết kế

**Backend — `Auth/DriverRegisterController.php` (mới)**

Endpoint: `POST /api/auth/register/driver`

Request:
```json
{
  "phone": "0912345678",
  "otp": "123456",
  "name": "Nguyễn Văn A",
  "password": "123456",
  "vehicle_make": "Toyota",
  "vehicle_model": "Camry",
  "vehicle_plate": "51G-12345",
  "vehicle_year": 2022,
  "vehicle_color": "Trắng",
  "vehicle_type": "sedan_4"
}
```

Logic:
1. Xác thực OTP (giống `OtpController::verify`, nhưng phone chưa tồn tại)
2. Tạo `User` với `role=driver`, `name`, `password` (bcrypt)
3. Tạo `DriverProfile` với toàn bộ thông tin xe (`is_verified=true` — nhận chuyến ngay)
4. Tạo `Wallet` trống cho driver
5. Trả về token + user

Validation:
- `vehicle_type`: `in:sedan_4,suv_5,mpv_7`
- `vehicle_plate`: required, max 20
- `vehicle_year`: integer, min 2000, max current year

**Frontend — `src/pages/DriverRegisterPage.tsx` (mới)**

Route: `/register/driver` (trong `GuestOnly` block)

Flow 5 bước:
1. **SĐT** — nhập số điện thoại, gửi OTP với `purpose=register`
2. **OTP** — nhập mã 6 số, countdown 45s
3. **Tên + Mật khẩu** — họ tên + mật khẩu 6 chữ số
4. **Thông tin xe** — make, model, plate, year, color + dropdown loại xe
5. **Điều khoản** — checkbox + nút "Đăng ký tài xế"

Sau thành công: `setAuth(user, token)` → redirect `/driver/trips`.

Entry point: `SplashPage` và `LoginPage` thêm link "Đăng ký làm tài xế" → `/register/driver`.

---

## 2. Hủy chuyến với phí phạt

### Vấn đề

Code hiện tại có xương sống penalty (50k, `pending_penalty`, `surcharge`) nhưng còn 4 lỗi:

1. `BookingController::cancel()` chặn hủy khi status = `accepted` — thiếu
2. Không hoàn phí app cho tài xế khi khách hủy sau khi đã accepted
3. `TripController::updateStatus()` không deduct surcharge từ ví tài xế khi complete
4. `TripController::formatTrip()` không bao gồm `surcharge` trong `final_price`

### Luồng hoàn chỉnh

| Trạng thái | Khách hủy được? | Phạt | Hoàn phí app tài xế? |
|---|---|---|---|
| `finding_driver` | ✅ | Không | Không có tài xế |
| `accepted` < 1h | ✅ | Không | ✅ Hoàn 20% |
| `accepted` > 1h | ✅ | +50k vào cuốc sau | ✅ Hoàn 20% |
| `in_progress` | ❌ | — | — |
| `completed` / `cancelled` | ❌ | — | — |

Khi driver bấm "Đã đón khách" → `in_progress` → khách không hủy được nữa.

### Fix 1 — `BookingController::cancel()`: mở rộng status check

```
Cũ: ['pending', 'finding_driver']
Mới: ['finding_driver', 'accepted']
```

### Fix 2 — `BookingController::cancel()`: hoàn phí app cho tài xế

Khi `booking->driver_id` tồn tại (đã có tài xế nhận):
- Tính `feePoints = round((price - discount) * 0.20 / 1000)`
- `driver.wallet.points += feePoints`
- Tạo `WalletTransaction`: `type=credit`, `description='Hoàn phí app cuốc #X (khách hủy)'`

Booking sau khi hủy: `status = 'cancelled'` — không quay lại queue.

### Fix 3 — `TripController::updateStatus()`: deduct surcharge khi complete

Khi `newStatus === 'completed'` và `booking->surcharge > 0`:
- `surchargePoints = round(surcharge / 1000)` (50k = 50 points)
- `driver.wallet.points -= surchargePoints`
- Tạo `WalletTransaction`: `type=debit`, `description='Phí phạt hủy khách cuốc #X'`

### Fix 4 — `TripController::formatTrip()`: thêm surcharge

```php
// Cũ:
'final_price' => $b->price - $b->discount,

// Mới:
'surcharge'   => $b->surcharge,
'final_price' => $b->price - $b->discount + $b->surcharge,
```

### Fix 5 — `BookingStatusPage.tsx`: mở rộng canCancel

```js
// Cũ:
const canCancel = booking && ['pending', 'finding_driver'].includes(booking.status)

// Mới:
const canCancel = booking && ['finding_driver', 'accepted'].includes(booking.status)
```

Logic `isFreeCancel`, `minutesLeft` giữ nguyên — đã đúng.

---

## Không thay đổi

- Voucher không hoàn khi hủy (thiết kế hiện tại, có comment trong code)
- Driver cancel → booking trở lại `finding_driver`, phí app không hoàn (thiết kế hiện tại)
- Penalty 50k áp dụng vào `surcharge` của **cuốc tiếp theo** của khách (đã implement qua `pending_penalty`)
