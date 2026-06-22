# Design: Booking Cancel & Wallet Fixes

**Date:** 2026-06-22  
**Scope:** 4 independent changes to cancellation logic, cancel UX, booking rules text, and driver wallet

---

## 1. Phạt hủy chuyến tính từ lúc tài xế nhận (không phải lúc đặt)

### Vấn đề
`BookingController::cancel()` hiện tính thời gian phạt từ `$booking->created_at`. Điều này sai — khách nên được tính từ thời điểm có tài xế nhận cuốc, vì trước đó chưa ảnh hưởng đến ai.

### Thay đổi Backend
- **Migration mới:** thêm `accepted_at` (timestamp, nullable) vào bảng `bookings`
- **`TripController::accept()`:** set `accepted_at = now()` khi driver nhận cuốc
- **`BookingController::cancel()`:** đổi logic phạt:
  - Nếu `accepted_at` là null (chưa có driver nhận) → không phạt, bất kể thời gian chờ
  - Nếu `accepted_at` tồn tại → phạt nếu `now() - accepted_at > 60 phút`
- **`formatBooking()`:** trả thêm field `accepted_at` (ISO string hoặc null)

### Thay đổi Frontend (`BookingStatusPage.tsx`)
- Tính `minutesSinceBooking` từ `booking.accepted_at` thay vì `booking.created_at`
- Nếu `booking.accepted_at` là null → `isFreeCancel = true`, `minutesLeft = 60` (hiển thị "Huỷ miễn phí")
- Cập nhật type `App.Booking` để include `accepted_at?: string | null`

---

## 2. Gợi ý lý do hủy chuyến

### Mô tả
Khi khách nhấn "Huỷ chuyến", thay vì mở `ConfirmDialog` ngay, hiển thị bước chọn lý do trước.

### Thay đổi Backend
- **Migration mới:** thêm `cancel_reason` (varchar(255), nullable) vào bảng `bookings`
- **`BookingController::cancel()`:** validate và lưu `cancel_reason` (nullable string, max 255)

### Thay đổi Frontend (`BookingStatusPage.tsx`)
- Thêm state: `cancelReason: string | null`
- Flow mới khi nhấn "Huỷ chuyến":
  1. Mở bottom-sheet/modal chọn lý do (thay vì `ConfirmDialog`)
  2. Các lựa chọn preset:
     - "Tài xế yêu cầu hủy"
     - "Đổi lộ trình"
     - "Đổi xe khác"
     - "Lý do khác" (kèm input text tự do)
  3. Sau khi chọn lý do → hiện `ConfirmDialog` với thông tin phí phạt (nếu có)
- `cancelBooking()` API call gửi thêm `cancel_reason`

---

## 3. Text quy định đặt xe

### Thay đổi
File: `frontend/src/components/common/AppHeader.tsx`, `CUSTOMER_QUY_DINH` array

| Trước | Sau |
|---|---|
| "Giá **đã** bao gồm phí cầu đường và bãi đỗ sân bay." | "Giá **chưa** bao gồm phí cầu đường và bãi đỗ sân bay." |

---

## 4. Bỏ cộng điểm khi hoàn thành chuyến

### Vấn đề
`creditEarning()` hiện cộng 100% điểm vào ví tài xế khi trip `completed`. Đây là sai logic — tài xế thu tiền mặt trực tiếp từ khách, app chỉ thu phí 20% khi nhận cuốc.

### Model thanh toán đúng
- Tài xế nạp điểm vào ví (topup)
- Khi nhận cuốc: trừ 20% phí app từ ví (đã implement)
- Khi hoàn thành: tài xế thu tiền mặt từ khách — app không credit gì thêm
- Ví chỉ thay đổi qua: topup và trừ phí nhận cuốc

### Thay đổi Backend (`TripController.php`)
- Xóa call `$this->creditEarning(...)` trong `updateStatus()` khi `$newStatus === 'completed'`
- Xóa method `creditEarning()`
- Giữ `$driver->driverProfile?->increment('trips_count')` — vẫn tăng số cuốc hoàn thành

---

## Các migration cần tạo

| Migration | Nội dung |
|---|---|
| `add_accepted_at_to_bookings` | `accepted_at` timestamp nullable |
| `add_cancel_reason_to_bookings` | `cancel_reason` varchar(255) nullable |

Có thể gộp 2 migration vào 1 nếu muốn.

---

## Phạm vi KHÔNG thay đổi
- Logic cho phép/không cho phép hủy (`canCancel`) — giữ nguyên chỉ `finding_driver`
- Phí phạt 50,000đ — giữ nguyên
- Voucher không hoàn khi hủy — giữ nguyên
- Flow topup ví tài xế — giữ nguyên
