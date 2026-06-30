# Design: Collaborator & Thu Hộ (Collection Fee)

**Date:** 2026-07-01  
**Status:** Approved  
**Scope:** Thêm tính năng Thu Hộ cho Cộng Tác Viên (Collaborator) — khách sạn, chủ lịch, đối tác giới thiệu khách

---

## Tổng quan nghiệp vụ

Collaborator là khách hàng được Admin kích hoạt, có quyền đặt xe kèm khoản "Thu Hộ" — phần chênh lệch giữa giá họ báo cho khách và giá thực tài xế nhận. Khi chuyến hoàn thành, 80% khoản Thu Hộ được cộng tự động vào ví điểm của collaborator. App giữ 20% còn lại như admin fee.

---

## Logic tính phí

### Cuốc không có Thu Hộ (`collection_fee = 0`)
Logic hiện tại giữ nguyên hoàn toàn.

### Cuốc có Thu Hộ (`collection_fee > 0`)

```
total_collected  = (price - discount) + collection_fee
app_fee          = total_collected × 20%
driver_net       = total_collected - app_fee - collection_fee
collaborator_net = collection_fee × 80%
```

**Ví dụ:**

| Khoản mục | Tính | Kết quả |
|---|---|---|
| Giá khách trả (sau voucher) | — | 1,000,000đ |
| Thu Hộ | — | 200,000đ |
| Tài xế thu từ khách | 1,000k + 200k | 1,200,000đ |
| App fee (20%) | 1,200k × 20% | 240,000đ |
| Tài xế thực nhận | 1,200k − 240k − 200k | 760,000đ |
| Collaborator nhận vào ví | 200k × 80% | 160,000đ (= 160 điểm) |
| App giữ ròng | 240k (bao gồm 20% của 200k) | 240,000đ |

**Quy tắc Voucher:** Cap 10% vẫn tính trên `price` gốc — không tính `collection_fee`.

---

## Schema

### Migration 1: `users` table
```sql
ALTER TABLE users ADD COLUMN is_collaborator BOOLEAN NOT NULL DEFAULT FALSE;
```

### Migration 2: `bookings` table
```sql
ALTER TABLE bookings
  ADD COLUMN collection_fee   UNSIGNED INT NOT NULL DEFAULT 0,
  ADD COLUMN collaborator_id  BIGINT UNSIGNED NULL,
  ADD CONSTRAINT fk_bookings_collaborator
    FOREIGN KEY (collaborator_id) REFERENCES users(id) ON DELETE SET NULL;
```

### Wallet (không thay đổi schema)
Collaborator tái dụng bảng `wallets` + `wallet_transactions` hiện có. Mỗi collaborator có 1 row trong `wallets` với `user_id` của họ. Khi hoàn thành chuyến, tạo `WalletTransaction`:
```
type        = 'credit'
description = 'Thu hộ cuốc #<booking_id>'
points      = floor(collection_fee * 0.80 / 1000)
```

---

## Backend

### Routes mới

```php
// Customer — chỉ collaborator
GET  /customer/collaborator/wallet
GET  /customer/collaborator/wallet/transactions

// Admin
PATCH /admin/customers/{user}/collaborator   // toggle is_collaborator
```

### Controllers thay đổi

#### `BookingController::store()`
- Validate thêm: `collection_fee` integer >= 0, nullable
- Chỉ chấp nhận `collection_fee > 0` nếu `auth()->user()->is_collaborator === true`; backend trả 422 nếu không
- Lưu `collaborator_id = auth()->id()` khi `collection_fee > 0`

#### `BookingController::formatBooking()`
- Thêm `collection_fee` vào response array

#### `TripController::formatTrip()` (driver-facing)
- Tính lại `final_price` và `app_fee` dựa trên `total_collected`:
```php
$totalCollected = $b->price - $b->discount + $b->collection_fee;
$appFee         = (int) round($totalCollected * 0.20);
$netEarning     = $totalCollected - $appFee - $b->collection_fee;
```
- Tài xế thấy đúng số tiền họ thu từ khách và số họ thực nhận

#### `TripController::accept()`
- Tính base phí trên `total_collected`:
```php
$totalCollected = $booking->price - $booking->discount + $booking->collection_fee;
$feePoints = (int) round($totalCollected * 0.20 / 1000);
```

#### `TripController::updateStatus()` → `completed`
- Sau khi tạo `WalletTransaction` cho tài xế, kiểm tra:
```php
if ($booking->collection_fee > 0 && $booking->collaborator_id) {
    $collabPoints = (int) floor($booking->collection_fee * 0.80 / 1000);
    $collabWallet = Wallet::firstOrCreate(['user_id' => $booking->collaborator_id]);
    $collabWallet->increment('points', $collabPoints);
    WalletTransaction::create([
        'wallet_id'   => $collabWallet->id,
        'booking_id'  => $booking->id,
        'type'        => 'credit',
        'description' => "Thu hộ cuốc #{$booking->id}",
        'points'      => $collabPoints,
    ]);
}
```

#### `AdminCustomerController` — thêm method
```php
public function toggleCollaborator(User $user): JsonResponse
{
    $user->update(['is_collaborator' => !$user->is_collaborator]);
    return response()->json(['is_collaborator' => $user->is_collaborator]);
}
```

### Controller mới: `Customer/CollaboratorWalletController`

```
show()         GET /customer/collaborator/wallet
               → { points, total_earned, transactions_count }
               → 403 nếu user không phải collaborator

transactions() GET /customer/collaborator/wallet/transactions
               → paginated WalletTransactions (filter: type=credit, source=collection_fee)
```

---

## Frontend

### `types.d.ts`
```ts
namespace App {
  interface User {
    // ... existing
    is_collaborator: boolean
  }

  interface Booking {
    // ... existing
    collection_fee: number
  }
}
```

### `BookingFormPage`
Thêm field **Thu Hộ** (chỉ hiển thị khi `user.is_collaborator === true`):
- Optional numeric input, default 0, đơn vị VNĐ
- Vị trí: sau field "Ghi chú", trước nút Đặt xe
- Label: "Thu Hộ (tuỳ chọn)" + helper text "Số tiền thu hộ từ khách"
- Không hiển thị với khách hàng thông thường

### `ProfilePage` (customer)
Thêm section **Ví Cộng Tác Viên** (chỉ khi `user.is_collaborator`):
```
┌─────────────────────────────────┐
│ Ví Cộng Tác Viên                │
│                                 │
│ Số dư:  1,240 điểm              │
│         ~ 1,240,000đ            │
│                                 │
│ [Xem lịch sử thu hộ →]          │
│ * Rút tiền liên hệ kế toán      │
└─────────────────────────────────┘
```

### `CollaboratorWalletPage` — trang mới
Route: `/customer/collaborator/wallet`  
Hiển thị lịch sử giao dịch thu hộ (danh sách `WalletTransaction` type credit từ thu hộ), số dư hiện tại.

### Admin `CustomersPage`
- Badge "CTV" màu `primary` bên cạnh tên nếu `is_collaborator === true`
- Nút "Kích hoạt CTV" / "Huỷ CTV" trong menu hành động → gọi `PATCH /admin/customers/{user}/collaborator`

### `src/api/collaborator.ts` — module mới
```ts
export const getCollaboratorWallet = () =>
  api.get<{ points: number; total_earned: number }>('/customer/collaborator/wallet')

export const getCollaboratorTransactions = (page = 1) =>
  api.get('/customer/collaborator/wallet/transactions', { params: { page } })
```

---

## Files cần thay đổi

| File | Thay đổi |
|---|---|
| `database/migrations/[ts]_add_is_collaborator_to_users.php` | Tạo mới |
| `database/migrations/[ts]_add_collection_fee_to_bookings.php` | Tạo mới |
| `app/Models/User.php` | Thêm `is_collaborator` vào `$fillable` |
| `app/Models/Booking.php` | Thêm `collection_fee`, `collaborator_id` vào `$fillable` |
| `app/Http/Controllers/Customer/BookingController.php` | Nhận `collection_fee`, validate collaborator |
| `app/Http/Controllers/Driver/TripController.php` | Fee calc + credit collaborator wallet |
| `app/Http/Controllers/Customer/CollaboratorWalletController.php` | Tạo mới |
| `app/Http/Controllers/Admin/AdminCustomerController.php` | Thêm `toggleCollaborator()` |
| `routes/api.php` | 3 routes mới |
| `frontend/src/types.d.ts` | Thêm `is_collaborator`, `collection_fee` |
| `frontend/src/api/collaborator.ts` | Tạo mới |
| `frontend/src/pages/customer/BookingFormPage.tsx` | Field Thu Hộ |
| `frontend/src/pages/customer/ProfilePage.tsx` | Section Ví CTV |
| `frontend/src/pages/customer/CollaboratorWalletPage.tsx` | Tạo mới |
| `frontend/src/pages/admin/CustomersPage.tsx` | Badge + toggle CTV |
| `frontend/src/router/index.tsx` | Route mới `/customer/collaborator/wallet` |

---

## Không nằm trong scope (MVP)

- Flow rút tiền trong app (kế toán xử lý ngoài hệ thống)
- Báo cáo thuế TNCN
- Collaborator dashboard riêng
- Nhiều collaborator trên một cuốc
