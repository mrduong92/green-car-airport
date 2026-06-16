# Chính sách Khoá Tài Khoản (Block/Unblock)

## Tổng quan

Admin có quyền khoá tài khoản tài xế hoặc khách hàng vi phạm. Tài khoản bị khoá không thể đăng nhập. Admin có thể bỏ chặn bất kỳ lúc nào.

---

## Trạng thái đã implement

### Tài xế

| Hành động | Cơ chế | Trạng thái |
|---|---|---|
| Block | `driver_profiles.status = 'blocked'`, lưu `blocked_reason` | ✅ |
| Unblock | `driver_profiles.status = 'active'`, xoá `blocked_reason` | ✅ |
| Chặn đăng nhập | `AuthController::login()` kiểm tra `driverProfile.status === 'blocked'` → 403 | ✅ |
| Hiển thị lý do | Response 403 kèm theo `blocked_reason` nếu có | ✅ |

### Khách hàng

| Hành động | Cơ chế | Trạng thái |
|---|---|---|
| Block | `users.is_blocked = true`, xoá toàn bộ token | ✅ |
| Unblock | `users.is_blocked = false` | ✅ |
| Chặn đăng nhập | `AuthController::login()` kiểm tra `is_blocked` → 403 | ✅ |

---

## Schema

### Tài xế — `driver_profiles`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `status` | `enum('pending','active','blocked')` | Đã có từ đầu |
| `blocked_reason` | `string` nullable | Lý do admin nhập khi block |

### Khách hàng — `users`

| Cột | Kiểu | Migration |
|---|---|---|
| `is_blocked` | `boolean` default `false` | `2026_06_16_000001_add_is_blocked_to_users_table` |

> Hai model dùng cơ chế khác nhau: tài xế dùng enum `status` trên `driver_profiles` (vì còn có `pending`), khách hàng dùng boolean `is_blocked` trực tiếp trên `users`.

---

## API Endpoints

| Method | Route | Mô tả | Body |
|---|---|---|---|
| `PATCH` | `/admin/drivers/{user}/block` | Block tài xế | `{ reason?: string }` |
| `PATCH` | `/admin/drivers/{user}/unblock` | Bỏ chặn tài xế | — |
| `PATCH` | `/admin/customers/{user}/block` | Block khách hàng | — |
| `PATCH` | `/admin/customers/{user}/unblock` | Bỏ chặn khách hàng | — |

**Response 403 khi đăng nhập tài khoản bị khoá:**
```json
{ "message": "Tài khoản đã bị khoá bởi admin.", "code": "blocked" }
```
Tài xế có thể kèm lý do: `"Tài khoản bị khoá: <blocked_reason>"`.

---

## Luồng Admin UI

```
Trang Drivers / Customers
    ↓
Card tài xế/khách có trạng thái active/pending
    → Nút "Block" (đỏ) → Modal nhập lý do (chỉ tài xế) → Confirm
    → PATCH .../block

Card đang ở trạng thái blocked
    → Badge "Đã chặn", nút "Bỏ chặn" (xanh lá)
    → Click trực tiếp, không cần confirm
    → PATCH .../unblock
```

---

## Hành vi phụ khi block

| Đối tượng | Hành vi | Trạng thái |
|---|---|---|
| Block khách | Xoá toàn bộ Sanctum token → force logout ngay | ✅ |
| Block tài xế | Token **không** bị xoá — tài xế vẫn online cho đến khi token hết hạn hoặc tự logout | ⚠️ Chưa xử lý |

---

## Chưa implement (để sau)

| Tính năng | Ghi chú |
|---|---|
| Block tài xế → xoá token ngay | Giống customer — thêm `$user->tokens()->delete()` vào `DriverController::block()` |
| Block tài xế → trip đang nhận bị trả về `finding_driver` | Cần reassign trip trong `block()` |
| Block khách → booking đang `finding_driver` bị huỷ | Cần cancel booking trong `block()` |
| Chặn OTP với SĐT đã bị block | `OtpController::send()` check `is_blocked` / `driver status` → 403 |
| Chặn đăng ký lại bằng biển số xe đã block | `ProfileController::update()` check biển số thuộc tài xế bị block |
| Enforce tất cả API call (không chỉ login) | Hiện chỉ chặn ở login. Cần check trong `EnsureRole` middleware hoặc thêm middleware riêng. |

---

## Files liên quan

| File | Vai trò |
|---|---|
| `backend/app/Http/Controllers/Auth/AuthController.php` | Login check — block customer + driver |
| `backend/app/Http/Controllers/Admin/DriverController.php` | `block()`, `unblock()` |
| `backend/app/Http/Controllers/Admin/CustomerController.php` | `block()`, `unblock()` |
| `backend/routes/api.php` | 4 routes block/unblock |
| `backend/database/migrations/2026_06_16_000001_add_is_blocked_to_users_table.php` | Cột `is_blocked` cho customers |
| `frontend/src/api/admin.ts` | `blockDriver`, `unblockDriver`, `blockCustomer`, `unblockCustomer` |
| `frontend/src/pages/admin/DriversPage.tsx` | UI block modal + nút "Bỏ chặn" |
| `frontend/src/pages/admin/CustomersPage.tsx` | Badge "Đã chặn" + nút "Chặn/Bỏ chặn" trong history sheet |
