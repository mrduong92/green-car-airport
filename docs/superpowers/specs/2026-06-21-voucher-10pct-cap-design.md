# Thiết kế: Giới hạn voucher tối đa 10% / cuốc xe

**Ngày:** 2026-06-21
**Trạng thái:** Đã duyệt

---

## Bối cảnh & Vấn đề

Hiện tại voucher không có giới hạn giảm tối đa. Một voucher 100.000đ trên cuốc xe 250.000đ sẽ giảm 100.000đ (40%), khiến:

1. **Khách hàng** thấy tổng thanh toán 150.000đ.
2. **Tài xế** thấy "Giá khách trả" là 250.000đ (giá gốc) — không khớp với số khách thực trả.
3. Doanh thu bị ảnh hưởng không kiểm soát khi voucher mệnh giá lớn.

**Mục tiêu:**
- Giới hạn cứng: discount tối đa = 10% giá cuốc.
- Tài xế và khách hàng thấy cùng số tiền "khách trả".
- Thông báo rõ ràng cho khách biết giới hạn 10%.

---

## Hằng số

| Layer    | Khai báo                          |
|----------|-----------------------------------|
| Backend  | `const VOUCHER_MAX_RATE = 0.10;`  |
| Frontend | `const VOUCHER_MAX_RATE = 0.10`   |

Đây là hằng số hard-code. Nếu sau này cần động hoá, sẽ thiết kế riêng.

---

## Công thức tính discount

```
rawDiscount  = fixed ? voucher.value : floor(price × voucher.value / 100)
maxDiscount  = floor(price × 0.10)
actualDiscount = min(rawDiscount, maxDiscount)
```

---

## Các thay đổi

### Backend

#### 1. `VoucherController::apply()`
Áp dụng cap khi trả về preview discount. Thêm field `max_discount` vào response:

```php
$raw         = $voucher->type === 'fixed'
    ? $voucher->value
    : (int) round($request->price * $voucher->value / 100);
$maxDiscount = (int) floor($request->price * 0.10);
$discount    = min($raw, $maxDiscount);

return response()->json([
    'code'         => $voucher->code,
    'type'         => $voucher->type,
    'value'        => $voucher->value,
    'discount'     => $discount,
    'max_discount' => $maxDiscount,
]);
```

#### 2. `BookingController::store()`
Áp dụng cap khi lưu booking (guard cuối — bảo vệ server side):

```php
$raw      = $voucher->type === 'fixed'
    ? $voucher->value
    : (int) round($data['price'] * $voucher->value / 100);
$discount = min($raw, (int) floor($data['price'] * 0.10));
```

#### 3. `TripController::formatTrip()`
Thêm `discount` và `final_price` vào response. Driver dùng `final_price` làm "Giá khách trả":

```php
// Thêm vào mảng return:
'discount'    => $b->discount,
'final_price' => $b->price - $b->discount,
```

`app_fee` và `net_earning` đã tính đúng trên `effectivePrice = price - discount` — không thay đổi.

---

### Frontend

#### 4. `VoucherSheet.tsx`
- Khai báo `const VOUCHER_MAX_RATE = 0.10` ở đầu file.
- Cập nhật `calcDiscount()`:

```ts
function calcDiscount(v: App.VoucherListItem, price: number) {
  const raw = v.type === 'fixed' ? v.value : Math.round(price * v.value / 100)
  return Math.min(raw, Math.floor(price * VOUCHER_MAX_RATE))
}
```

- Trong mỗi voucher card: hiển thị dòng cap **chỉ khi** voucher bị giới hạn (`raw > maxDiscount`):
  - Có cap: `"Tiết kiệm 25.000đ"` + dòng nhỏ `"Tối đa 25.000đ (10% cuốc này)"`
  - Không cap: `"Tiết kiệm Xđ"` (bình thường, không hiện dòng phụ)

#### 5. `BookingFormPage.tsx`
- Nhận `VOUCHER_MAX_RATE` (import hoặc khai báo lại cùng giá trị).
- Trong footer, thêm dòng thông báo **chỉ khi** discount đang bị cap:

```ts
const maxDiscount = Math.floor(price * VOUCHER_MAX_RATE)
const isCapped    = discount > 0 && discount === maxDiscount
```

Hiển thị dưới dòng giảm giá:
```
-25.000đ
Giảm tối đa 10% giá cuốc
```

#### 6. `TripDetailPage.tsx`
- Đổi `trip.price` → `trip.final_price` tại label "Giá khách trả" (dòng 152).
- Đổi `trip.price * 0.2` → `trip.final_price * 0.2` trong `ConfirmDialog` (dòng 190).

#### 7. `types.d.ts`
Thêm vào `App.Trip`:

```ts
discount: number
final_price: number
```

---

## Ví dụ minh họa

| Giá cuốc | Voucher     | raw      | maxDiscount | actualDiscount | Khách trả |
|----------|-------------|----------|-------------|----------------|-----------|
| 250.000đ | Fixed 100k  | 100.000đ | 25.000đ     | **25.000đ**    | 225.000đ  |
| 500.000đ | Fixed 100k  | 100.000đ | 50.000đ     | **50.000đ**    | 450.000đ  |
| 500.000đ | Percent 50% | 250.000đ | 50.000đ     | **50.000đ**    | 450.000đ  |
| 300.000đ | Percent 5%  | 15.000đ  | 30.000đ     | **15.000đ**    | 285.000đ  |

---

## Không thay đổi

- Schema DB (`bookings.discount` column) — giá trị lưu sẽ nhỏ hơn, không cần migration.
- Logic `app_fee` / `net_earning` / `creditEarning()` — đã dùng `price - discount` đúng.
- Luồng huỷ voucher khi cancel booking.
- Admin VoucherController — quản lý mệnh giá gốc, không bị ảnh hưởng.
