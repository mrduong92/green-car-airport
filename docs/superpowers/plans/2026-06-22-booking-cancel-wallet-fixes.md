# Booking Cancel & Wallet Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 4 independent issues: penalty timer, cancel reason UX, toll text, and remove erroneous wallet credit on trip completion.

**Architecture:** Two DB migrations add `accepted_at` and `cancel_reason` to `bookings`; backend controllers updated; frontend `BookingStatusPage` updated for new timer logic and reason selector; `creditEarning()` removed entirely.

**Tech Stack:** Laravel 13 / PHP 8.4 (PHPUnit tests), React 19 + TypeScript + Tailwind CSS v3

## Global Constraints

- All UI text must be Vietnamese — no English strings in user-facing copy
- Run backend tests with: `docker compose exec app php artisan test`
- Run single test: `docker compose exec app php artisan test --filter=TestClassName`
- Containers must be up (`make up`) before running any command
- `$fillable` in `Booking` model must include any new columns before using `Booking::create()` or `->update()` with them

---

## Task 1: DB Migrations — `accepted_at` + `cancel_reason`

**Files:**
- Create: `backend/database/migrations/2026_06_22_000001_add_accepted_at_and_cancel_reason_to_bookings.php`
- Modify: `backend/app/Models/Booking.php`

**Interfaces:**
- Produces: `bookings.accepted_at` (timestamp, nullable), `bookings.cancel_reason` (varchar 255, nullable)

- [ ] **Step 1: Create migration file**

```php
<?php
// backend/database/migrations/2026_06_22_000001_add_accepted_at_and_cancel_reason_to_bookings.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->timestamp('accepted_at')->nullable()->after('status');
            $table->string('cancel_reason', 255)->nullable()->after('cancelled_by');
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropColumn(['accepted_at', 'cancel_reason']);
        });
    }
};
```

- [ ] **Step 2: Add fields to Booking model**

In `backend/app/Models/Booking.php`, update `$fillable` and `$casts`:

```php
protected $fillable = [
    'customer_id','driver_id','voucher_id','pickup','pickup_lat','pickup_lng',
    'destination','destination_lat','destination_lng',
    'date','time','distance_km','price','discount','surcharge','status','vehicle_type',
    'cancelled_at','cancelled_by','cancel_reason','accepted_at','note',
];
protected $casts = [
    'cancelled_at' => 'datetime',
    'accepted_at'  => 'datetime',
];
```

- [ ] **Step 3: Run migration**

```bash
docker compose exec app php artisan migrate
```

Expected: `Migrating: 2026_06_22_000001_add_accepted_at_and_cancel_reason_to_bookings` then `Migrated`.

- [ ] **Step 4: Commit**

```bash
git add backend/database/migrations/2026_06_22_000001_add_accepted_at_and_cancel_reason_to_bookings.php backend/app/Models/Booking.php
git commit -m "feat: add accepted_at and cancel_reason columns to bookings"
```

---

## Task 2: Backend — Penalty Timer from `accepted_at`

**Files:**
- Modify: `backend/app/Http/Controllers/Driver/TripController.php`
- Modify: `backend/app/Http/Controllers/Customer/BookingController.php`
- Create: `backend/tests/Feature/BookingCancelPenaltyTest.php`

**Interfaces:**
- Consumes: `bookings.accepted_at` from Task 1
- Produces: `accepted_at` field in `GET /api/bookings/{id}` and `GET /api/bookings/active` responses

- [ ] **Step 1: Write failing tests**

```php
<?php
// backend/tests/Feature/BookingCancelPenaltyTest.php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class BookingCancelPenaltyTest extends TestCase
{
    use RefreshDatabase;

    private function makeBooking(array $overrides = []): Booking
    {
        $customer = User::factory()->create(['role' => 'customer', 'pending_penalty' => 0]);
        return Booking::create(array_merge([
            'customer_id'  => $customer->id,
            'pickup'       => 'Hà Nội',
            'destination'  => 'Sân bay Nội Bài',
            'date'         => now()->addDay()->format('Y-m-d'),
            'time'         => '08:00',
            'vehicle_type' => 'sedan_4',
            'distance_km'  => 30,
            'price'        => 300_000,
            'discount'     => 0,
            'surcharge'    => 0,
            'status'       => 'finding_driver',
        ], $overrides));
    }

    /** Khách huỷ khi chưa có tài xế nhận — không phạt dù đã lâu */
    public function test_no_penalty_when_no_driver_accepted_yet(): void
    {
        Notification::fake();
        $booking  = $this->makeBooking(['created_at' => now()->subHours(3)]);
        $customer = $booking->customer;

        $this->actingAs($customer, 'sanctum')
            ->patchJson("/api/bookings/{$booking->id}/cancel")
            ->assertOk();

        $this->assertEquals(0, $customer->fresh()->pending_penalty);
    }

    /** Khách huỷ trong vòng 60 phút sau khi tài xế nhận — không phạt */
    public function test_no_penalty_when_cancelled_within_60_min_of_acceptance(): void
    {
        Notification::fake();
        $booking  = $this->makeBooking([
            'status'      => 'finding_driver',
            'accepted_at' => now()->subMinutes(30),
        ]);
        $customer = $booking->customer;

        $this->actingAs($customer, 'sanctum')
            ->patchJson("/api/bookings/{$booking->id}/cancel")
            ->assertOk();

        $this->assertEquals(0, $customer->fresh()->pending_penalty);
    }

    /** Khách huỷ sau 60 phút kể từ accepted_at — bị phạt 50,000đ */
    public function test_penalty_applied_when_cancelled_after_60_min_of_acceptance(): void
    {
        Notification::fake();
        $booking  = $this->makeBooking([
            'status'      => 'finding_driver',
            'accepted_at' => now()->subMinutes(90),
        ]);
        $customer = $booking->customer;

        $this->actingAs($customer, 'sanctum')
            ->patchJson("/api/bookings/{$booking->id}/cancel")
            ->assertOk();

        $this->assertEquals(50_000, $customer->fresh()->pending_penalty);
    }

    /** formatBooking trả về accepted_at */
    public function test_booking_response_includes_accepted_at(): void
    {
        Notification::fake();
        $booking  = $this->makeBooking(['accepted_at' => now()->subMinutes(10)]);
        $customer = $booking->customer;

        $response = $this->actingAs($customer, 'sanctum')
            ->getJson("/api/bookings/{$booking->id}")
            ->assertOk();

        $this->assertArrayHasKey('accepted_at', $response->json());
        $this->assertNotNull($response->json('accepted_at'));
    }
}
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
docker compose exec app php artisan test --filter=BookingCancelPenaltyTest
```

Expected: tests fail (penalty logic uses `created_at`, `accepted_at` not in response).

- [ ] **Step 3: Fix `TripController::accept()` — set `accepted_at`**

In `backend/app/Http/Controllers/Driver/TripController.php`, find the `accept()` method (around line 54). Change the `$booking->update()` call:

```php
$booking->update([
    'driver_id'   => $request->user()->id,
    'status'      => 'accepted',
    'accepted_at' => now(),
]);
```

- [ ] **Step 4: Fix `BookingController::cancel()` — use `accepted_at` for penalty**

In `backend/app/Http/Controllers/Customer/BookingController.php`, find the cancel method (around line 125). Replace the penalty block:

```php
// Old:
// if (now()->diffInMinutes($booking->created_at, false) < -60) {
//     $request->user()->increment('pending_penalty', 50_000);
// }

// New:
if ($booking->accepted_at && now()->diffInMinutes($booking->accepted_at, false) < -60) {
    $request->user()->increment('pending_penalty', 50_000);
}
```

- [ ] **Step 5: Add `accepted_at` to `formatBooking()`**

In `BookingController::formatBooking()`, add `accepted_at` to the returned array (after `created_at`):

```php
'created_at'      => $b->created_at?->toISOString(),
'accepted_at'     => $b->accepted_at?->toISOString(),
```

- [ ] **Step 6: Run tests — expect PASS**

```bash
docker compose exec app php artisan test --filter=BookingCancelPenaltyTest
```

Expected: 4 tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/app/Http/Controllers/Driver/TripController.php \
        backend/app/Http/Controllers/Customer/BookingController.php \
        backend/tests/Feature/BookingCancelPenaltyTest.php
git commit -m "feat: compute cancel penalty from accepted_at, expose field in API"
```

---

## Task 3: Backend — Save `cancel_reason`

**Files:**
- Modify: `backend/app/Http/Controllers/Customer/BookingController.php`
- Create: `backend/tests/Feature/BookingCancelReasonTest.php`

**Interfaces:**
- Consumes: `bookings.cancel_reason` from Task 1
- Produces: `PATCH /api/bookings/{id}/cancel` accepts optional `cancel_reason` string

- [ ] **Step 1: Write failing tests**

```php
<?php
// backend/tests/Feature/BookingCancelReasonTest.php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class BookingCancelReasonTest extends TestCase
{
    use RefreshDatabase;

    private function makeBooking(): Booking
    {
        $customer = User::factory()->create(['role' => 'customer', 'pending_penalty' => 0]);
        return Booking::create([
            'customer_id'  => $customer->id,
            'pickup'       => 'Hà Nội',
            'destination'  => 'Sân bay Nội Bài',
            'date'         => now()->addDay()->format('Y-m-d'),
            'time'         => '08:00',
            'vehicle_type' => 'sedan_4',
            'distance_km'  => 30,
            'price'        => 300_000,
            'discount'     => 0,
            'surcharge'    => 0,
            'status'       => 'finding_driver',
        ]);
    }

    public function test_cancel_reason_is_saved(): void
    {
        Notification::fake();
        $booking  = $this->makeBooking();
        $customer = $booking->customer;

        $this->actingAs($customer, 'sanctum')
            ->patchJson("/api/bookings/{$booking->id}/cancel", [
                'cancel_reason' => 'Tài xế yêu cầu hủy',
            ])
            ->assertOk();

        $this->assertEquals('Tài xế yêu cầu hủy', $booking->fresh()->cancel_reason);
    }

    public function test_cancel_without_reason_is_allowed(): void
    {
        Notification::fake();
        $booking  = $this->makeBooking();
        $customer = $booking->customer;

        $this->actingAs($customer, 'sanctum')
            ->patchJson("/api/bookings/{$booking->id}/cancel")
            ->assertOk();

        $this->assertNull($booking->fresh()->cancel_reason);
    }

    public function test_cancel_reason_too_long_is_rejected(): void
    {
        Notification::fake();
        $booking  = $this->makeBooking();
        $customer = $booking->customer;

        $this->actingAs($customer, 'sanctum')
            ->patchJson("/api/bookings/{$booking->id}/cancel", [
                'cancel_reason' => str_repeat('a', 256),
            ])
            ->assertStatus(422);
    }
}
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
docker compose exec app php artisan test --filter=BookingCancelReasonTest
```

Expected: tests fail (cancel_reason not validated or saved).

- [ ] **Step 3: Update `BookingController::cancel()` to accept and save `cancel_reason`**

In `backend/app/Http/Controllers/Customer/BookingController.php`, update the `cancel()` method. Add validation at the top:

```php
public function cancel(Request $request, Booking $booking): JsonResponse
{
    if ($booking->customer_id !== $request->user()->id) {
        return response()->json(['message' => 'Forbidden.'], 403);
    }

    if (! in_array($booking->status, ['pending', 'finding_driver'])) {
        return response()->json(['message' => 'Không thể huỷ chuyến ở trạng thái này.'], 422);
    }

    $data = $request->validate([
        'cancel_reason' => 'nullable|string|max:255',
    ]);

    if ($booking->accepted_at && now()->diffInMinutes($booking->accepted_at, false) < -60) {
        $request->user()->increment('pending_penalty', 50_000);
    }

    $booking->update([
        'status'        => 'cancelled',
        'cancelled_at'  => now(),
        'cancelled_by'  => 'customer',
        'cancel_reason' => $data['cancel_reason'] ?? null,
    ]);

    $request->user()->notify(new CustomerCancelledNotification($booking));

    return response()->json($this->formatBooking($booking->fresh(['driver.driverProfile', 'voucher'])));
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
docker compose exec app php artisan test --filter=BookingCancelReasonTest
```

Expected: 3 tests pass.

- [ ] **Step 5: Run all tests to confirm no regression**

```bash
docker compose exec app php artisan test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/Http/Controllers/Customer/BookingController.php \
        backend/tests/Feature/BookingCancelReasonTest.php
git commit -m "feat: save cancel_reason when customer cancels booking"
```

---

## Task 4: Backend — Remove `creditEarning()`

**Files:**
- Modify: `backend/app/Http/Controllers/Driver/TripController.php`
- Create: `backend/tests/Feature/TripCompleteNoCreditTest.php`

**Interfaces:**
- Produces: completing a trip no longer credits points to driver wallet; `trips_count` still increments

- [ ] **Step 1: Write failing test**

```php
<?php
// backend/tests/Feature/TripCompleteNoCreditTest.php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class TripCompleteNoCreditTest extends TestCase
{
    use RefreshDatabase;

    public function test_completing_trip_does_not_credit_wallet_points(): void
    {
        Notification::fake();

        $driver   = User::factory()->create(['role' => 'driver']);
        $customer = User::factory()->create(['role' => 'customer']);

        $wallet = Wallet::create(['user_id' => $driver->id, 'points' => 500]);

        $booking = Booking::create([
            'customer_id'  => $customer->id,
            'driver_id'    => $driver->id,
            'pickup'       => 'Hà Nội',
            'destination'  => 'Sân bay Nội Bài',
            'date'         => now()->addDay()->format('Y-m-d'),
            'time'         => '08:00',
            'vehicle_type' => 'sedan_4',
            'distance_km'  => 30,
            'price'        => 300_000,
            'discount'     => 0,
            'surcharge'    => 0,
            'status'       => 'in_progress',
        ]);

        $this->actingAs($driver, 'sanctum')
            ->patchJson("/api/driver/trips/{$booking->id}/status", ['status' => 'completed'])
            ->assertOk();

        $this->assertEquals(500, $wallet->fresh()->points);
    }

    public function test_completing_trip_increments_trips_count(): void
    {
        Notification::fake();

        $driver   = User::factory()->create(['role' => 'driver']);
        $customer = User::factory()->create(['role' => 'customer']);
        $profile  = $driver->driverProfile()->create([
            'vehicle_make'  => 'Toyota',
            'vehicle_model' => 'Camry',
            'vehicle_plate' => '51G-00001',
            'trips_count'   => 0,
        ]);

        Wallet::create(['user_id' => $driver->id, 'points' => 500]);

        $booking = Booking::create([
            'customer_id'  => $customer->id,
            'driver_id'    => $driver->id,
            'pickup'       => 'Hà Nội',
            'destination'  => 'Sân bay Nội Bài',
            'date'         => now()->addDay()->format('Y-m-d'),
            'time'         => '08:00',
            'vehicle_type' => 'sedan_4',
            'distance_km'  => 30,
            'price'        => 300_000,
            'discount'     => 0,
            'surcharge'    => 0,
            'status'       => 'in_progress',
        ]);

        $this->actingAs($driver, 'sanctum')
            ->patchJson("/api/driver/trips/{$booking->id}/status", ['status' => 'completed'])
            ->assertOk();

        $this->assertEquals(1, $profile->fresh()->trips_count);
    }
}
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
docker compose exec app php artisan test --filter=TripCompleteNoCreditTest
```

Expected: `test_completing_trip_does_not_credit_wallet_points` fails because `creditEarning()` adds points.

- [ ] **Step 3: Remove `creditEarning()` from `TripController`**

In `backend/app/Http/Controllers/Driver/TripController.php`, find `updateStatus()` (around line 81).

Replace the `completed` block (lines ~108–114):

```php
if ($newStatus === 'completed') {
    // Old: $this->creditEarning($request->user(), $booking);
    $request->user()->driverProfile?->increment('trips_count');
    $booking->customer?->notify(new BookingCompletedCustomerNotification($booking));
    $request->user()->notify(new TripCompletedDriverNotification($booking));
}
```

Then delete the entire `creditEarning()` method (lines ~119–137):

```php
// DELETE this entire method:
// private function creditEarning($driver, Booking $booking): void
// {
//     ...
// }
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
docker compose exec app php artisan test --filter=TripCompleteNoCreditTest
```

Expected: 2 tests pass.

- [ ] **Step 5: Run all tests to confirm no regression**

```bash
docker compose exec app php artisan test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/Http/Controllers/Driver/TripController.php \
        backend/tests/Feature/TripCompleteNoCreditTest.php
git commit -m "fix: remove erroneous wallet credit on trip completion"
```

---

## Task 5: Frontend — Timer, Cancel Reason UI, Text Fix

**Files:**
- Modify: `frontend/src/types.d.ts`
- Modify: `frontend/src/api/bookings.ts`
- Modify: `frontend/src/pages/customer/BookingStatusPage.tsx`
- Modify: `frontend/src/components/common/AppHeader.tsx`

**Interfaces:**
- Consumes: `accepted_at` field from API (Task 2), `cancel_reason` field in cancel request (Task 3)

- [ ] **Step 1: Update `App.Booking` type — add `accepted_at`**

In `frontend/src/types.d.ts`, find the `Booking` interface (around line 16) and add `accepted_at` after `created_at`:

```typescript
created_at: string
accepted_at?: string | null
```

- [ ] **Step 2: Update `cancelBooking` API call — send `cancel_reason`**

In `frontend/src/api/bookings.ts`, update line 14:

```typescript
export const cancelBooking = (id: number, cancelReason?: string) =>
  api.patch(`/bookings/${id}/cancel`, cancelReason ? { cancel_reason: cancelReason } : {})
```

- [ ] **Step 3: Fix text in `AppHeader.tsx`**

In `frontend/src/components/common/AppHeader.tsx`, line 54:

```typescript
// Before:
{ icon: 'local_parking', text: 'Giá đã bao gồm phí cầu đường và bãi đỗ sân bay.' },

// After:
{ icon: 'local_parking', text: 'Giá chưa bao gồm phí cầu đường và bãi đỗ sân bay.' },
```

- [ ] **Step 4: Update `BookingStatusPage` — timer from `accepted_at`, cancel reason flow**

Replace `BookingStatusPage.tsx` logic in the top of the component (after hooks). Find and replace the timer/cancel state block (currently around lines 60–63):

```typescript
// REMOVE these lines:
// const minutesSinceBooking = booking ? dayjs().diff(dayjs(booking.created_at), 'minute') : 0
// const canCancel = booking && ['pending', 'finding_driver'].includes(booking.status)
// const isFreeCancel = minutesSinceBooking < 60
// const minutesLeft = Math.max(0, 60 - minutesSinceBooking)

// ADD these lines:
const [reasonOpen, setReasonOpen] = useState(false)
const [selectedReason, setSelectedReason] = useState<string>('')

const minutesSinceAccepted = booking?.accepted_at
  ? dayjs().diff(dayjs(booking.accepted_at), 'minute')
  : 0
const canCancel = booking && ['pending', 'finding_driver'].includes(booking.status)
const isFreeCancel = !booking?.accepted_at || minutesSinceAccepted < 60
const minutesLeft = booking?.accepted_at ? Math.max(0, 60 - minutesSinceAccepted) : 60
```

- [ ] **Step 5: Update `cancelMutation` to send `selectedReason`**

Find the `cancelMutation` definition (around line 52) and update `mutationFn`:

```typescript
const cancelMutation = useMutation({
  mutationFn: () => cancelBooking(Number(id), selectedReason || undefined),
  onSuccess: () => { showToast('Đã huỷ chuyến', 'info'); setConfirmOpen(false); setReasonOpen(false); refetch() },
  onError: () => { showToast('Không thể huỷ chuyến', 'error'); setConfirmOpen(false); setReasonOpen(false) },
})
```

- [ ] **Step 6: Replace the "Huỷ chuyến" actions block with reason selector + confirm flow**

Find the Actions block (around line 378). Replace it entirely:

```tsx
{canCancel && (
  <div className="flex flex-col items-center gap-2">
    {isFreeCancel ? (
      <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-success-green bg-light-green px-3 py-1 rounded-pill">
        <span className="material-symbols-outlined text-[14px]">timer</span>
        Huỷ miễn phí · còn {minutesLeft} phút
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-danger-red bg-red-50 px-3 py-1 rounded-pill">
        <span className="material-symbols-outlined text-[14px]">warning</span>
        Huỷ sẽ bị phạt 50,000đ
      </span>
    )}
    <button
      onClick={() => setReasonOpen(true)}
      className="text-danger-red text-sm text-center underline"
    >
      Huỷ chuyến
    </button>
  </div>
)}
```

- [ ] **Step 7: Add reason selector modal and confirm dialog**

Find the `<ConfirmDialog ... />` block (around line 405) and replace with:

```tsx
{/* Reason selector modal */}
{reasonOpen && (
  <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setReasonOpen(false)}>
    <div className="w-full max-w-md bg-white rounded-t-2xl p-5 pb-8" onClick={(e) => e.stopPropagation()}>
      <p className="text-[15px] font-semibold text-navy mb-4">Lý do huỷ chuyến</p>
      <div className="flex flex-col gap-2">
        {['Tài xế yêu cầu hủy', 'Đổi lộ trình', 'Đổi xe khác', 'Lý do khác'].map((reason) => (
          <button
            key={reason}
            onClick={() => setSelectedReason(reason)}
            className={`w-full text-left px-4 py-3 rounded-input border text-sm transition-colors ${
              selectedReason === reason
                ? 'border-primary bg-light-green text-primary font-medium'
                : 'border-border-gray text-navy'
            }`}
          >
            {reason}
          </button>
        ))}
      </div>
      <div className="flex gap-3 mt-5">
        <button
          onClick={() => { setReasonOpen(false); setSelectedReason('') }}
          className="flex-1 py-3 rounded-input border border-border-gray text-sm text-neutral-gray"
        >
          Đóng
        </button>
        <button
          onClick={() => { setReasonOpen(false); setConfirmOpen(true) }}
          disabled={!selectedReason}
          className="flex-1 py-3 rounded-input bg-danger-red text-white text-sm font-semibold disabled:opacity-40"
        >
          Tiếp tục
        </button>
      </div>
    </div>
  </div>
)}

<ConfirmDialog
  open={confirmOpen}
  title={isFreeCancel ? 'Xác nhận huỷ chuyến?' : 'Huỷ chuyến · Phạt 50,000đ'}
  description={[
    isFreeCancel
      ? 'Chuyến sẽ bị huỷ và tài xế sẽ không được phân công.'
      : 'Bạn đã quá 1 giờ kể từ khi tài xế nhận cuốc. Phí phạt 50,000đ sẽ được cộng vào cuốc xe tiếp theo.',
    booking?.voucher_code
      ? `Voucher ${booking.voucher_code} đã dùng sẽ không được hoàn lại.`
      : '',
  ].filter(Boolean).join(' ')}
  confirmLabel="Xác nhận huỷ"
  loading={cancelMutation.isPending}
  onConfirm={() => cancelMutation.mutate()}
  onCancel={() => setConfirmOpen(false)}
/>
```

Note: the `ConfirmDialog` description text also updated — "kể từ khi đặt" → "kể từ khi tài xế nhận cuốc".

- [ ] **Step 8: Verify TypeScript compiles**

```bash
docker compose exec green_car_frontend npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/types.d.ts \
        frontend/src/api/bookings.ts \
        frontend/src/pages/customer/BookingStatusPage.tsx \
        frontend/src/components/common/AppHeader.tsx
git commit -m "feat: cancel reason flow, accepted_at timer, fix toll text"
```

---

## Self-Review Checklist

- [x] Task 1 covers both `accepted_at` and `cancel_reason` migrations + Booking model `$fillable`
- [x] Task 2 covers TripController sets `accepted_at`, BookingController uses it for penalty, formatBooking returns it
- [x] Task 3 covers cancel_reason validate + save
- [x] Task 4 covers remove `creditEarning()` call + method, keep `trips_count` increment
- [x] Task 5 covers types, API, timer logic, reason selector UI, ConfirmDialog text update, toll text fix
- [x] No placeholders or TODOs — all code blocks are complete
- [x] Type names consistent: `App.Booking.accepted_at` defined in Task 5 Step 1, consumed in Step 4
- [x] `cancelBooking` signature updated in Task 5 Step 2, called with `selectedReason` in Step 5
