# Voucher 10% Discount Cap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cap voucher discount at 10% of the ride price, expose `final_price` to drivers, and show the cap limit to customers in both the voucher sheet and booking footer.

**Architecture:** Hard-code `VOUCHER_MAX_RATE = 0.10` in both backend (PHP constant) and frontend (TypeScript constant). Backend enforces the cap in `VoucherController::apply()` and `BookingController::store()`. `TripController::formatTrip()` adds `discount` and `final_price` fields so the driver sees exactly what the customer pays. Frontend `VoucherSheet` caps the local calculation and shows a cap notice; `BookingFormPage` footer shows the cap message when active; `TripDetailPage` switches from `trip.price` to `trip.final_price`.

**Tech Stack:** Laravel 13 / PHP 8.4 · PHPUnit (backend tests) · React 19 + TypeScript + TanStack Query (frontend) · Docker Compose (`make test`, `docker compose exec`)

## Global Constraints

- All UI strings must remain Vietnamese — no English.
- `VOUCHER_MAX_RATE = 0.10` — single source of truth for the cap; never use the magic number `0.10` directly.
- `maxDiscount = floor(price × 0.10)` — use `floor` so it never exceeds 10%.
- `rawDiscount` for percent-type vouchers uses `round` for fairness.
- Only `UserFactory` exists — create Voucher/Booking records directly via `Model::create()` in tests.
- Run `make test` after every backend task to guard against regressions.

---

### Task 1: Add `discount` and `final_price` to `App.Trip` TypeScript type

**Files:**
- Modify: `frontend/src/types.d.ts` (lines 66–87, the `Trip` interface)

**Interfaces:**
- Produces: `App.Trip.discount: number`, `App.Trip.final_price: number` — consumed by Task 7 (TripDetailPage)

- [ ] **Step 1: Open `frontend/src/types.d.ts` and locate the `Trip` interface**

The interface starts around line 66 and contains `price`, `app_fee`, `net_earning`.

- [ ] **Step 2: Add two fields after `price: number`**

Find this block:

```ts
price: number
app_fee: number
net_earning: number
```

Replace with:

```ts
price: number
discount: number
final_price: number
app_fee: number
net_earning: number
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
docker compose exec green_car_frontend npx tsc --noEmit
```

Expected: exits 0 (or same pre-existing errors as before — no new errors from this change).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types.d.ts
git commit -m "types: add discount and final_price to App.Trip"
```

---

### Task 2: Backend — Cap discount in `VoucherController::apply()`

**Files:**
- Modify: `backend/app/Http/Controllers/Customer/VoucherController.php`
- Test: `backend/tests/Feature/VoucherApplyCapTest.php`

**Interfaces:**
- Produces: `POST /api/customer/vouchers/apply` returns `discount` (capped to 10%) and new field `max_discount`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/Feature/VoucherApplyCapTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Voucher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class VoucherApplyCapTest extends TestCase
{
    use RefreshDatabase;

    private function customer(): User
    {
        return User::factory()->create(['role' => 'customer']);
    }

    private function voucher(string $type, int $value): Voucher
    {
        return Voucher::create([
            'code'        => 'TEST' . $value,
            'type'        => $type,
            'value'       => $value,
            'is_active'   => true,
            'expires_at'  => now()->addDays(30),
            'usage_limit' => null,
            'usage_count' => 0,
        ]);
    }

    public function test_fixed_voucher_larger_than_10pct_is_capped(): void
    {
        // 100k voucher on 250k ride → max = 25k, so discount = 25k
        $this->actingAs($this->customer(), 'sanctum')
            ->postJson('/api/customer/vouchers/apply', [
                'code'  => $this->voucher('fixed', 100_000)->code,
                'price' => 250_000,
            ])
            ->assertOk()
            ->assertJson([
                'discount'     => 25_000,
                'max_discount' => 25_000,
            ]);
    }

    public function test_fixed_voucher_below_10pct_is_not_capped(): void
    {
        // 10k voucher on 250k ride → max = 25k, so discount = 10k (not capped)
        $this->actingAs($this->customer(), 'sanctum')
            ->postJson('/api/customer/vouchers/apply', [
                'code'  => $this->voucher('fixed', 10_000)->code,
                'price' => 250_000,
            ])
            ->assertOk()
            ->assertJson([
                'discount'     => 10_000,
                'max_discount' => 25_000,
            ]);
    }

    public function test_percent_voucher_larger_than_10pct_is_capped(): void
    {
        // 50% voucher on 500k ride → raw = 250k, max = 50k, so discount = 50k
        $this->actingAs($this->customer(), 'sanctum')
            ->postJson('/api/customer/vouchers/apply', [
                'code'  => $this->voucher('percent', 50)->code,
                'price' => 500_000,
            ])
            ->assertOk()
            ->assertJson([
                'discount'     => 50_000,
                'max_discount' => 50_000,
            ]);
    }
}
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
docker compose exec app php artisan test --filter=VoucherApplyCapTest
```

Expected: FAIL — `discount` returns uncapped values (100_000 and 250_000 instead of 25_000 and 50_000), and `max_discount` key is absent.

- [ ] **Step 3: Update `VoucherController::apply()`**

Open `backend/app/Http/Controllers/Customer/VoucherController.php`. Replace the entire `apply()` method:

```php
public function apply(Request $request): JsonResponse
{
    $request->validate([
        'code'  => 'required|string',
        'price' => 'required|integer|min:0',
    ]);

    $voucher = Voucher::where('code', $request->code)
        ->where('is_active', true)
        ->where('expires_at', '>=', today())
        ->where(fn ($q) => $q->whereNull('usage_limit')->orWhereColumn('usage_count', '<', 'usage_limit'))
        ->first();

    if (! $voucher) {
        return response()->json(['message' => 'Mã giảm giá không hợp lệ hoặc đã hết hạn.'], 422);
    }

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
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
docker compose exec app php artisan test --filter=VoucherApplyCapTest
```

Expected: 3 tests pass.

- [ ] **Step 5: Run the full test suite**

```bash
make test
```

Expected: all tests pass, no regressions.

- [ ] **Step 6: Commit**

```bash
git add backend/app/Http/Controllers/Customer/VoucherController.php \
        backend/tests/Feature/VoucherApplyCapTest.php
git commit -m "feat: cap voucher discount at 10% in VoucherController::apply"
```

---

### Task 3: Backend — Cap discount in `BookingController::store()`

**Files:**
- Modify: `backend/app/Http/Controllers/Customer/BookingController.php`
- Test: `backend/tests/Feature/BookingDiscountCapTest.php`

**Interfaces:**
- Produces: `bookings.discount` stored as capped value; `POST /api/customer/bookings` response has `discount` ≤ 10% of `price` and correct `final_price`.
- Note: `formatBooking()` already returns `final_price = price - discount + surcharge` — no change needed there.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/Feature/BookingDiscountCapTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Voucher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BookingDiscountCapTest extends TestCase
{
    use RefreshDatabase;

    private function customer(): User
    {
        return User::factory()->create(['role' => 'customer']);
    }

    private function payload(string $voucherCode): array
    {
        return [
            'pickup'       => 'Hà Nội',
            'destination'  => 'Sân bay Nội Bài',
            'date'         => now()->addDay()->format('Y-m-d'),
            'time'         => '08:00',
            'vehicle_type' => 'sedan_4',
            'distance_km'  => 30,
            'price'        => 250_000,
            'voucher_code' => $voucherCode,
        ];
    }

    public function test_booking_caps_discount_at_10_percent(): void
    {
        // 100k voucher on 250k ride → discount stored as 25k, final_price = 225k
        $voucher = Voucher::create([
            'code'        => 'BIG100K',
            'type'        => 'fixed',
            'value'       => 100_000,
            'is_active'   => true,
            'expires_at'  => now()->addDays(30),
            'usage_limit' => null,
            'usage_count' => 0,
        ]);

        $this->actingAs($this->customer(), 'sanctum')
            ->postJson('/api/customer/bookings', $this->payload($voucher->code))
            ->assertCreated()
            ->assertJson([
                'discount'    => 25_000,
                'final_price' => 225_000,
            ]);

        $this->assertDatabaseHas('bookings', ['discount' => 25_000]);
    }

    public function test_booking_does_not_cap_small_discount(): void
    {
        // 10k voucher on 250k ride → discount stays 10k, final_price = 240k
        $voucher = Voucher::create([
            'code'        => 'SMALL10K',
            'type'        => 'fixed',
            'value'       => 10_000,
            'is_active'   => true,
            'expires_at'  => now()->addDays(30),
            'usage_limit' => null,
            'usage_count' => 0,
        ]);

        $this->actingAs($this->customer(), 'sanctum')
            ->postJson('/api/customer/bookings', $this->payload($voucher->code))
            ->assertCreated()
            ->assertJson([
                'discount'    => 10_000,
                'final_price' => 240_000,
            ]);
    }
}
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
docker compose exec app php artisan test --filter=BookingDiscountCapTest
```

Expected: FAIL — `discount` is 100_000 (uncapped) and `final_price` is 150_000 instead of 225_000.

- [ ] **Step 3: Cap the discount inside `BookingController::store()`**

Open `backend/app/Http/Controllers/Customer/BookingController.php`. Inside `store()`, find:

```php
if ($voucher) {
    $discount  = $voucher->type === 'fixed'
        ? $voucher->value
        : (int) round($data['price'] * $voucher->value / 100);
    $voucherId = $voucher->id;
    $voucher->increment('usage_count');
}
```

Replace with:

```php
if ($voucher) {
    $raw       = $voucher->type === 'fixed'
        ? $voucher->value
        : (int) round($data['price'] * $voucher->value / 100);
    $discount  = min($raw, (int) floor($data['price'] * 0.10));
    $voucherId = $voucher->id;
    $voucher->increment('usage_count');
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
docker compose exec app php artisan test --filter=BookingDiscountCapTest
```

Expected: 2 tests pass.

- [ ] **Step 5: Run the full test suite**

```bash
make test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/Http/Controllers/Customer/BookingController.php \
        backend/tests/Feature/BookingDiscountCapTest.php
git commit -m "feat: cap voucher discount at 10% when storing booking"
```

---

### Task 4: Backend — Expose `discount` and `final_price` in `TripController::formatTrip()`

**Files:**
- Modify: `backend/app/Http/Controllers/Driver/TripController.php`
- Test: `backend/tests/Feature/TripFinalPriceTest.php`

**Interfaces:**
- Produces: `GET /api/driver/trips`, `GET /api/driver/trips/mine`, `GET /api/driver/trips/history` responses include `discount: int` and `final_price: int`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/Feature/TripFinalPriceTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TripFinalPriceTest extends TestCase
{
    use RefreshDatabase;

    public function test_trip_list_includes_discount_and_final_price(): void
    {
        $driver   = User::factory()->create(['role' => 'driver']);
        $customer = User::factory()->create(['role' => 'customer']);

        Booking::create([
            'customer_id'  => $customer->id,
            'pickup'       => 'Hà Nội',
            'destination'  => 'Sân bay Nội Bài',
            'date'         => now()->addDay()->format('Y-m-d'),
            'time'         => '08:00',
            'vehicle_type' => 'sedan_4',
            'distance_km'  => 30,
            'price'        => 250_000,
            'discount'     => 25_000,
            'surcharge'    => 0,
            'status'       => 'finding_driver',
        ]);

        $this->actingAs($driver, 'sanctum')
            ->getJson('/api/driver/trips')
            ->assertOk()
            ->assertJsonPath('0.discount', 25_000)
            ->assertJsonPath('0.final_price', 225_000);
    }

    public function test_final_price_equals_price_when_no_discount(): void
    {
        $driver   = User::factory()->create(['role' => 'driver']);
        $customer = User::factory()->create(['role' => 'customer']);

        Booking::create([
            'customer_id'  => $customer->id,
            'pickup'       => 'Hà Nội',
            'destination'  => 'Sân bay Nội Bài',
            'date'         => now()->addDay()->format('Y-m-d'),
            'time'         => '08:00',
            'vehicle_type' => 'sedan_4',
            'distance_km'  => 20,
            'price'        => 300_000,
            'discount'     => 0,
            'surcharge'    => 0,
            'status'       => 'finding_driver',
        ]);

        $this->actingAs($driver, 'sanctum')
            ->getJson('/api/driver/trips')
            ->assertOk()
            ->assertJsonPath('0.discount', 0)
            ->assertJsonPath('0.final_price', 300_000);
    }
}
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
docker compose exec app php artisan test --filter=TripFinalPriceTest
```

Expected: FAIL — `discount` and `final_price` keys are absent in the response.

- [ ] **Step 3: Add the two fields to `formatTrip()`**

Open `backend/app/Http/Controllers/Driver/TripController.php`. In `formatTrip()`, find:

```php
'price'       => $b->price,
'app_fee'     => $appFee,
'net_earning' => $netEarning,
```

Replace with:

```php
'price'       => $b->price,
'discount'    => $b->discount,
'final_price' => $b->price - $b->discount,
'app_fee'     => $appFee,
'net_earning' => $netEarning,
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
docker compose exec app php artisan test --filter=TripFinalPriceTest
```

Expected: 2 tests pass.

- [ ] **Step 5: Run the full test suite**

```bash
make test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/Http/Controllers/Driver/TripController.php \
        backend/tests/Feature/TripFinalPriceTest.php
git commit -m "feat: expose discount and final_price in TripController formatTrip"
```

---

### Task 5: Frontend — Cap logic and UI in `VoucherSheet.tsx`

**Files:**
- Modify: `frontend/src/components/common/VoucherSheet.tsx`

**Interfaces:**
- Consumes: `App.VoucherListItem`, `currentPrice: number` (existing)
- Produces: `calcDiscount(v, price)` returns capped value; cards show "Tối đa Xđ (10% cuốc này)" when capped

- [ ] **Step 1: Add `VOUCHER_MAX_RATE` and update `calcDiscount()`**

Open `frontend/src/components/common/VoucherSheet.tsx`. After the imports, find:

```ts
function calcDiscount(v: App.VoucherListItem, price: number) {
  return v.type === 'fixed' ? v.value : Math.round(price * v.value / 100)
}
```

Replace the constant block and the function with:

```ts
const VOUCHER_MAX_RATE = 0.10

function calcDiscount(v: App.VoucherListItem, price: number) {
  const raw = v.type === 'fixed' ? v.value : Math.round(price * v.value / 100)
  return Math.min(raw, Math.floor(price * VOUCHER_MAX_RATE))
}
```

- [ ] **Step 2: Calculate cap variables inside the `map()` and show cap notice**

In the `vouchers.map()` block, find the opening:

```tsx
{vouchers.map((v) => {
  const isSelected = v.code === selectedCode
  const discount = onSelect ? calcDiscount(v, currentPrice) : null
```

Replace with:

```tsx
{vouchers.map((v) => {
  const isSelected = v.code === selectedCode
  const discount = onSelect ? calcDiscount(v, currentPrice) : null
  const raw = v.type === 'fixed' ? v.value : Math.round(currentPrice * v.value / 100)
  const maxDiscount = Math.floor(currentPrice * VOUCHER_MAX_RATE)
  const isCapped = currentPrice > 0 && raw > maxDiscount
```

Then find the savings line:

```tsx
{discount !== null && currentPrice > 0 && (
  <p className="text-[11px] text-success-green font-medium mt-0.5">
    Tiết kiệm {discount.toLocaleString('vi')}đ
  </p>
)}
```

Replace with:

```tsx
{discount !== null && currentPrice > 0 && (
  <>
    <p className="text-[11px] text-success-green font-medium mt-0.5">
      Tiết kiệm {discount.toLocaleString('vi')}đ
    </p>
    {isCapped && (
      <p className="text-[11px] text-neutral-gray mt-0.5">
        Tối đa {maxDiscount.toLocaleString('vi')}đ (10% cuốc này)
      </p>
    )}
  </>
)}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
docker compose exec green_car_frontend npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 4: Manual verification**

`make up`, log in as customer (`0901234567`, OTP `000000`), open booking form, enter price 250,000, open voucher sheet:
- **AIRPORT50K** (50,000đ fixed, 50k > 25k max): shows "Tiết kiệm 25.000đ" + "Tối đa 25.000đ (10% cuốc này)".
- **NEWUSER10** (if it's a 10% percent voucher on 250k = 25k, which equals max, should show capped). Test with price 300,000: 10% of 300k = 30k, raw = 30k, max = 30k — not capped (raw ≤ max). Try price 250k: raw = 25k = max — show as capped.
- If no voucher is capped in seed data, temporarily test with price 100,000 and AIRPORT50K (50k > 10k max → capped).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/common/VoucherSheet.tsx
git commit -m "feat: cap voucher calcDiscount at 10%, show cap notice in VoucherSheet"
```

---

### Task 6: Frontend — Show cap notice in `BookingFormPage.tsx` footer

**Files:**
- Modify: `frontend/src/pages/customer/BookingFormPage.tsx`

**Interfaces:**
- Consumes: `discount: number`, `price: number` (existing state variables)
- Produces: Footer shows "Giảm tối đa 10% giá cuốc" below the discount amount when discount is capped

- [ ] **Step 1: Add `VOUCHER_MAX_RATE` and `isCapped` after the `total` line**

Open `frontend/src/pages/customer/BookingFormPage.tsx`. Find:

```ts
const total = Math.max(0, price - discount)
```

Add immediately after:

```ts
const VOUCHER_MAX_RATE = 0.10
const isCapped = discount > 0 && discount === Math.floor(price * VOUCHER_MAX_RATE)
```

- [ ] **Step 2: Wrap the total+discount display and add the cap notice**

In the sticky footer, find:

```tsx
<div className="flex items-baseline gap-2">
  <span className="text-[22px] font-bold text-navy tabular-nums">{total.toLocaleString('vi')} đ</span>
  {discount > 0 && (
    <span className="text-[12px] font-semibold text-success-green">-{discount.toLocaleString('vi')}đ</span>
  )}
</div>
```

Replace with:

```tsx
<div className="flex flex-col">
  <div className="flex items-baseline gap-2">
    <span className="text-[22px] font-bold text-navy tabular-nums">{total.toLocaleString('vi')} đ</span>
    {discount > 0 && (
      <span className="text-[12px] font-semibold text-success-green">-{discount.toLocaleString('vi')}đ</span>
    )}
  </div>
  {isCapped && (
    <span className="text-[11px] text-neutral-gray">Giảm tối đa 10% giá cuốc</span>
  )}
</div>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
docker compose exec green_car_frontend npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 4: Manual verification**

Log in as customer, open booking form, enter price 250,000, select AIRPORT50K voucher:
- Footer should show: `225.000 đ` with `-25.000đ` beside it, and "Giảm tối đa 10% giá cuốc" on the line below.
- Remove the voucher (tap ×): cap notice disappears.
- Apply a small voucher (value ≤ 10% of price): cap notice does NOT appear.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/customer/BookingFormPage.tsx
git commit -m "feat: show 10% cap notice in booking footer when voucher is capped"
```

---

### Task 7: Frontend — Use `final_price` in `TripDetailPage.tsx`

**Files:**
- Modify: `frontend/src/pages/driver/TripDetailPage.tsx`

**Interfaces:**
- Consumes: `App.Trip.discount` and `App.Trip.final_price` (added in Task 1, served by Task 4)

- [ ] **Step 1: Replace `trip.price` with `trip.final_price` for "Giá khách trả"**

Open `frontend/src/pages/driver/TripDetailPage.tsx`. Find (around line 152):

```tsx
{ icon: 'payments', label: 'Giá khách trả', value: `${trip.price.toLocaleString('vi')} đ` },
```

Replace with:

```tsx
{ icon: 'payments', label: 'Giá khách trả', value: `${trip.final_price.toLocaleString('vi')} đ` },
```

- [ ] **Step 2: Fix the `ConfirmDialog` fee calculation**

Find (around line 190):

```tsx
description={`Phí app 20% (${Math.round(trip.price * 0.2).toLocaleString('vi')}đ) đã trừ khi nhận sẽ không được hoàn lại.`}
```

Replace with:

```tsx
description={`Phí app 20% (${Math.round(trip.final_price * 0.2).toLocaleString('vi')}đ) đã trừ khi nhận sẽ không được hoàn lại.`}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
docker compose exec green_car_frontend npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 4: Manual verification**

Using seed data: log in as driver (`0912345678`, OTP `000000`), accept a booking from a customer who used a voucher:
- "Giá khách trả" in the trip specs grid should match the amount the customer sees as their total (e.g. 225.000đ, not 250.000đ).
- "Phí app (20%)" should be 20% of the post-discount price (already correct in backend, just confirm display).
- "Bạn nhận" (net earning) should be consistent.
- Tap "Huỷ cuốc" → dialog fee should reflect the capped-discount price.

To test end-to-end with a capped voucher: book as customer with AIRPORT50K on a 250k ride, accept as driver. Verify both apps show 225.000đ as the customer pays amount.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/driver/TripDetailPage.tsx
git commit -m "fix: use final_price for khách trả in TripDetailPage"
```

---

## Self-Review

**Spec coverage:**
- ✅ Cap in `VoucherController::apply()` — Task 2
- ✅ Cap in `BookingController::store()` — Task 3
- ✅ `max_discount` field in `VoucherController` response — Task 2
- ✅ `TripController::formatTrip()` exposes `discount` + `final_price` — Task 4
- ✅ `VoucherSheet` cap logic — Task 5
- ✅ `VoucherSheet` cap UI (only when capped) — Task 5
- ✅ `BookingFormPage` cap notice in footer — Task 6
- ✅ `TripDetailPage` uses `final_price` for "Giá khách trả" — Task 7
- ✅ `TripDetailPage` ConfirmDialog fee uses `final_price` — Task 7
- ✅ `types.d.ts` updated — Task 1

**Placeholder scan:** None found.

**Type consistency:**
- `App.Trip.discount` / `App.Trip.final_price` defined in Task 1, consumed in Task 7 — names match exactly.
- `VOUCHER_MAX_RATE = 0.10` defined in Task 5 (VoucherSheet) and Task 6 (BookingFormPage) as local constants — values identical.
- `calcDiscount()` in Task 5 returns capped value; `onSelect` callback in BookingFormPage receives this capped value via `VoucherSheet` — consistent.
