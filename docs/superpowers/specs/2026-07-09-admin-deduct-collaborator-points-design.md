# Design: Admin trừ / xóa điểm Cộng Tác Viên

**Date:** 2026-07-09
**Status:** Approved
**Scope:** Cho phép Admin trừ một phần hoặc xóa toàn bộ điểm trong ví của Cộng Tác Viên (CTV — xem [[2026-07-01-collaborator-collection-fee-design]])

---

## Bối cảnh

CTV được cộng điểm tự động (80% `collection_fee`) mỗi khi một cuốc "Thu hộ" hoàn thành (`Customer/CollaboratorWalletController`). Hiện không có cách nào để Admin điều chỉnh giảm điểm — ví dụ khi CTV đã được thanh toán offline, có sai sót nghiệp vụ, hoặc bị xử lý vi phạm. Trang Admin `CustomersPage` hiện chỉ có nút bật/tắt vai trò CTV, không hiển thị điểm và không có hành động trừ điểm.

Tính năng tương tự cho tài xế (`AdminWalletController::topup`) chỉ hỗ trợ **cộng** điểm — không đổi, không nằm trong scope này.

---

## Nghiệp vụ

- Áp dụng cho user có `is_collaborator = true`. Nếu không phải CTV, API trả 422.
- Hai hành động độc lập:
  - **Trừ điểm**: Admin nhập số điểm tùy ý (≤ số dư hiện có) + lý do bắt buộc.
  - **Xóa điểm về 0**: Trừ toàn bộ số dư hiện có, không cần nhập số điểm, chỉ cần lý do bắt buộc.
- Mỗi hành động tạo một `WalletTransaction` (`type=debit`) để giữ lịch sử đầy đủ, nhất quán với cách ví hiện đang hoạt động (không có cột số dư tách rời — số dư luôn là tổng cộng dồn các giao dịch).
- **Minh bạch với CTV**: giao dịch trừ điểm của Admin hiển thị trong lịch sử ví của chính CTV đó (trang `CollaboratorWalletPage`), không ẩn.
- `wallets.points` là `unsigned int` → không được phép âm. Validate chặn trừ vượt số dư.

---

## Backend

### `AdminWalletController` — thêm 2 method

```php
public function deductPoints(Request $request, User $user): JsonResponse
{
    $request->validate([
        'points' => 'required|integer|min:1',
        'reason' => 'required|string|max:255',
    ]);

    if (! $user->is_collaborator) {
        return response()->json(['message' => 'Chỉ có thể trừ điểm của Cộng tác viên.'], 422);
    }

    $wallet = Wallet::firstOrCreate(['user_id' => $user->id], ['points' => 0]);
    $points = $request->integer('points');

    if ($points > $wallet->points) {
        return response()->json(['message' => 'Số điểm trừ vượt quá số dư hiện có.'], 422);
    }

    DB::transaction(function () use ($wallet, $points, $request) {
        WalletTransaction::create([
            'wallet_id'   => $wallet->id,
            'booking_id'  => null,
            'type'        => 'debit',
            'description' => 'Admin trừ điểm: ' . $request->input('reason'),
            'points'      => $points,
        ]);
        $wallet->decrement('points', $points);
    });

    return response()->json([
        'message'     => 'Đã trừ điểm.',
        'new_balance' => Wallet::where('user_id', $user->id)->value('points'),
    ]);
}

public function resetPoints(Request $request, User $user): JsonResponse
{
    $request->validate(['reason' => 'required|string|max:255']);

    if (! $user->is_collaborator) {
        return response()->json(['message' => 'Chỉ có thể xóa điểm của Cộng tác viên.'], 422);
    }

    $wallet = Wallet::firstOrCreate(['user_id' => $user->id], ['points' => 0]);

    if ($wallet->points <= 0) {
        return response()->json(['message' => 'Số dư đã là 0.', 'new_balance' => 0]);
    }

    DB::transaction(function () use ($wallet, $request) {
        WalletTransaction::create([
            'wallet_id'   => $wallet->id,
            'booking_id'  => null,
            'type'        => 'debit',
            'description' => 'Admin xóa toàn bộ điểm: ' . $request->input('reason'),
            'points'      => $wallet->points,
        ]);
        $wallet->update(['points' => 0]);
    });

    return response()->json(['message' => 'Đã xóa toàn bộ điểm.', 'new_balance' => 0]);
}
```

### Routes (`routes/api.php`, trong nhóm `role:admin`, cạnh dòng topup)

```php
Route::post('/admin/customers/{user}/deduct-points', [AdminWalletController::class, 'deductPoints']);
Route::post('/admin/customers/{user}/reset-points',  [AdminWalletController::class, 'resetPoints']);
```

### `Admin/CustomerController::index()`

Thêm field `points` vào response — lấy từ `Wallet` của user, `null` nếu không phải CTV:

```php
'points' => $u->is_collaborator ? (Wallet::where('user_id', $u->id)->value('points') ?? 0) : null,
```

### `Customer/CollaboratorWalletController::transactions()`

Nới lỏng filter để bao gồm cả giao dịch trừ điểm do Admin tạo, giữ nguyên phần "Thu hộ cuốc":

```php
$transactions = WalletTransaction::where('wallet_id', $wallet->id)
    ->where(function ($q) {
        $q->where(fn ($q2) => $q2->where('type', 'credit')->where('description', 'like', 'Thu hộ cuốc%'))
          ->orWhere(fn ($q2) => $q2->where('type', 'debit')->where('description', 'like', 'Admin %'));
    })
    ->latest()
    ->get()
    ->map(/* ... như cũ ... */);
```

`show()` không cần đổi — `points` đã trả trực tiếp `wallet.points`, tự động phản ánh số dư sau khi trừ. `total_earned` (tổng đã kiếm từ thu hộ) cũng giữ nguyên logic cũ, không bị ảnh hưởng bởi việc trừ điểm.

---

## Frontend

### `types.d.ts`

```ts
interface AdminCustomer {
  // ... existing
  points: number | null   // null nếu không phải CTV
}
```

### `src/api/admin.ts`

```ts
export const deductCollaboratorPoints = (id: number, data: { points: number; reason: string }) =>
  api.post<{ new_balance: number }>(`/admin/customers/${id}/deduct-points`, data)

export const resetCollaboratorPoints = (id: number, data: { reason: string }) =>
  api.post<{ new_balance: number }>(`/admin/customers/${id}/reset-points`, data)
```

### `CustomersPage.tsx`

- Trong stats-row của sheet chi tiết: thêm ô "Điểm CTV" hiển thị `historyTarget.points` khi `is_collaborator === true` (chỉ hiện ô này khi là CTV).
- Cạnh nút "Huỷ CTV" / "Kích hoạt CTV": khi `is_collaborator === true` và `points > 0`, thêm 2 nút:
  - **"Trừ điểm"** → mở modal (theo pattern modal "Nạp điểm" của `DriversPage`): input số điểm (`max = points hiện tại`) + input lý do (bắt buộc), nút Lưu disabled nếu thiếu 1 trong 2.
  - **"Xóa điểm về 0"** → modal xác nhận đơn giản: hiển thị số điểm sẽ mất + input lý do (bắt buộc), nút xác nhận màu `danger-red`.
- Cả 2 nút ẩn/disabled khi `points` là `0` hoặc `null`.
- Sau khi trừ/xóa thành công: invalidate `['admin-customers']`, cập nhật `historyTarget.points` từ `new_balance`, toast thành công.

---

## Files cần thay đổi

| File | Thay đổi |
|---|---|
| `backend/app/Http/Controllers/Admin/AdminWalletController.php` | Thêm `deductPoints()`, `resetPoints()` |
| `backend/app/Http/Controllers/Admin/CustomerController.php` | `index()` thêm field `points` |
| `backend/app/Http/Controllers/Customer/CollaboratorWalletController.php` | Nới lỏng filter trong `transactions()` |
| `backend/routes/api.php` | 2 routes mới |
| `frontend/src/types.d.ts` | `AdminCustomer.points` |
| `frontend/src/api/admin.ts` | `deductCollaboratorPoints`, `resetCollaboratorPoints` |
| `frontend/src/pages/admin/CustomersPage.tsx` | Hiển thị điểm + 2 modal hành động |

---

## Không nằm trong scope

- Trừ/xóa điểm cho ví tài xế (chỉ áp dụng CTV theo yêu cầu).
- Giới hạn số lần / rate-limit hành động trừ điểm của Admin.
- Thông báo (notification) cho CTV khi bị trừ điểm — chỉ hiện trong lịch sử ví, không push notify (khác với `DriverTopUpCompletedNotification` của luồng nạp điểm tài xế).
