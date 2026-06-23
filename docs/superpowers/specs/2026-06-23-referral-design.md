# Thiết kế Hệ thống Giới thiệu (Referral)

**Ngày:** 2026-06-23  
**Phạm vi:** Tài xế giới thiệu tài xế, Khách hàng giới thiệu khách hàng

---

## Tổng quan

Hai chương trình giới thiệu độc lập:

| Chương trình | Người giới thiệu nhận | Người được giới thiệu nhận | Điều kiện trigger |
|---|---|---|---|
| Tài xế → Tài xế | 100.000 điểm (vào ví) | 100.000 điểm (vào ví) | Tài xế mới được Admin kích hoạt **VÀ** hoàn thành chuyến đầu tiên |
| Khách → Khách | 2 voucher 50k (1 tháng) | 4 voucher 50k (1 tháng) | Khách mới hoàn thành chuyến đầu tiên |

Không giới hạn số lần giới thiệu. Mỗi user chỉ được nhận thưởng 1 lần (là người được giới thiệu).

---

## 1. Data Model

### 1.1 Bảng `users` — thêm 3 cột

```sql
referral_code        VARCHAR(10) UNIQUE NOT NULL   -- sinh tự động, VD: GCA-A1B2C3
referred_by_user_id  BIGINT UNSIGNED NULL FK→users  -- ai đã giới thiệu user này
referral_rewarded_at TIMESTAMP NULL                 -- null = chưa phát thưởng
```

`referral_code` sinh trong `User::booted()` khi creating: tiền tố `GCA-` + 6 ký tự ngẫu nhiên (A-Z0-9), retry nếu trùng.

`referral_rewarded_at` dùng thay vì boolean để có thể audit và chống phát 2 lần an toàn.

### 1.2 Bảng `vouchers` — thêm 1 cột

```sql
user_id  BIGINT UNSIGNED NULL FK→users  -- null = voucher công khai; có giá trị = voucher cá nhân
```

Khi validate voucher tại booking: nếu `user_id IS NOT NULL`, phải khớp `auth()->id()`.

### 1.3 Bảng `wallet_transactions` — mở rộng enum `type`

Thêm giá trị `referral` vào enum `type` (hiện có: `credit`, `debit`, `topup`).  
Dùng để query tổng điểm referral cho thống kê Admin.

---

## 2. Backend

### 2.1 Sinh referral code

```php
// User::booted()
static::creating(function (User $user) {
    do {
        $code = 'GCA-' . strtoupper(Str::random(6));
    } while (User::where('referral_code', $code)->exists());
    $user->referral_code = $code;
});
```

### 2.2 API thay đổi

#### `POST /api/auth/otp/verify`
Thêm param tùy chọn:
```json
{ "phone": "0912345678", "otp": "123456", "referral_code": "GCA-A1B2C3" }
```
Logic thêm vào sau `firstOrCreate`:
- Nếu `$user->wasRecentlyCreated` VÀ `referral_code` hợp lệ (tìm được user, khác chính mình, cùng role)
- Gán `$user->referred_by_user_id = $referrer->id`

#### `GET /api/auth/me`
Thêm vào response:
```json
{ "referral_code": "GCA-A1B2C3", "referral_link": "https://app.example.com/login?ref=GCA-A1B2C3" }
```

#### `GET /api/customer/vouchers` *(mới)*
Trả danh sách voucher cá nhân của customer đang đăng nhập:
```json
[{ "id": 1, "code": "REF-42-X7K2", "value": 50000, "expires_at": "2026-07-23", "is_active": true }]
```
Route: `auth:sanctum` → `role:customer`

### 2.3 `ReferralService`

`app/Services/ReferralService.php`

#### `processDriverReferral(User $driver): void`

```
Guards (return sớm nếu không đủ điều kiện):
  1. $driver->referral_rewarded_at !== null  → đã phát rồi, bỏ qua
  2. $driver->referred_by_user_id === null   → không có người giới thiệu
  3. $driver->driverProfile->trips_count < 1 → chưa hoàn thành chuyến nào
  4. $driver->driverProfile->status !== 'active' → chưa được kích hoạt

Thực hiện (trong DB transaction):
  - Credit 100k điểm cho referrer (wallet + WalletTransaction type=referral)
  - Credit 100k điểm cho $driver    (wallet + WalletTransaction type=referral)
  - $driver->update(['referral_rewarded_at' => now()])
```

#### `processCustomerReferral(User $customer): void`

```
Guards:
  1. $customer->referral_rewarded_at !== null → đã phát rồi
  2. $customer->referred_by_user_id === null  → không có người giới thiệu
  3. bookings completed count !== 1           → không phải chuyến đầu tiên

Thực hiện (trong DB transaction):
  - Tạo 2 voucher 50k gắn referrer->id  (expires_at = now()+1 tháng, code=REF-{id}-{rand4})
  - Tạo 4 voucher 50k gắn customer->id  (expires_at = now()+1 tháng, code=REF-{id}-{rand4})
  - $customer->update(['referral_rewarded_at' => now()])
```

Voucher tạo với: `type=fixed`, `value=50000`, `target=specific`, `usage_limit=1`, `is_active=true`.

### 2.4 Điểm gọi service

| Nơi gọi | Method | Lý do |
|---|---|---|
| `TripController::creditEarning()` | `processDriverReferral($driver)` | Sau khi `trips_count` tăng lên 1 |
| `AdminDriverController::approve()` | `processDriverReferral($driver)` | Khi admin kích hoạt tài xế |
| `TripController::updateStatus()` | `processCustomerReferral($booking->customer)` | Khi `newStatus === 'completed'` |

Gọi ở 2 nơi cho driver là đúng: cần **cả 2 điều kiện** (active + trips_count ≥ 1). Whichever happens last sẽ pass tất cả guards và trigger phần thưởng. Guard `referral_rewarded_at` đảm bảo không phát 2 lần.

---

## 3. Frontend

### 3.1 Luồng referral link

1. User A vào trang Profile/Giới thiệu → thấy link `https://app.example.com/login?ref=GCA-A1B2C3`
2. User A chia sẻ link cho User B
3. User B mở link → `LoginPage` đọc `?ref=GCA-A1B2C3` từ URL → lưu vào `localStorage['referral_code']`
4. User B nhập SĐT → nhận OTP → xác thực → frontend gửi `referral_code` kèm trong body `POST /api/auth/otp/verify`
5. Sau verify thành công → xóa `localStorage['referral_code']`

### 3.2 Thay đổi `LoginPage`

- `useEffect` khi mount: đọc `URLSearchParams('ref')` → lưu localStorage nếu có
- Khi gọi `verifyOtp()`: đọc localStorage, append `referral_code` vào request body nếu tồn tại

### 3.3 UI Tài xế — `ProfilePage` (`/driver/profile`)

Thêm section **"Giới thiệu tài xế"**:
- Hiển thị mã: `GCA-A1B2C3`
- Nút **Sao chép link** (copy to clipboard, toast xác nhận)
- Nút **Chia sẻ** (Web Share API)
- Mô tả: *"Mời tài xế mới — cả hai nhận 100.000 điểm khi họ hoàn thành chuyến đầu tiên"*

### 3.4 UI Khách hàng

**Section giới thiệu** (thêm vào `BookingHistoryPage` hoặc trang Profile nếu có):
- Tương tự driver
- Mô tả: *"Mời bạn bè — họ nhận 4 voucher 50k, bạn nhận 2 voucher 50k sau chuyến đầu tiên của họ"*

**Danh sách voucher cá nhân** trong flow đặt xe (sau bước chọn voucher):
- Gọi `GET /api/customer/vouchers`
- Hiển thị từng voucher: giá trị 50k, ngày hết hạn, nút áp dụng

---

## 4. Admin Dashboard

### 4.1 Thêm 2 thẻ số liệu vào `DashboardPage`

**Thẻ 1: Điểm giới thiệu tài xế đã phát**
```sql
SELECT SUM(points) FROM wallet_transactions WHERE type = 'referral'
-- nhân 1.000 để ra VND khi hiển thị
```

**Thẻ 2: Voucher giới thiệu KH đã phát**
```sql
SELECT COUNT(*) * 50000 FROM vouchers WHERE user_id IS NOT NULL
```

### 4.2 `DashboardController` — thêm 2 field vào response

```php
'driver_referral_points_total'    => WalletTransaction::where('type','referral')->sum('points') * 1000,
'customer_referral_vouchers_total'=> Voucher::whereNotNull('user_id')->count() * 50000,
```

---

## 5. Migration thứ tự

1. `add_referral_fields_to_users` — thêm `referral_code`, `referred_by_user_id`, `referral_rewarded_at`
2. `add_user_id_to_vouchers` — thêm `user_id`
3. `add_referral_to_wallet_transactions_type_enum` — mở rộng enum

---

## 6. Phạm vi không thuộc spec này

- Thông báo push khi nhận thưởng (có thể thêm sau)
- Trang thống kê referral chi tiết (danh sách từng cặp giới thiệu)
- Referral cross-role (tài xế giới thiệu khách hàng hoặc ngược lại)
