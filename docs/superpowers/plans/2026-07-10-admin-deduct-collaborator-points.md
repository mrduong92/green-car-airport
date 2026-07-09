# Admin Deduct/Reset Collaborator Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Admin deduct a custom amount of points, or reset all points to 0, from a Collaborator's (CTV) wallet, with a required reason recorded and visible to the collaborator.

**Architecture:** Two new endpoints on the existing `Admin/AdminWalletController` (which already owns driver top-up) write `debit` `WalletTransaction` rows against the collaborator's existing `Wallet`. `Admin/CustomerController::index` is extended to expose the current point balance so the admin UI can show it. `Customer/CollaboratorWalletController::transactions` filter is loosened so the collaborator sees these admin-initiated debits in their own history. The admin `CustomersPage.tsx` gets a points stat plus two action buttons wired to two new bottom-sheet modals.

**Tech Stack:** Laravel 13 / PHP 8.4 (PHPUnit feature tests, sqlite in-memory), React 19 + TypeScript + TanStack Query, Tailwind CSS.

## Global Constraints

- No new database migrations — reuse existing `wallets` / `wallet_transactions` schema (see [[2026-07-01-collaborator-collection-fee-design]]).
- Action only valid for users with `is_collaborator = true`; non-collaborators get 422.
- `reason` is required (not optional) on both actions.
- Deduct amount must not exceed current wallet balance (`wallets.points` is `unsigned int`, cannot go negative).
- Admin-initiated debit transactions must be visible in the collaborator's own wallet transaction history.
- All UI text is Vietnamese (see project CLAUDE.md).
- Spec: `docs/superpowers/specs/2026-07-09-admin-deduct-collaborator-points-design.md`

---

### Task 1: Backend — Admin deduct/reset collaborator points endpoints

**Files:**
- Modify: `backend/routes/api.php:114`
- Modify: `backend/app/Http/Controllers/Admin/AdminWalletController.php`
- Test: `backend/tests/Feature/CollaboratorWalletTest.php`

**Interfaces:**
- Produces: `POST /api/admin/customers/{user}/deduct-points` body `{ points: int, reason: string }` → `200 { message, new_balance }` or `422 { message }`.
- Produces: `POST /api/admin/customers/{user}/reset-points` body `{ reason: string }` → `200 { message, new_balance }` or `422 { message }`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/Feature/CollaboratorWalletTest.php`, inside the `CollaboratorWalletTest` class (after `test_admin_can_toggle_collaborator`):

```php
    public function test_admin_can_deduct_collaborator_points(): void
    {
        $admin        = User::factory()->create(['role' => 'admin']);
        $collaborator = User::factory()->create(['role' => 'customer', 'is_collaborator' => true]);
        Wallet::create(['user_id' => $collaborator->id, 'points' => 500]);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/customers/{$collaborator->id}/deduct-points", [
                'points' => 200,
                'reason' => 'Đã thanh toán offline',
            ])
            ->assertOk()
            ->assertJsonPath('new_balance', 300);

        $this->assertEquals(300, Wallet::where('user_id', $collaborator->id)->value('points'));
        $this->assertDatabaseHas('wallet_transactions', [
            'type'        => 'debit',
            'points'      => 200,
            'description' => 'Admin trừ điểm: Đã thanh toán offline',
        ]);
    }

    public function test_admin_cannot_deduct_more_than_balance(): void
    {
        $admin        = User::factory()->create(['role' => 'admin']);
        $collaborator = User::factory()->create(['role' => 'customer', 'is_collaborator' => true]);
        Wallet::create(['user_id' => $collaborator->id, 'points' => 100]);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/customers/{$collaborator->id}/deduct-points", [
                'points' => 200,
                'reason' => 'Sai sót',
            ])
            ->assertStatus(422);

        $this->assertEquals(100, Wallet::where('user_id', $collaborator->id)->value('points'));
    }

    public function test_deduct_points_requires_reason(): void
    {
        $admin        = User::factory()->create(['role' => 'admin']);
        $collaborator = User::factory()->create(['role' => 'customer', 'is_collaborator' => true]);
        Wallet::create(['user_id' => $collaborator->id, 'points' => 100]);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/customers/{$collaborator->id}/deduct-points", ['points' => 10])
            ->assertStatus(422);
    }

    public function test_admin_cannot_deduct_points_for_non_collaborator(): void
    {
        $admin    = User::factory()->create(['role' => 'admin']);
        $customer = User::factory()->create(['role' => 'customer', 'is_collaborator' => false]);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/customers/{$customer->id}/deduct-points", [
                'points' => 10,
                'reason' => 'Test',
            ])
            ->assertStatus(422);
    }

    public function test_admin_can_reset_collaborator_points_to_zero(): void
    {
        $admin        = User::factory()->create(['role' => 'admin']);
        $collaborator = User::factory()->create(['role' => 'customer', 'is_collaborator' => true]);
        Wallet::create(['user_id' => $collaborator->id, 'points' => 750]);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/customers/{$collaborator->id}/reset-points", [
                'reason' => 'Vi phạm chính sách',
            ])
            ->assertOk()
            ->assertJsonPath('new_balance', 0);

        $this->assertEquals(0, Wallet::where('user_id', $collaborator->id)->value('points'));
        $this->assertDatabaseHas('wallet_transactions', [
            'type'        => 'debit',
            'points'      => 750,
            'description' => 'Admin xóa toàn bộ điểm: Vi phạm chính sách',
        ]);
    }

    public function test_admin_reset_with_zero_balance_is_noop(): void
    {
        $admin        = User::factory()->create(['role' => 'admin']);
        $collaborator = User::factory()->create(['role' => 'customer', 'is_collaborator' => true]);
        Wallet::create(['user_id' => $collaborator->id, 'points' => 0]);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/customers/{$collaborator->id}/reset-points", [
                'reason' => 'Không cần thiết',
            ])
            ->assertOk()
            ->assertJsonPath('new_balance', 0);

        $this->assertDatabaseMissing('wallet_transactions', [
            'description' => 'Admin xóa toàn bộ điểm: Không cần thiết',
        ]);
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec app php artisan test --filter=CollaboratorWalletTest`
Expected: FAIL — new test methods return 404 (routes don't exist yet).

- [ ] **Step 3: Add the routes**

In `backend/routes/api.php`, immediately after line 114 (`Route::post('/admin/drivers/{user}/topup', ...)`), add:

```php
        Route::post('/admin/customers/{user}/deduct-points', [AdminWalletController::class, 'deductPoints']);
        Route::post('/admin/customers/{user}/reset-points',  [AdminWalletController::class, 'resetPoints']);
```

- [ ] **Step 4: Implement `deductPoints` and `resetPoints`**

In `backend/app/Http/Controllers/Admin/AdminWalletController.php`, add these two public methods inside the `AdminWalletController` class, after the existing `topup` method (before the class's closing `}`):

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

- [ ] **Step 5: Run tests to verify they pass**

Run: `docker compose exec app php artisan test --filter=CollaboratorWalletTest`
Expected: PASS — all tests in the file green (existing 3 + new 6).

- [ ] **Step 6: Commit**

```bash
git add backend/routes/api.php backend/app/Http/Controllers/Admin/AdminWalletController.php backend/tests/Feature/CollaboratorWalletTest.php
git commit -m "feat: admin can deduct or reset collaborator wallet points"
```

---

### Task 2: Backend — expose collaborator points in `Admin/CustomerController::index`

**Files:**
- Modify: `backend/app/Http/Controllers/Admin/CustomerController.php`
- Test: `backend/tests/Feature/CollaboratorWalletTest.php`

**Interfaces:**
- Consumes: `Wallet` model (`user_id`, `points`) from Task 1.
- Produces: `GET /api/admin/customers` response items now include `points: number | null` (int for collaborators, `null` otherwise).

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/Feature/CollaboratorWalletTest.php`:

```php
    public function test_customer_index_shows_points_for_collaborator_and_null_otherwise(): void
    {
        $admin        = User::factory()->create(['role' => 'admin']);
        $collaborator = User::factory()->create(['role' => 'customer', 'is_collaborator' => true]);
        Wallet::create(['user_id' => $collaborator->id, 'points' => 320]);
        $plainCustomer = User::factory()->create(['role' => 'customer', 'is_collaborator' => false]);

        $response = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/admin/customers')
            ->assertOk();

        $data = collect($response->json());
        $this->assertEquals(320, $data->firstWhere('id', $collaborator->id)['points']);
        $this->assertNull($data->firstWhere('id', $plainCustomer->id)['points']);
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec app php artisan test --filter=test_customer_index_shows_points_for_collaborator_and_null_otherwise`
Expected: FAIL — response items have no `points` key, so `assertEquals(320, null)` fails.

- [ ] **Step 3: Implement**

In `backend/app/Http/Controllers/Admin/CustomerController.php`, add the `Wallet` import after the existing `use App\Models\User;` (line 6):

```php
use App\Models\Wallet;
```

Replace the `index()` method body (lines 12-37):

```php
    public function index(Request $request): JsonResponse
    {
        $query = User::with('bookingsAsCustomer')->where('role', 'customer');

        if ($request->search) {
            $s = '%' . $request->search . '%';
            $query->where(fn ($q) => $q
                ->where('name', 'like', $s)
                ->orWhere('phone', 'like', $s)
            );
        }

        $customers = $query->latest()->get();

        $walletPoints = Wallet::whereIn('user_id', $customers->where('is_collaborator', true)->pluck('id'))
            ->pluck('points', 'user_id');

        $result = $customers->map(fn ($u) => [
            'id'                 => $u->id,
            'name'               => $u->name,
            'phone'              => $u->phone,
            'is_blocked'         => (bool) $u->is_blocked,
            'is_collaborator'    => (bool) $u->is_collaborator,
            'points'             => $u->is_collaborator ? (int) ($walletPoints[$u->id] ?? 0) : null,
            'total_bookings'     => $u->bookingsAsCustomer->count(),
            'completed_bookings' => $u->bookingsAsCustomer->where('status', 'completed')->count(),
            'total_spent'        => (int) $u->bookingsAsCustomer->where('status', 'completed')->sum('price'),
            'created_at'         => $u->created_at?->format('d/m/Y'),
        ]);

        return response()->json($result);
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose exec app php artisan test --filter=CollaboratorWalletTest`
Expected: PASS — all tests in the file green.

- [ ] **Step 5: Commit**

```bash
git add backend/app/Http/Controllers/Admin/CustomerController.php backend/tests/Feature/CollaboratorWalletTest.php
git commit -m "feat: expose collaborator wallet points in admin customer list"
```

---

### Task 3: Backend — surface admin point deductions in the collaborator's own transaction history

**Files:**
- Modify: `backend/app/Http/Controllers/Customer/CollaboratorWalletController.php:36-62`
- Test: `backend/tests/Feature/CollaboratorWalletTest.php`

**Interfaces:**
- Consumes: `WalletTransaction` rows with `description` starting `"Admin trừ điểm: "` / `"Admin xóa toàn bộ điểm: "` created in Task 1.
- Produces: `GET /api/customer/collaborator/wallet/transactions` now also includes admin-debit rows, unchanged shape (`id, booking_id, points, description, created_at`).

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/Feature/CollaboratorWalletTest.php`:

```php
    public function test_collaborator_sees_admin_deduction_in_transaction_history(): void
    {
        $collaborator = User::factory()->create(['role' => 'customer', 'is_collaborator' => true]);
        $wallet = Wallet::create(['user_id' => $collaborator->id, 'points' => 300]);
        WalletTransaction::create([
            'wallet_id'   => $wallet->id,
            'booking_id'  => null,
            'type'        => 'credit',
            'description' => 'Thu hộ cuốc #1',
            'points'      => 500,
        ]);
        WalletTransaction::create([
            'wallet_id'   => $wallet->id,
            'booking_id'  => null,
            'type'        => 'debit',
            'description' => 'Admin trừ điểm: Đã thanh toán offline',
            'points'      => 200,
        ]);
        WalletTransaction::create([
            'wallet_id'   => $wallet->id,
            'booking_id'  => null,
            'type'        => 'debit',
            'description' => 'Unrelated system debit',
            'points'      => 50,
        ]);

        $response = $this->actingAs($collaborator, 'sanctum')
            ->getJson('/api/customer/collaborator/wallet/transactions')
            ->assertOk();

        $descriptions = collect($response->json())->pluck('description');
        $this->assertTrue($descriptions->contains('Thu hộ cuốc #1'));
        $this->assertTrue($descriptions->contains('Admin trừ điểm: Đã thanh toán offline'));
        $this->assertFalse($descriptions->contains('Unrelated system debit'));
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec app php artisan test --filter=test_collaborator_sees_admin_deduction_in_transaction_history`
Expected: FAIL — the current filter only returns `type=credit` rows, so the admin-debit description is missing from the response.

- [ ] **Step 3: Implement**

In `backend/app/Http/Controllers/Customer/CollaboratorWalletController.php`, replace the `transactions()` method body (lines 36-62):

```php
    public function transactions(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user->is_collaborator) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $wallet = Wallet::where('user_id', $user->id)->first();
        if (! $wallet) {
            return response()->json([]);
        }

        $transactions = WalletTransaction::where('wallet_id', $wallet->id)
            ->where(function ($q) {
                $q->where(fn ($q2) => $q2->where('type', 'credit')->where('description', 'like', 'Thu hộ cuốc%'))
                  ->orWhere(fn ($q2) => $q2->where('type', 'debit')->where('description', 'like', 'Admin %'));
            })
            ->latest()
            ->get()
            ->map(fn ($t) => [
                'id'          => $t->id,
                'booking_id'  => $t->booking_id,
                'points'      => $t->points,
                'description' => $t->description,
                'created_at'  => $t->created_at?->toISOString(),
            ]);

        return response()->json($transactions);
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose exec app php artisan test --filter=CollaboratorWalletTest`
Expected: PASS — all tests in the file green (now 10 total).

- [ ] **Step 5: Commit**

```bash
git add backend/app/Http/Controllers/Customer/CollaboratorWalletController.php backend/tests/Feature/CollaboratorWalletTest.php
git commit -m "feat: show admin point deductions in collaborator wallet history"
```

---

### Task 4: Frontend — admin UI to view, deduct, and reset collaborator points

**Files:**
- Modify: `frontend/src/types.d.ts:273-283`
- Modify: `frontend/src/api/admin.ts`
- Modify: `frontend/src/pages/admin/CustomersPage.tsx`

**Interfaces:**
- Consumes: `POST /admin/customers/{user}/deduct-points`, `POST /admin/customers/{user}/reset-points` (Task 1), `AdminCustomer.points` (Task 2).
- Produces: `deductCollaboratorPoints(id, { points, reason })`, `resetCollaboratorPoints(id, { reason })` exported from `src/api/admin.ts`, consumed only by `CustomersPage.tsx`.

- [ ] **Step 1: Add `points` to the `AdminCustomer` type**

In `frontend/src/types.d.ts`, replace the `AdminCustomer` interface (lines 273-283):

```ts
  interface AdminCustomer {
    id: number
    name: string
    phone: string
    is_blocked: boolean
    is_collaborator: boolean
    points: number | null
    total_bookings: number
    completed_bookings: number
    total_spent: number
    created_at: string
  }
```

- [ ] **Step 2: Add the two API client functions**

In `frontend/src/api/admin.ts`, after `toggleCollaborator` (end of file, after line 53):

```ts
export const deductCollaboratorPoints = (id: number, data: { points: number; reason: string }) =>
  api.post<{ message: string; new_balance: number }>(`/admin/customers/${id}/deduct-points`, data)

export const resetCollaboratorPoints = (id: number, data: { reason: string }) =>
  api.post<{ message: string; new_balance: number }>(`/admin/customers/${id}/reset-points`, data)
```

- [ ] **Step 3: Wire up state, mutations, and error type in `CustomersPage.tsx`**

Replace the import on line 3:

```ts
import { getCustomers, updateCustomer, getCustomerBookings, blockCustomer, unblockCustomer, toggleCollaborator, deductCollaboratorPoints, resetCollaboratorPoints } from '@/api/admin'
```

After the imports (after line 6, before `const STATUS_LABEL`), add:

```ts
type ApiError = { response?: { data?: { message?: string } } }
```

After the existing state declarations (after line 32, `const [historyTarget, ...]`), add:

```ts
  const [deductTarget, setDeductTarget] = useState<App.AdminCustomer | null>(null)
  const [deductPoints, setDeductPoints] = useState('')
  const [deductReason, setDeductReason] = useState('')
  const [resetTarget, setResetTarget] = useState<App.AdminCustomer | null>(null)
  const [resetReason, setResetReason] = useState('')
```

After the `toggleCollaboratorMutation` block (after line 84), add:

```ts
  const deductMutation = useMutation({
    mutationFn: () => deductCollaboratorPoints(deductTarget!.id, {
      points: Number(deductPoints),
      reason: deductReason,
    }),
    onSuccess: (res) => {
      showToast('Đã trừ điểm', 'success')
      qc.invalidateQueries({ queryKey: ['admin-customers'] })
      setHistoryTarget((prev) => prev?.id === deductTarget?.id ? { ...prev, points: res.data.new_balance } : prev)
      setDeductTarget(null)
      setDeductPoints('')
      setDeductReason('')
    },
    onError: (err: ApiError) => showToast(err.response?.data?.message ?? 'Trừ điểm thất bại', 'error'),
  })

  const resetMutation = useMutation({
    mutationFn: () => resetCollaboratorPoints(resetTarget!.id, { reason: resetReason }),
    onSuccess: (res) => {
      showToast('Đã xóa điểm', 'success')
      qc.invalidateQueries({ queryKey: ['admin-customers'] })
      setHistoryTarget((prev) => prev?.id === resetTarget?.id ? { ...prev, points: res.data.new_balance } : prev)
      setResetTarget(null)
      setResetReason('')
    },
    onError: (err: ApiError) => showToast(err.response?.data?.message ?? 'Xóa điểm thất bại', 'error'),
  })
```

- [ ] **Step 4: Show the points stat in the detail sheet**

Replace the stats-row array (lines 221-224):

```tsx
              {[
                { label: 'Tổng đặt', value: historyTarget.total_bookings },
                { label: 'Hoàn thành', value: historyTarget.completed_bookings },
                { label: 'Chi tiêu', value: historyTarget.total_spent.toLocaleString('vi') + 'đ' },
                ...(historyTarget.is_collaborator
                  ? [{ label: 'Điểm CTV', value: (historyTarget.points ?? 0).toLocaleString('vi') }]
                  : []),
              ].map((s) => (
```

- [ ] **Step 5: Add the "Trừ điểm" / "Xóa điểm về 0" buttons**

In the same file, after the closing `</button>` of the Toggle CTV button (after line 277, before the `<Button ... Block/unblock ...>` on line 278), add:

```tsx
              {historyTarget.is_collaborator && (historyTarget.points ?? 0) > 0 && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setDeductTarget(historyTarget)}>
                    Trừ điểm
                  </Button>
                  <Button variant="danger" size="sm" className="flex-1" onClick={() => setResetTarget(historyTarget)}>
                    Xóa điểm về 0
                  </Button>
                </div>
              )}
```

- [ ] **Step 6: Add the deduct-points and reset-points modals**

After the closing of the "History + block sheet" block — i.e. after the `)}` on line 293 that closes `{historyTarget && (...)}`, and before the final `</div>` (line 294) that closes the component's root `<div>` — add:

```tsx
      {/* Deduct points modal */}
      {deductTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end" onClick={() => setDeductTarget(null)}>
          <div className="bg-white w-full rounded-t-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-4 border-b border-border-soft">
              <p className="text-[15px] font-semibold text-navy">Trừ điểm CTV</p>
              <button onClick={() => setDeductTarget(null)}>
                <span className="material-symbols-outlined text-neutral-gray text-[20px]">close</span>
              </button>
            </div>
            <div className="px-4 py-4 flex flex-col gap-3">
              <p className="text-[12px] text-neutral-gray">
                {deductTarget.name} · Số dư hiện tại: <span className="font-semibold text-navy">{(deductTarget.points ?? 0).toLocaleString('vi')} điểm</span>
              </p>
              <div className="flex flex-col gap-1">
                <label className="text-[12px] text-neutral-gray font-medium">Số điểm trừ <span className="text-danger-red">*</span></label>
                <input
                  type="number" min={1} max={deductTarget.points ?? 0} inputMode="numeric"
                  value={deductPoints}
                  onChange={(e) => setDeductPoints(e.target.value)}
                  placeholder="Nhập số điểm cần trừ"
                  className="border border-border-gray rounded-input px-3 py-2.5 text-sm text-navy outline-none focus:border-primary transition-colors [appearance:textfield]"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[12px] text-neutral-gray font-medium">Lý do <span className="text-danger-red">*</span></label>
                <textarea
                  value={deductReason}
                  onChange={(e) => setDeductReason(e.target.value)}
                  placeholder="Ví dụ: Đã thanh toán offline"
                  rows={3}
                  className="border border-border-gray rounded-input px-3 py-2.5 text-sm text-navy outline-none focus:border-primary transition-colors resize-none"
                />
              </div>
            </div>
            <div className="px-4 pb-6 pt-3 flex gap-3 border-t border-border-soft">
              <Button fullWidth variant="outline" onClick={() => setDeductTarget(null)}>Huỷ</Button>
              <Button
                fullWidth
                loading={deductMutation.isPending}
                disabled={
                  !deductPoints || Number(deductPoints) < 1 ||
                  Number(deductPoints) > (deductTarget.points ?? 0) || !deductReason.trim()
                }
                onClick={() => deductMutation.mutate()}
              >
                Trừ điểm
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reset points modal */}
      {resetTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end" onClick={() => setResetTarget(null)}>
          <div className="bg-white w-full rounded-t-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-4 border-b border-border-soft">
              <p className="text-[15px] font-semibold text-navy">Xóa điểm về 0</p>
              <button onClick={() => setResetTarget(null)}>
                <span className="material-symbols-outlined text-neutral-gray text-[20px]">close</span>
              </button>
            </div>
            <div className="px-4 py-4 flex flex-col gap-3">
              <p className="text-[13px] text-navy">
                {resetTarget.name} sẽ mất toàn bộ <span className="font-semibold text-danger-red">{(resetTarget.points ?? 0).toLocaleString('vi')} điểm</span>. Hành động này không thể hoàn tác.
              </p>
              <div className="flex flex-col gap-1">
                <label className="text-[12px] text-neutral-gray font-medium">Lý do <span className="text-danger-red">*</span></label>
                <textarea
                  value={resetReason}
                  onChange={(e) => setResetReason(e.target.value)}
                  placeholder="Ví dụ: Vi phạm chính sách thu hộ"
                  rows={3}
                  className="border border-border-gray rounded-input px-3 py-2.5 text-sm text-navy outline-none focus:border-primary transition-colors resize-none"
                />
              </div>
            </div>
            <div className="px-4 pb-6 pt-3 flex gap-3 border-t border-border-soft">
              <Button fullWidth variant="outline" onClick={() => setResetTarget(null)}>Huỷ</Button>
              <Button
                fullWidth
                variant="danger"
                loading={resetMutation.isPending}
                disabled={!resetReason.trim()}
                onClick={() => resetMutation.mutate()}
              >
                Xóa điểm
              </Button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 7: Typecheck**

Run: `docker compose exec frontend npm run build:admin`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 8: Manual verification in the browser**

Seed a test collaborator with points:

```bash
docker compose exec app php artisan tinker --execute="
\$u = App\Models\User::where('phone','0901234567')->first();
\$u->update(['is_collaborator' => true]);
App\Models\Wallet::updateOrCreate(['user_id' => \$u->id], ['points' => 500]);
"
```

Start the stack (`make up` if not already running), open the admin app (port from `frontend_admin`, `/admin/login`, phone `0923456789`, OTP `000000`), go to **Khách hàng**, open the customer with phone `0901234567`. Verify:
1. The "Điểm CTV" stat shows `500`.
2. "Trừ điểm" opens a modal; entering `600` disables the Save button (exceeds balance); entering `200` + a reason and saving updates the balance to `300` and shows a success toast.
3. "Xóa điểm về 0" opens a confirmation modal; entering a reason and confirming sets the balance to `0`, and both action buttons disappear (balance is 0).
4. Log in as that customer (phone `0901234567`) in the customer app, open Ví Cộng Tác Viên → lịch sử, and confirm the "Admin trừ điểm: ..." and "Admin xóa toàn bộ điểm: ..." entries appear.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/types.d.ts frontend/src/api/admin.ts frontend/src/pages/admin/CustomersPage.tsx
git commit -m "feat: admin UI to deduct or reset collaborator wallet points"
```

---

## Spec Coverage Check

- Deduct custom amount, capped at balance, reason required → Task 1.
- Reset to 0 in one action, reason required, no-op at 0 → Task 1.
- Only applies to `is_collaborator` users → Task 1.
- Points visible in admin customer list/detail → Task 2, Task 4 Step 4.
- Transparent to collaborator in their own wallet history → Task 3.
- Two separate UI actions in the existing `CustomersPage` detail sheet → Task 4.
- Driver wallet deduction explicitly out of scope → not touched by any task.
