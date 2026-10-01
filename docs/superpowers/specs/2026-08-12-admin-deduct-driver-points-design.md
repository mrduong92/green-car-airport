# Design: Admin trừ điểm Tài xế

**Date:** 2026-08-12
**Status:** Approved
**Scope:** Cho phép Admin trừ một phần điểm trong ví của Tài xế, dùng chung endpoint và logic đã có với CTV (xem [[2026-07-09-admin-deduct-collaborator-points-design]]), nhưng phân quyền qua Laravel Policy thay vì `if` trong controller.

---

## Bối cảnh

Tính năng trừ điểm (`AdminWalletController::deductPoints`) đã được làm cho CTV (commit `193df4d`), nhưng bị chặn cứng bằng `if (! $user->is_collaborator)`. Admin không có cách nào trừ điểm của Tài xế — chỉ có "Nạp điểm" (`topupDriver`). Yêu cầu lần này: mở endpoint đó cho cả Tài xế, và chuyển việc kiểm tra "user này có được trừ điểm không" ra khỏi controller, sang Laravel Policy để tách rõ authorization logic khỏi business logic.

`resetPoints()` ("Xóa điểm về 0") **không** đổi — theo quyết định, driver chỉ có "Trừ điểm", không có "Xóa về 0" (rủi ro cao hơn CTV vì điểm tài xế gắn với khả năng nhận cuốc — xem `d3f473a`: driver bị chặn nhận cuốc mới nếu số dư dưới ngưỡng phí app; trừ điểm có thể đẩy driver vào trạng thái đó ngay lập tức, đây là hành vi admin chủ động mong muốn, không cần xử lý gì thêm).

---

## Nghiệp vụ

- `deductPoints` áp dụng cho user có `is_collaborator = true` **hoặc** `role = 'driver'`. User khác (customer thường) → từ chối.
- Việc từ chối được quyết định bởi Policy, trả **403** kèm message tiếng Việt (không phải 422 tự viết như trước).
- Số điểm trừ vẫn phải ≤ số dư hiện có (422 nếu vượt) — không đổi.
- Mỗi lần trừ tạo 1 `WalletTransaction` (`type=debit`), giữ nguyên format hiện có.
- Không thêm chức năng "Xóa về 0" cho driver trong scope này.

---

## Backend

### `app/Policies/UserPolicy.php` (mới)

Laravel 13 auto-discover policy theo convention `App\Models\User` → `App\Policies\UserPolicy`, không cần đăng ký thủ công trong provider.

```php
<?php

namespace App\Policies;

use App\Models\User;
use Illuminate\Auth\Access\Response;

class UserPolicy
{
    public function deductPoints(User $admin, User $target): Response
    {
        return $target->is_collaborator || $target->role === 'driver'
            ? Response::allow()
            : Response::deny('Chỉ có thể trừ điểm của Cộng tác viên hoặc Tài xế.');
    }
}
```

### `AdminWalletController::deductPoints()`

Thêm trait `Illuminate\Foundation\Auth\Access\AuthorizesRequests` (controller base hiện chưa có trait này, thêm trực tiếp vào `AdminWalletController`). Thay đoạn check cũ:

```php
// trước
if (! $user->is_collaborator) {
    return response()->json(['message' => 'Chỉ có thể trừ điểm của Cộng tác viên.'], 422);
}

// sau
$this->authorize('deductPoints', $user);
```

`AuthorizationException` do `authorize()` throw được Laravel tự convert thành response **403** với message lấy từ `Response::deny(...)` — không cần custom exception handling.

`resetPoints()` giữ nguyên logic `is_collaborator` cũ, không dùng Policy (ngoài scope).

### Routes

Không đổi — route hiện tại `POST /api/admin/customers/{user}/deduct-points` đã generic theo `{user}`, dùng lại được cho driver, không cần route mới.

---

## Frontend

### `src/api/admin.ts`

Thêm hàm riêng để gọi từ `DriversPage` (cùng endpoint, đặt tên theo ngữ cảnh gọi, không tạo API trùng lặp):

```ts
export const deductDriverPoints = (id: number, data: { points: number; reason: string }) =>
  api.post<{ message: string; new_balance: number }>(`/admin/customers/${id}/deduct-points`, data)
```

### `pages/admin/DriversPage.tsx`

- State mới: `deductTarget`, `deductPoints`, `deductReason` (theo pattern `topupTarget`/`topupPoints`/`topupDesc` đã có trong file).
- Nút "Trừ điểm" (`danger-red`) trong khối action buttons, cạnh nút "Nạp điểm" hiện có — chỉ hiện khi `d.points != null && d.points > 0`.
- Modal "Trừ điểm tài xế" — tái dùng layout/validation của modal `deductTarget` trong `CustomersPage.tsx`: input số điểm (`max = d.points`) + textarea lý do bắt buộc, nút Lưu disabled khi thiếu 1 trong 2 hoặc vượt số dư.
- `deductMutation`: gọi `deductDriverPoints`, `onSuccess` → toast "Đã trừ điểm", `invalidateQueries(['drivers'])`, đóng modal.
- `onError`: đọc `err.response?.data?.message` để hiện đúng message tiếng Việt trả về từ Policy (403) hoặc validate (422).

---

## Test

Thêm test case (file `backend/tests/Feature/CollaboratorWalletTest.php` hoặc file mới `DriverWalletDeductTest.php`):

- Trừ điểm tài xế thành công → 200, `new_balance` đúng, có `WalletTransaction` mới.
- Trừ vượt số dư → 422.
- Trừ điểm customer thường (không phải CTV, không phải driver) → **403** với message từ Policy (thay đổi so với 422 cũ — cần sửa lại assertion trong test cũ nếu có test case này).

---

## Files cần thay đổi

| File | Thay đổi |
|---|---|
| `backend/app/Policies/UserPolicy.php` | Mới — method `deductPoints()` |
| `backend/app/Http/Controllers/Admin/AdminWalletController.php` | `deductPoints()` dùng `$this->authorize()`, thêm trait `AuthorizesRequests` |
| `frontend/src/api/admin.ts` | `deductDriverPoints` |
| `frontend/src/pages/admin/DriversPage.tsx` | Nút + modal "Trừ điểm" |
| `backend/tests/Feature/CollaboratorWalletTest.php` (hoặc file test mới) | Test case cho driver + sửa assertion 422→403 nếu cần |

---

## Không nằm trong scope

- "Xóa điểm về 0" cho tài xế — chỉ CTV mới có, không mở rộng lần này.
- Cảnh báo/xác nhận thêm khi trừ điểm khiến driver rơi xuống dưới ngưỡng phí app — hành vi mặc định là cho phép, không chặn.
- Thông báo (push notification) cho tài xế khi bị trừ điểm — chỉ hiện trong lịch sử ví.
