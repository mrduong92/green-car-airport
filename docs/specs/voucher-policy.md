# Chính sách Voucher

## Nguyên tắc cốt lõi

> **Voucher đã cấp không thể cấp lại.** Một khi voucher được áp dụng vào booking, slot sử dụng bị trừ vĩnh viễn và không hoàn lại dù booking bị huỷ bởi bất kỳ lý do gì.

---

## Lifecycle của một Voucher

```
Tạo voucher (Admin)
    ↓
Hiển thị trong VoucherSheet (GET /vouchers — lọc active + chưa hết hạn + còn quota)
    ↓
Khách chọn → discount tính client-side (không tốn API call)
    ↓
Khách bấm "Đặt xe" → POST /bookings với voucher_code
    ↓  BookingController::store() re-validate + increment usage_count  ←── ĐIỂM KHÔNG THỂ HOÀN
    ↓
Booking tồn tại với voucher_id, discount ghi nhận
    ↓
  [Hoàn thành] Voucher đã được dùng, usage_count giữ nguyên
  [Huỷ bởi khách / driver / hệ thống] usage_count KHÔNG bị decrement
```

---

## Quy tắc chi tiết

### 1. Khi nào voucher bị "đốt"

- Thời điểm duy nhất `usage_count` tăng: **`BookingController::store()`** — ngay sau khi booking được tạo thành công.
- Không có bất kỳ code path nào decrement `usage_count` trong toàn bộ hệ thống.

### 2. Huỷ booking không hoàn voucher

| Ai huỷ | Kết quả với voucher |
|---|---|
| Khách (< 1h, miễn phí) | Voucher vẫn mất |
| Khách (> 1h, bị phạt 50k) | Voucher vẫn mất |
| Tài xế (sau khi nhận) | Voucher vẫn mất |
| Hệ thống (expire 24h) | Voucher vẫn mất |

### 3. Giới hạn dùng

- `usage_limit = NULL` → không giới hạn
- `usage_limit = N` → tối đa N lượt dùng (`usage_count < usage_limit`)
- Kiểm tra tại `GET /vouchers` (hiển thị) và `POST /bookings` (áp dụng) — double-check để tránh race condition

### 4. Điều kiện hiển thị (GET /vouchers)

```php
Voucher::where('is_active', true)
    ->where('expires_at', '>=', today())
    ->where(fn ($q) => $q->whereNull('usage_limit')
                         ->orWhereColumn('usage_count', '<', 'usage_limit'))
```

### 5. Re-validate khi đặt xe

`POST /bookings` luôn re-validate voucher (is_active, expires_at, quota) trước khi áp dụng. Nếu voucher đã hết quota trong khoảng thời gian từ lúc khách chọn đến lúc đặt → discount = 0, booking vẫn tạo thành công nhưng không có giảm giá.

---

## UX — Thông báo cho khách

- **BookingStatusPage**: hiển thị mã voucher + số tiền giảm trong phần tóm tắt chuyến.
- **Confirm dialog huỷ chuyến**: nếu booking có voucher, thêm dòng _"Voucher {CODE} đã dùng sẽ không được hoàn lại."_
- **VoucherSheet (picker)**: hiển thị "Tiết kiệm Xđ" dựa trên giá hiện tại để khách biết mức tiết kiệm thực tế.

---

## Trường DB liên quan

| Bảng | Cột | Mô tả |
|---|---|---|
| `vouchers` | `usage_count` | Tăng khi booking tạo, không giảm khi huỷ |
| `vouchers` | `usage_limit` | NULL = không giới hạn |
| `vouchers` | `is_active` | Admin có thể deactivate thủ công |
| `vouchers` | `expires_at` | Hết hạn theo ngày (so sánh với `today()`) |
| `bookings` | `voucher_id` | FK đến voucher đã dùng |
| `bookings` | `discount` | Số tiền giảm tính tại thời điểm đặt |
