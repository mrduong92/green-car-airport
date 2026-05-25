# Chính sách huỷ chuyến

## Khách hàng huỷ

| Thời điểm | Kết quả |
|---|---|
| ≤ 60 phút sau khi đặt | Miễn phí, không phạt |
| > 60 phút sau khi đặt | Phạt **50,000đ** — cộng vào cuốc tiếp theo dưới dạng `surcharge` |
| Sau khi tài xế nhận (`accepted`, `picking_up`, `in_progress`) | Không thể huỷ |

Phần tiền phạt 50,000đ **không trả cho tài xế** — tính vào doanh thu công ty thông qua trường `surcharge` trên booking mới.

## Tài xế huỷ

| Thời điểm | Kết quả |
|---|---|
| Trước khi nhận | Không có action, không phạt |
| Sau khi nhận (`accepted` hoặc `picking_up`) | Phí app 20% đã trừ từ ví **không được hoàn** |

Khi tài xế huỷ, booking quay về `finding_driver` để tài xế khác có thể nhận.

## Wallet flow (tài xế)

```
Nhận cuốc → debit  20% (points)   "Phí app 20% cuốc #X"
Hoàn thành → credit 100% (points)  "Thu nhập chuyến #X"
Net = +80%  (giống như trước nhưng minh bạch hơn)
```

## Tự động huỷ (hệ thống)

Booking ở trạng thái `finding_driver` quá **24h** sẽ bị tự động chuyển sang `cancelled` với `cancelled_by = 'system'`.

Command: `php artisan bookings:expire`  
Schedule: chạy mỗi giờ

## Trường DB liên quan

| Bảng | Cột | Mô tả |
|---|---|---|
| `bookings` | `surcharge` INT DEFAULT 0 | Tiền phạt từ lần huỷ trước của khách |
| `bookings` | `cancelled_by` ENUM(customer, driver, system) | Ai huỷ |
| `users` | `pending_penalty` INT DEFAULT 0 | Số tiền phạt đang chờ áp dụng vào cuốc tiếp theo |
