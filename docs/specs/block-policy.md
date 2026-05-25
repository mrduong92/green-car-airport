# Chính sách Khoá Tài Khoản (Block)

## Tổng quan

Admin có quyền khoá tài khoản khách hàng hoặc tài xế vi phạm. Tài khoản bị khoá sẽ mất toàn bộ quyền truy cập dịch vụ, điểm ví bị đóng băng, và không thể đăng ký lại bằng số điện thoại hoặc biển số xe đã bị khoá.

---

## Trạng thái hiện tại

| Yêu cầu | Trạng thái |
|---|---|
| Admin block/unblock driver | ⚠️ Chỉ có block, thiếu enforcement & unblock |
| Admin block/unblock customer | ❌ Chưa có |
| Lưu lý do block | ❌ Backend nhận `reason` nhưng không lưu |
| Tài khoản bị khoá không dùng được API | ❌ Chưa enforce |
| Điểm ví bị đóng băng | ❌ Chưa có |
| Không đăng ký lại bằng SĐT đã block | ❌ Chưa có |
| Không đăng ký lại bằng biển số xe đã block | ❌ Chưa có |

---

## Hệ quả khi bị khoá

### Với mọi tài khoản bị block

- Toàn bộ API call (trừ OTP) trả về `403 ACCOUNT_BLOCKED`
- Ví điểm bị đóng băng (không xem, không giao dịch được)
- Không gửi/xác thực OTP được bằng SĐT đã bị block

### Với tài xế bị block

- `driver_profiles.status` → `'blocked'`; `is_online` → `false`
- Trip đang ở `accepted` / `picking_up` → trả về `finding_driver` (tách khỏi tài xế)

### Với khách hàng bị block

- Booking đang ở `pending` / `finding_driver` → tự động `cancelled` (cancelled_by = system)

---

## Ngăn đăng ký lại

| Phương thức | Cách ngăn |
|---|---|
| Đăng ký SĐT đã bị block | `OtpController::send()` + `verify()` check `users.status = 'blocked'` → 403 |
| Dùng biển số xe đã bị block | `ProfileController::update()` check `driver_profiles.vehicle_plate` thuộc user đã block → 422 |

---

## Schema (`users` table — migration mới)

| Cột | Kiểu | Mô tả |
|---|---|---|
| `status` | `enum('active','blocked')` default `active` | Trạng thái tài khoản |
| `blocked_reason` | `string` nullable | Lý do khoá (admin nhập) |
| `blocked_at` | `timestamp` nullable | Thời điểm bị khoá |

> `driver_profiles.status` giữ nguyên để quản lý trạng thái `pending`/`active`. Khi block driver: sync cả `users.status` và `driver_profiles.status`. Khi unblock: cả hai về `active`.

---

## API Endpoints

| Method | Route | Mô tả |
|---|---|---|
| `PATCH` | `/admin/drivers/{user}/block` | Block tài xế (hiện có, cần hoàn thiện) |
| `PATCH` | `/admin/drivers/{user}/unblock` | Mở khoá tài xế (mới) |
| `PATCH` | `/admin/customers/{user}/block` | Block khách hàng (mới) |
| `PATCH` | `/admin/customers/{user}/unblock` | Mở khoá khách hàng (mới) |

**Request body (block):**
```json
{ "reason": "Vi phạm điều khoản sử dụng" }
```

**Response 403 khi tài khoản bị khoá (tất cả API):**
```json
{ "message": "Tài khoản của bạn đã bị khoá.", "code": "ACCOUNT_BLOCKED" }
```

---

## Enforcement

Block được thực thi tại **`EnsureRole` middleware** — áp dụng cho toàn bộ routes yêu cầu auth (role:customer, role:driver, role:admin). Không cần thêm logic ở từng controller.

Frontend intercept `403 ACCOUNT_BLOCKED` tại `axios.ts` → tự động logout → redirect `/login`.

---

## Luồng block/unblock (Admin UI)

```
Admin mở trang Drivers / Customers
    ↓
Click "Khoá" → modal nhập lý do → confirm
    ↓
PATCH /admin/.../block  → backend set users.status = 'blocked' + side effects
    ↓
Row hiển thị badge "Blocked" + nút "Mở khoá"
    ↓
Click "Mở khoá" → ConfirmDialog
    ↓
PATCH /admin/.../unblock → backend set users.status = 'active', xoá reason/at
    ↓
Row về trạng thái normal
```

---

## Files cần thay đổi (khi implement)

| File | Loại thay đổi |
|---|---|
| `database/migrations/[ts]_add_block_fields_to_users.php` | Tạo mới |
| `app/Models/User.php` | Thêm fillable: status, blocked_reason, blocked_at |
| `app/Http/Middleware/EnsureRole.php` | Thêm check `status === 'blocked'` → 403 |
| `app/Http/Controllers/Auth/OtpController.php` | Chặn SĐT bị block ở send() + verify() |
| `app/Http/Controllers/Admin/DriverController.php` | Hoàn thiện block(), thêm unblock() |
| `app/Http/Controllers/Admin/CustomerController.php` | Thêm block(), unblock() |
| `app/Http/Controllers/Driver/ProfileController.php` | Validate biển số không bị block |
| `routes/api.php` | 3 routes mới |
| `frontend/src/types.d.ts` | Thêm status, blocked_reason vào AdminCustomer + DriverProfile |
| `frontend/src/api/admin.ts` | Thêm unblockDriver, blockCustomer, unblockCustomer |
| `frontend/src/pages/admin/DriversPage.tsx` | Unblock button + hiển thị lý do |
| `frontend/src/pages/admin/CustomersPage.tsx` | Block/unblock UI + status badge |
| `frontend/src/api/axios.ts` | Intercept ACCOUNT_BLOCKED → auto logout |
