# Chính sách Affiliate / Giới thiệu Khách Hàng

## Tổng quan

Khách hàng giới thiệu bạn bè đăng ký và hoàn thành chuyến đầu tiên → người giới thiệu nhận voucher 50k tự động. Tài xế không tham gia hệ thống này.

---

## Mã giới thiệu

**Mã giới thiệu = Số điện thoại của khách hàng.**

| | Dùng SĐT | Dùng mã riêng (VD: `REF_ABC123`) |
|---|---|---|
| Nhớ dễ | ✅ | ❌ Phải tra |
| Riêng tư | ⚠️ Lộ SĐT khi chia sẻ | ✅ An toàn |
| Implement | ✅ Không cần sinh mã | Cần thêm cột + logic generate |

→ Dùng SĐT. Trong bối cảnh app taxi Việt Nam, SĐT thường được chia sẻ thoải mái.

---

## Luồng hoạt động

```
Khách A chia sẻ SĐT (vd: 0901234567) cho bạn bè
    ↓
Khách B đăng ký → nhập mã giới thiệu 0901234567 ở màn hình OTP
    ↓
OtpController::verify() ghi nhận referral: referred_by = A.id
    ↓
Khách B đặt & hoàn thành chuyến ĐẦU TIÊN
    ↓
TripController::updateStatus() → completed → kiểm tra referral
    ↓
Tạo voucher cá nhân 50k cho Khách A (user_id = A.id, limit = 1, 30 ngày)
    ↓
Khách A mở app → thấy voucher REF_XXXXXXXX trong "Voucher của tôi"
```

---

## Quy tắc chi tiết

- Mỗi user chỉ được giới thiệu bởi **1 người** (unique referee_id trong referrals)
- Reward chỉ trao **1 lần** khi referee hoàn thành chuyến đầu tiên (completedCount === 1)
- Nếu `referral_code` không hợp lệ (SĐT không tồn tại, không phải customer) → bỏ qua, user vẫn tạo bình thường
- Không thể tự giới thiệu bản thân
- Voucher reward có `target='specific'`, `user_id = referrer_id` → chỉ người được thưởng mới thấy và dùng được

---

## Schema cần thêm

### `users` table
| Cột | Kiểu | Mô tả |
|---|---|---|
| `referred_by` | `unsignedBigInteger` nullable FK → users.id | ID của người giới thiệu |

### `referrals` table (bảng mới)
| Cột | Kiểu | Mô tả |
|---|---|---|
| `referrer_id` | FK → users.id | Người giới thiệu (Khách A) |
| `referee_id` | FK → users.id, unique | Người được giới thiệu (Khách B) |
| `status` | `enum('pending','rewarded')` | Trạng thái |
| `rewarded_at` | timestamp nullable | Thời điểm trao thưởng |

### `vouchers` table
| Cột | Kiểu | Mô tả |
|---|---|---|
| `user_id` | `unsignedBigInteger` nullable FK → users.id | Voucher cá nhân cho 1 user |

> Voucher `target='specific'` + `user_id` = voucher chỉ dùng được bởi user đó. `VoucherController::index()` cần filter thêm `OR (target='specific' AND user_id = me)`.

---

## API

| Method | Route | Mô tả |
|---|---|---|
| `POST` | `/api/auth/otp/verify` | Thêm optional `referral_code` param |
| `GET` | `/api/customer/referral-stats` | Stats: tổng giới thiệu + đã rewarded |

**Response `/referral-stats`:**
```json
{ "total": 3, "rewarded": 2 }
```

---

## Reward logic (trong `TripController::updateStatus()`)

```php
// Khi booking → completed:
private function maybeRewardReferral(int $customerId): void
{
    $completedCount = Booking::where('customer_id', $customerId)
        ->where('status', 'completed')->count();
    if ($completedCount !== 1) return;  // chỉ chuyến đầu tiên

    $referral = Referral::where('referee_id', $customerId)
        ->where('status', 'pending')->first();
    if (!$referral) return;

    Voucher::create([
        'code'        => 'REF_' . strtoupper(Str::random(8)),
        'type'        => 'fixed',
        'value'       => 50000,
        'target'      => 'specific',
        'user_id'     => $referral->referrer_id,
        'expires_at'  => now()->addDays(30)->format('Y-m-d'),
        'usage_limit' => 1,
        'usage_count' => 0,
        'is_active'   => true,
    ]);

    $referral->update(['status' => 'rewarded', 'rewarded_at' => now()]);
}
```

---

## UI (Frontend)

### LoginPage — thêm input mã giới thiệu
- Bước nhập OTP: optional input "Mã giới thiệu (nếu có)"
- Gửi kèm `referral_code` trong payload `POST /auth/otp/verify`
- Chỉ có hiệu lực khi user **chưa tồn tại** — backend tự ignore nếu đã có tài khoản

### ProfilePage — section giới thiệu bạn bè
```
┌──────────────────────────────────┐
│ Giới thiệu bạn bè                │
│                                  │
│ Mã của bạn:  [0901234567] [Copy] │
│ Đã giới thiệu: 3 người           │
│ Đã nhận thưởng: 2 voucher 50k    │
└──────────────────────────────────┘
```
- Mã = `user.phone` (từ auth store, không cần API call)
- Stats từ `GET /customer/referral-stats`

---

## Files cần thay đổi (khi implement)

| File | Thay đổi |
|---|---|
| `database/migrations/[ts]_add_referred_by_to_users.php` | Tạo mới |
| `database/migrations/[ts]_create_referrals_table.php` | Tạo mới |
| `database/migrations/[ts]_add_user_id_to_vouchers.php` | Tạo mới |
| `app/Models/User.php` | Thêm `referred_by` fillable + 2 relations |
| `app/Models/Referral.php` | Tạo mới |
| `app/Models/Voucher.php` | Thêm `user_id` fillable |
| `app/Http/Controllers/Auth/OtpController.php` | Ghi nhận referral khi tạo user mới |
| `app/Http/Controllers/Driver/TripController.php` | Gọi `maybeRewardReferral()` khi completed |
| `app/Http/Controllers/Customer/VoucherController.php` | Thêm filter voucher cá nhân |
| `app/Http/Controllers/Customer/ReferralController.php` | Tạo mới: `stats()` |
| `routes/api.php` | `GET /customer/referral-stats` |
| `frontend/src/api/referrals.ts` | Tạo mới |
| `frontend/src/pages/LoginPage.tsx` | Input mã giới thiệu |
| `frontend/src/pages/customer/ProfilePage.tsx` | Section giới thiệu + stats |
