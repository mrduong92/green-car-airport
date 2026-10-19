# Affiliate (hoàn điểm, hoa hồng F1, dùng điểm, báo cáo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khách tích điểm thưởng 5% mỗi chuyến của mình + 5% chuyến của F1, dùng điểm trừ tối đa 10% khi đặt xe (tài xế vẫn nhận 80%), khách xem F1, admin xem báo cáo giới thiệu.

**Architecture:** Điểm thưởng là số dư thứ hai `wallets.reward_points` trong ví sẵn có; giao dịch gắn `balance='reward'` + `kind`. Một service `AffiliateService` gom mọi phép tính và ghi sổ (giữ / hoàn / cộng điểm, idempotent bằng "claim" UPDATE có điều kiện). Bù tài xế bằng cách giảm phí trừ lúc nhận cuốc đúng số điểm khách dùng.

**Tech Stack:** Laravel 13 / PHP 8.4 (PHPUnit, sqlite in-memory khi test), React 19 + TanStack Query + Tailwind, Chart.js (`react-chartjs-2`), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-15-affiliate-design.md`

## Global Constraints

- 1 điểm = 1.000đ. VND → điểm luôn **làm tròn xuống** (`intdiv`/`floor`) cho hoàn, hoa hồng, trần dùng điểm.
- Giá cơ sở = `price − discount` (không gồm `surcharge`, `collection_fee`).
- Mặc định: `affiliate_cashback_percent = 5`, `affiliate_commission_percent = 5`, `points_max_rate_percent = 10`; admin chỉnh ở Cài đặt.
- Hoa hồng chỉ khi người giới thiệu có `role = 'customer'` (F1 do tài xế giới thiệu: không hoa hồng).
- Giao dịch điểm thưởng: `type` chỉ `credit`/`debit`; `balance = 'reward'`; `kind ∈ {cashback, commission, spend, refund}`. **Không** ALTER ENUM (test chạy sqlite).
- Mọi chuỗi UI tiếng Việt. Không hardcode tên app (dùng `BRAND`).
- Lệnh test backend: `docker compose exec -T app php artisan test --filter=<Tên>`; pint: `docker compose exec -T app ./vendor/bin/pint <files>`. Frontend: `cd frontend && npx tsc -b --noEmit && npx eslint <files>`.
- Commit message tiếng Việt, kết bằng dòng `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Không chạy `migrate:fresh` / `db:wipe` / `make fresh` trên DB dev của người dùng (test dùng sqlite in-memory).

## Review Focus

1. **Khách huỷ đơn đã dùng điểm hai lần liên tiếp / huỷ đồng thời** → chỉ hoàn điểm một lần (claim `points_refunded_at`). Test ở Task 3.
2. **CTV vừa có ví thu hộ vừa có điểm thưởng** → trang ví CTV không cộng điểm hoàn vào "tổng thu hộ", admin reset ví CTV không đụng `reward_points`. Test ở Task 5.
3. **Số dư điểm thay đổi giữa lúc xem form và lúc đặt** (vd. vừa dùng ở đơn khác) → server dùng số dư thực, không âm, không lỗi. Test ở Task 2.
4. **Tài xế huỷ sau khi nhận đơn có dùng điểm, tài xế khác nhận lại** → điểm khách vẫn giữ; tài xế mới bị trừ phí đã giảm; không hoàn điểm. Test ở Task 4.
5. **Chuyến hoàn thành gọi lại (retry) hoặc legacy booking không có `charged_fee_points`** → không cộng điểm hai lần; legacy vẫn hoàn thành bình thường. Test ở Task 4.

---

### Task 1: Dữ liệu điểm thưởng + 3 tỷ lệ Cài đặt

**Files:**
- Create: `backend/database/migrations/2026_10_18_000001_add_affiliate_points.php`
- Modify: `backend/app/Models/Wallet.php`, `backend/app/Models/WalletTransaction.php` (fillable), `backend/app/Models/Booking.php`, `backend/app/Models/AppSetting.php`, `backend/config/business.php`, `backend/app/Http/Controllers/Admin/AppSettingController.php`
- Test: `backend/tests/Feature/AffiliateDataTest.php`, cập nhật `backend/tests/Feature/AppSettingsTest.php` nếu nó so khớp chính xác toàn bộ JSON `index`

**Interfaces:**
- Produces:
  - `Wallet::creditReward(int $points, string $kind, string $description, ?int $bookingId = null): void`
  - `Wallet::debitReward(int $points, string $kind, string $description, ?int $bookingId = null): void` (người gọi kiểm số dư; `reward_points` UNSIGNED)
  - `Booking::basePrice(): int`, `Booking::pointsDiscountVnd(): int`, `Booking::finalPrice(): int`, `Booking::driverFeePoints(float $feeRate): int`
  - `AppSetting::cashbackPercent(): float`, `AppSetting::commissionPercent(): float`, `AppSetting::pointsMaxRatePercent(): float`; hằng `AFFILIATE_CASHBACK_PERCENT = 'affiliate_cashback_percent'`, `AFFILIATE_COMMISSION_PERCENT = 'affiliate_commission_percent'`, `POINTS_MAX_RATE_PERCENT = 'points_max_rate_percent'`
  - Cột: `wallets.reward_points`, `wallet_transactions.balance`, `wallet_transactions.kind`, `bookings.points_used`, `bookings.cashback_points`, `bookings.commission_points`, `bookings.points_refunded_at`

- [ ] **Step 1: Viết test thất bại**

```php
<?php
// backend/tests/Feature/AffiliateDataTest.php
namespace Tests\Feature;

use App\Models\AppSetting;
use App\Models\Booking;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AffiliateDataTest extends TestCase
{
    use RefreshDatabase;

    public function test_reward_balance_is_separate_from_points(): void
    {
        $user = User::factory()->create(['role' => 'customer', 'is_collaborator' => true]);
        $wallet = Wallet::create(['user_id' => $user->id, 'points' => 100]);

        $wallet->creditReward(30, 'cashback', 'Hoàn 5% cuốc #1');
        $wallet->debitReward(10, 'spend', 'Dùng điểm cuốc #2');

        $wallet->refresh();
        $this->assertSame(100, $wallet->points);
        $this->assertSame(20, $wallet->reward_points);
        $this->assertDatabaseHas('wallet_transactions', ['wallet_id' => $wallet->id, 'type' => 'credit', 'balance' => 'reward', 'kind' => 'cashback', 'points' => 30]);
        $this->assertDatabaseHas('wallet_transactions', ['wallet_id' => $wallet->id, 'type' => 'debit', 'balance' => 'reward', 'kind' => 'spend', 'points' => 10]);

        $wallet->credit(5, 'Thu hộ');
        $this->assertSame('points', WalletTransaction::latest('id')->first()->balance);
    }

    public function test_booking_price_helpers(): void
    {
        $b = new Booking(['price' => 500_000, 'discount' => 50_000, 'surcharge' => 50_000, 'collection_fee' => 100_000]);
        $b->points_used = 45;

        $this->assertSame(450_000, $b->basePrice());
        $this->assertSame(45_000, $b->pointsDiscountVnd());
        $this->assertSame(500_000 - 50_000 - 45_000 + 50_000 + 100_000, $b->finalPrice());
        $this->assertSame(90 - 45, $b->driverFeePoints(0.2));
    }

    public function test_affiliate_settings_have_defaults_and_are_editable(): void
    {
        $this->assertSame(5.0, AppSetting::cashbackPercent());
        $this->assertSame(5.0, AppSetting::commissionPercent());
        $this->assertSame(10.0, AppSetting::pointsMaxRatePercent());

        $admin = User::factory()->create(['role' => 'admin']);
        $this->actingAs($admin, 'sanctum')->putJson('/api/admin/settings', [
            'contact_hotline' => '1900', 'contact_email' => 'a@b.vn', 'contact_zalo_phone' => '0900000000',
            'affiliate_cashback_percent' => 3, 'affiliate_commission_percent' => 4, 'points_max_rate_percent' => 8,
        ])->assertOk()->assertJson([
            'affiliate_cashback_percent' => 3, 'affiliate_commission_percent' => 4, 'points_max_rate_percent' => 8,
        ]);

        $this->assertSame(3.0, AppSetting::cashbackPercent());
    }
}
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `docker compose exec -T app php artisan test --filter=AffiliateDataTest`
Expected: FAIL (cột `reward_points` không tồn tại / `creditReward` undefined).

- [ ] **Step 3: Migration**

```php
<?php
// backend/database/migrations/2026_10_18_000001_add_affiliate_points.php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Điểm thưởng affiliate: số dư riêng (không lẫn điểm thu hộ CTV / điểm tài xế trả phí).
// Giao dịch giữ type credit/debit, phân loại bằng balance + kind — không ALTER ENUM vì test chạy sqlite.
return new class extends Migration {
    public function up(): void
    {
        Schema::table('wallets', function (Blueprint $t) {
            $t->unsignedInteger('reward_points')->default(0)->after('points');
        });
        Schema::table('wallet_transactions', function (Blueprint $t) {
            $t->string('balance', 10)->default('points')->after('type');
            $t->string('kind', 20)->nullable()->after('balance');
        });
        Schema::table('bookings', function (Blueprint $t) {
            $t->unsignedInteger('points_used')->default(0)->after('discount');
            $t->unsignedInteger('cashback_points')->nullable()->after('held_surcharge_points');
            $t->unsignedInteger('commission_points')->nullable()->after('cashback_points');
            $t->timestamp('points_refunded_at')->nullable()->after('commission_points');
        });
    }

    public function down(): void
    {
        Schema::table('bookings', fn (Blueprint $t) => $t->dropColumn(['points_used', 'cashback_points', 'commission_points', 'points_refunded_at']));
        Schema::table('wallet_transactions', fn (Blueprint $t) => $t->dropColumn(['balance', 'kind']));
        Schema::table('wallets', fn (Blueprint $t) => $t->dropColumn('reward_points'));
    }
};
```

- [ ] **Step 4: Model + settings**

`Wallet.php` — đổi `$fillable` thành `['user_id', 'points', 'reward_points']`, `lockedFor` tạo với `['points' => 0, 'reward_points' => 0]`, thêm sau `credit()`:

```php
    /** Điểm thưởng affiliate (hoàn / hoa hồng) — số dư riêng `reward_points`. */
    public function creditReward(int $points, string $kind, string $description, ?int $bookingId = null): void
    {
        $this->recordReward('credit', $points, $kind, $description, $bookingId);
    }

    /** Người gọi phải kiểm số dư trước: `reward_points` UNSIGNED. */
    public function debitReward(int $points, string $kind, string $description, ?int $bookingId = null): void
    {
        $this->recordReward('debit', $points, $kind, $description, $bookingId);
    }

    private function recordReward(string $type, int $points, string $kind, string $description, ?int $bookingId): void
    {
        if ($points <= 0) {
            return;
        }

        $type === 'debit' ? $this->decrement('reward_points', $points) : $this->increment('reward_points', $points);

        WalletTransaction::create([
            'wallet_id' => $this->id,
            'booking_id' => $bookingId,
            'type' => $type,
            'balance' => 'reward',
            'kind' => $kind,
            'description' => $description,
            'points' => $points,
        ]);
    }
```

`WalletTransaction.php` — thêm `'balance', 'kind'` vào `$fillable` (đọc file, giữ nguyên các field cũ).

`Booking.php` — thêm `'points_used','cashback_points','commission_points','points_refunded_at'` vào `$fillable`; casts `'points_used' => 'integer'`, `'cashback_points' => 'integer'`, `'commission_points' => 'integer'`, `'points_refunded_at' => 'datetime'`; thêm sau `appFeePoints()`:

```php
    /** Giá cơ sở cho phí app, hoàn điểm, hoa hồng: giá sau voucher (không gồm phụ phí phạt, thu hộ). */
    public function basePrice(): int
    {
        return (int) $this->price - (int) $this->discount;
    }

    public function pointsDiscountVnd(): int
    {
        return (int) $this->points_used * 1000;
    }

    /** Số tiền khách trả tài xế. Nguồn DUY NHẤT — formatBooking, formatTrip đều gọi. */
    public function finalPrice(): int
    {
        return $this->basePrice() - $this->pointsDiscountVnd() + (int) $this->surcharge + (int) ($this->collection_fee ?? 0);
    }

    /**
     * Phí app trừ tài xế lúc nhận cuốc: phí 20% trừ đi số điểm khách dùng (app bù) — tài xế thu ít
     * tiền mặt hơn đúng chừng đó nên vẫn nhận đủ 80% giá cơ sở. points_used ≤ 10% < phí nên không âm.
     */
    public function driverFeePoints(float $feeRate): int
    {
        return max(0, $this->appFeePoints($feeRate) - (int) $this->points_used);
    }
```

`config/business.php` — thêm vào mảng trả về:

```php
    'affiliate_cashback_percent'   => env('AFFILIATE_CASHBACK_PERCENT', 5),
    'affiliate_commission_percent' => env('AFFILIATE_COMMISSION_PERCENT', 5),
    'points_max_rate_percent'      => env('POINTS_MAX_RATE_PERCENT', 10),
```

`AppSetting.php` — thêm hằng và getter:

```php
    public const AFFILIATE_CASHBACK_PERCENT = 'affiliate_cashback_percent';

    public const AFFILIATE_COMMISSION_PERCENT = 'affiliate_commission_percent';

    public const POINTS_MAX_RATE_PERCENT = 'points_max_rate_percent';

    /** % giá cơ sở hoàn thành điểm thưởng cho khách khi chuyến hoàn thành. */
    public static function cashbackPercent(): float
    {
        return (float) static::get(self::AFFILIATE_CASHBACK_PERCENT, (string) config('business.affiliate_cashback_percent'));
    }

    /** % giá cơ sở chuyến của F1 cộng cho người giới thiệu (khách). */
    public static function commissionPercent(): float
    {
        return (float) static::get(self::AFFILIATE_COMMISSION_PERCENT, (string) config('business.affiliate_commission_percent'));
    }

    /** Trần dùng điểm thưởng khi đặt xe, % giá cơ sở. */
    public static function pointsMaxRatePercent(): float
    {
        return (float) static::get(self::POINTS_MAX_RATE_PERCENT, (string) config('business.points_max_rate_percent'));
    }
```

`AppSettingController` — `index()` thêm `'affiliate_cashback_percent' => AppSetting::cashbackPercent()`, `'affiliate_commission_percent' => AppSetting::commissionPercent()`, `'points_max_rate_percent' => AppSetting::pointsMaxRatePercent()`; `update()` validate `'affiliate_cashback_percent' => 'sometimes|required|numeric|min:0|max:50'`, `'affiliate_commission_percent' => 'sometimes|required|numeric|min:0|max:50'`, `'points_max_rate_percent' => 'sometimes|required|numeric|min:0|max:50'`; thêm 3 hằng vào vòng `foreach` lưu số.

- [ ] **Step 5: Chạy test**

Run: `docker compose exec -T app php artisan test --filter='AffiliateDataTest|AppSettings'`
Expected: PASS (nếu `AppSettingsTest` so khớp JSON chính xác thì cập nhật kỳ vọng thêm 3 khoá mới).

- [ ] **Step 6: Commit**

```bash
git add backend/database/migrations/2026_10_18_000001_add_affiliate_points.php backend/app/Models backend/config/business.php backend/app/Http/Controllers/Admin/AppSettingController.php backend/tests/Feature/AffiliateDataTest.php backend/tests/Feature/AppSettingsTest.php
git commit -m "feat(affiliate): số dư điểm thưởng riêng, cột điểm trên booking, 3 tỷ lệ Cài đặt"
```

---

### Task 2: AffiliateService — giữ, hoàn, cộng điểm

**Files:**
- Create: `backend/app/Services/AffiliateService.php`
- Test: `backend/tests/Feature/AffiliateServiceTest.php`

**Interfaces:**
- Consumes: Task 1 (`Wallet::creditReward/debitReward`, `Booking::basePrice`, `AppSetting::*Percent`).
- Produces (`App\Services\AffiliateService`, resolve bằng `app(AffiliateService::class)`):
  - `public static function rewardPoints(int $basePrice, float $percent): int` — `intdiv(max(0,$basePrice) * $percent / 100 ...)` làm tròn xuống theo điểm.
  - `public function spendable(User $customer, int $basePrice): int`
  - `public function hold(Booking $booking): int` — gọi trong transaction tạo đơn; trừ điểm thưởng của `customer_id`, ghi `points_used`; trả số điểm đã giữ.
  - `public function refund(Booking $booking, string $reason): int` — idempotent; trả số điểm đã hoàn (0 nếu đã hoàn / không dùng).
  - `public function settle(Booking $booking): array` — idempotent, gọi trong transaction hoàn thành; trả `['cashback' => int, 'commission' => int, 'referrer_id' => ?int]` (cả hai 0 nếu đã cộng trước đó).

- [ ] **Step 1: Viết test thất bại**

```php
<?php
// backend/tests/Feature/AffiliateServiceTest.php
namespace Tests\Feature;

use App\Models\AppSetting;
use App\Models\Booking;
use App\Models\User;
use App\Models\Wallet;
use App\Services\AffiliateService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AffiliateServiceTest extends TestCase
{
    use RefreshDatabase;

    private function svc(): AffiliateService
    {
        return app(AffiliateService::class);
    }

    private function booking(User $customer, array $over = []): Booking
    {
        return Booking::create(array_merge([
            'customer_id' => $customer->id, 'pickup' => 'Hà Nội', 'destination' => 'Sân bay Nội Bài',
            'date' => now()->addDay()->format('Y-m-d'), 'time' => '08:00', 'vehicle_type' => 'sedan_4',
            'distance_km' => 30, 'price' => 500_000, 'discount' => 50_000, 'surcharge' => 0, 'status' => 'finding_driver',
        ], $over));
    }

    private function reward(User $u): int
    {
        return (int) Wallet::where('user_id', $u->id)->value('reward_points');
    }

    public function test_reward_points_round_down(): void
    {
        $this->assertSame(22, AffiliateService::rewardPoints(450_000, 5));
        $this->assertSame(0, AffiliateService::rewardPoints(19_999, 5));
        $this->assertSame(0, AffiliateService::rewardPoints(-1000, 5));
    }

    public function test_spendable_is_min_of_balance_and_cap(): void
    {
        $c = User::factory()->create(['role' => 'customer']);
        Wallet::create(['user_id' => $c->id, 'reward_points' => 100]);
        $this->assertSame(45, $this->svc()->spendable($c, 450_000));   // trần 10% × 450k = 45 điểm
        Wallet::where('user_id', $c->id)->update(['reward_points' => 7]);
        $this->assertSame(7, $this->svc()->spendable($c, 450_000));
        $other = User::factory()->create(['role' => 'customer']);       // chưa có ví
        $this->assertSame(0, $this->svc()->spendable($other, 450_000));
    }

    public function test_hold_uses_current_balance_and_never_goes_negative(): void
    {
        $c = User::factory()->create(['role' => 'customer']);
        Wallet::create(['user_id' => $c->id, 'reward_points' => 30]);
        $b = $this->booking($c);

        $held = DB::transaction(fn () => $this->svc()->hold($b));

        $this->assertSame(30, $held);
        $this->assertSame(30, $b->fresh()->points_used);
        $this->assertSame(0, $this->reward($c));
        $this->assertDatabaseHas('wallet_transactions', ['booking_id' => $b->id, 'balance' => 'reward', 'kind' => 'spend', 'points' => 30]);
    }

    public function test_refund_once_only(): void
    {
        $c = User::factory()->create(['role' => 'customer']);
        Wallet::create(['user_id' => $c->id, 'reward_points' => 30]);
        $b = $this->booking($c);
        DB::transaction(fn () => $this->svc()->hold($b));

        $this->assertSame(30, DB::transaction(fn () => $this->svc()->refund($b->fresh(), 'khách huỷ')));
        $this->assertSame(0, DB::transaction(fn () => $this->svc()->refund($b->fresh(), 'khách huỷ')));
        $this->assertSame(0, DB::transaction(fn () => $this->svc()->refund($b, 'khách huỷ'))); // bản cũ trong bộ nhớ
        $this->assertSame(30, $this->reward($c));
    }

    public function test_settle_credits_customer_and_customer_referrer_once(): void
    {
        $referrer = User::factory()->create(['role' => 'customer']);
        $c = User::factory()->create(['role' => 'customer', 'referred_by_user_id' => $referrer->id]);
        $b = $this->booking($c, ['status' => 'completed']);

        $res = DB::transaction(fn () => $this->svc()->settle($b));
        $again = DB::transaction(fn () => $this->svc()->settle($b->fresh()));

        $this->assertSame(['cashback' => 22, 'commission' => 22, 'referrer_id' => $referrer->id], $res);
        $this->assertSame(['cashback' => 0, 'commission' => 0, 'referrer_id' => null], $again);
        $this->assertSame(22, $this->reward($c));
        $this->assertSame(22, $this->reward($referrer));
        $this->assertSame(22, $b->fresh()->cashback_points);
        $this->assertSame(22, $b->fresh()->commission_points);
    }

    public function test_driver_referrer_gets_no_commission(): void
    {
        $driver = User::factory()->create(['role' => 'driver']);
        $c = User::factory()->create(['role' => 'customer', 'referred_by_user_id' => $driver->id]);
        $b = $this->booking($c, ['status' => 'completed']);

        $res = DB::transaction(fn () => $this->svc()->settle($b));

        $this->assertSame(22, $res['cashback']);
        $this->assertSame(0, $res['commission']);
        $this->assertNull($res['referrer_id']);
        $this->assertSame(0, $this->reward($driver));
        $this->assertSame(0, $b->fresh()->commission_points);
    }

    public function test_settle_uses_current_percentages(): void
    {
        AppSetting::set(AppSetting::AFFILIATE_CASHBACK_PERCENT, '2');
        $c = User::factory()->create(['role' => 'customer']);
        $b = $this->booking($c, ['status' => 'completed']);

        $this->assertSame(9, DB::transaction(fn () => $this->svc()->settle($b))['cashback']); // 2% × 450k = 9
    }
}
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `docker compose exec -T app php artisan test --filter=AffiliateServiceTest`
Expected: FAIL (`Class "App\Services\AffiliateService" not found`).

- [ ] **Step 3: Viết service**

```php
<?php
// backend/app/Services/AffiliateService.php
namespace App\Services;

use App\Models\AppSetting;
use App\Models\Booking;
use App\Models\User;
use App\Models\Wallet;

/**
 * Điểm thưởng affiliate (spec docs/superpowers/specs/2026-10-15-affiliate-design.md):
 * hoàn cashback% cho khách + commission% cho người giới thiệu (khách) khi chuyến hoàn thành,
 * khách dùng điểm trừ tối đa max_rate% giá cơ sở khi đặt. Mọi hàm ghi sổ phải gọi trong transaction
 * của luồng gọi; hoàn và cộng đều "claim" bằng UPDATE có điều kiện để gọi lại không ghi hai lần.
 */
class AffiliateService
{
    /** Điểm = ⌊basePrice × percent% / 1000⌋ (1 điểm = 1.000đ, làm tròn xuống). */
    public static function rewardPoints(int $basePrice, float $percent): int
    {
        if ($basePrice <= 0 || $percent <= 0) {
            return 0;
        }

        return (int) floor($basePrice * $percent / 100 / 1000);
    }

    public function spendable(User $customer, int $basePrice): int
    {
        $balance = (int) Wallet::where('user_id', $customer->id)->value('reward_points');

        return min($balance, self::rewardPoints($basePrice, AppSetting::pointsMaxRatePercent()));
    }

    public function hold(Booking $booking): int
    {
        $wallet = Wallet::lockedFor($booking->customer_id);
        $points = min((int) $wallet->reward_points, self::rewardPoints($booking->basePrice(), AppSetting::pointsMaxRatePercent()));
        if ($points <= 0) {
            return 0;
        }

        $wallet->debitReward($points, 'spend', "Dùng điểm cuốc #{$booking->id}", $booking->id);
        $booking->forceFill(['points_used' => $points])->save();

        return $points;
    }

    public function refund(Booking $booking, string $reason): int
    {
        $claimed = Booking::whereKey($booking->id)
            ->where('points_used', '>', 0)
            ->whereNull('points_refunded_at')
            ->update(['points_refunded_at' => now()]);
        if ($claimed === 0) {
            return 0;
        }

        $points = (int) Booking::whereKey($booking->id)->value('points_used');
        Wallet::lockedFor($booking->customer_id)
            ->creditReward($points, 'refund', "Hoàn điểm cuốc #{$booking->id} ({$reason})", $booking->id);

        return $points;
    }

    public function settle(Booking $booking): array
    {
        $none = ['cashback' => 0, 'commission' => 0, 'referrer_id' => null];

        $base = $booking->basePrice();
        $cashback = self::rewardPoints($base, AppSetting::cashbackPercent());

        $customer = User::find($booking->customer_id);
        $referrer = $customer?->referred_by_user_id ? User::find($customer->referred_by_user_id) : null;
        $commission = $referrer && $referrer->role === 'customer'
            ? self::rewardPoints($base, AppSetting::commissionPercent())
            : 0;

        $claimed = Booking::whereKey($booking->id)
            ->whereNull('cashback_points')
            ->update(['cashback_points' => $cashback, 'commission_points' => $commission]);
        if ($claimed === 0) {
            return $none;
        }

        Wallet::lockedFor($booking->customer_id)
            ->creditReward($cashback, 'cashback', "Hoàn điểm cuốc #{$booking->id}", $booking->id);
        if ($commission > 0) {
            Wallet::lockedFor($referrer->id)
                ->creditReward($commission, 'commission', "Hoa hồng cuốc #{$booking->id} của bạn bè", $booking->id);
        }

        return ['cashback' => $cashback, 'commission' => $commission, 'referrer_id' => $commission > 0 ? $referrer->id : null];
    }
}
```

- [ ] **Step 4: Chạy test**

Run: `docker compose exec -T app php artisan test --filter=AffiliateServiceTest`
Expected: PASS (7 test).

- [ ] **Step 5: Commit**

```bash
git add backend/app/Services/AffiliateService.php backend/tests/Feature/AffiliateServiceTest.php
git commit -m "feat(affiliate): AffiliateService giữ/hoàn/cộng điểm thưởng, idempotent"
```

---

### Task 3: Đặt xe dùng điểm, giá cuối, hoàn điểm khi huỷ / hết hạn

**Files:**
- Modify: `backend/app/Http/Requests/Customer/StoreBookingRequest.php`, `backend/app/Http/Controllers/Customer/BookingController.php` (`store`, `cancel`, `formatBooking`), `backend/app/Console/Commands/ExpireStaleBookings.php`, `backend/app/Http/Controllers/Customer/StatsController.php` (`$finalPrice` SQL)
- Test: `backend/tests/Feature/BookingUsePointsTest.php`

**Interfaces:**
- Consumes: Task 2 `AffiliateService::hold/refund`, Task 1 `Booking::finalPrice/pointsDiscountVnd`.
- Produces: request field `use_points` (boolean, optional); response `formatBooking` thêm `points_used` (int), `points_discount` (int VND); `final_price` = `Booking::finalPrice()`.

- [ ] **Step 1: Viết test thất bại**

```php
<?php
// backend/tests/Feature/BookingUsePointsTest.php
namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use App\Models\Voucher;
use App\Models\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BookingUsePointsTest extends TestCase
{
    use RefreshDatabase;

    private function customer(int $reward): User
    {
        $c = User::factory()->create(['role' => 'customer']);
        Wallet::create(['user_id' => $c->id, 'reward_points' => $reward]);

        return $c;
    }

    private function payload(array $over = []): array
    {
        return array_merge([
            'pickup' => 'Hà Nội', 'destination' => 'Sân bay Nội Bài', 'date' => now()->addDay()->format('Y-m-d'),
            'time' => '08:00', 'vehicle_type' => 'sedan_4', 'distance_km' => 30, 'price' => 500_000,
        ], $over);
    }

    private function reward(User $u): int
    {
        return (int) Wallet::where('user_id', $u->id)->value('reward_points');
    }

    public function test_use_points_caps_at_10_percent_of_price_after_voucher(): void
    {
        $c = $this->customer(1000);
        Voucher::create(['code' => 'V50', 'type' => 'fixed', 'value' => 50_000, 'is_active' => true, 'expires_at' => now()->addDays(5), 'usage_count' => 0]);

        $this->actingAs($c, 'sanctum')->postJson('/api/bookings', $this->payload(['voucher_code' => 'V50', 'use_points' => true]))
            ->assertCreated()
            ->assertJson(['discount' => 50_000, 'points_used' => 45, 'points_discount' => 45_000, 'final_price' => 405_000]);

        $this->assertSame(955, $this->reward($c));
    }

    public function test_without_use_points_nothing_is_spent(): void
    {
        $c = $this->customer(1000);

        $this->actingAs($c, 'sanctum')->postJson('/api/bookings', $this->payload())
            ->assertCreated()->assertJson(['points_used' => 0, 'final_price' => 500_000]);

        $this->assertSame(1000, $this->reward($c));
    }

    public function test_use_points_with_zero_balance_books_normally(): void
    {
        $c = User::factory()->create(['role' => 'customer']); // chưa có ví

        $this->actingAs($c, 'sanctum')->postJson('/api/bookings', $this->payload(['use_points' => true]))
            ->assertCreated()->assertJson(['points_used' => 0]);
    }

    public function test_customer_cancel_refunds_points_once(): void
    {
        $c = $this->customer(1000);
        $id = $this->actingAs($c, 'sanctum')->postJson('/api/bookings', $this->payload(['use_points' => true]))->json('id');

        $this->actingAs($c, 'sanctum')->patchJson("/api/bookings/{$id}/cancel")->assertOk();
        $this->actingAs($c, 'sanctum')->patchJson("/api/bookings/{$id}/cancel")->assertStatus(422);

        $this->assertSame(1000, $this->reward($c));
        $this->assertNotNull(Booking::find($id)->points_refunded_at);
    }

    public function test_stale_booking_expiry_refunds_points(): void
    {
        $c = $this->customer(1000);
        $id = $this->actingAs($c, 'sanctum')->postJson('/api/bookings', $this->payload(['use_points' => true]))->json('id');
        Booking::whereKey($id)->update(['created_at' => now()->subHours(25)]);

        $this->artisan('bookings:expire-stale')->assertSuccessful();

        $this->assertSame('cancelled', Booking::find($id)->status);
        $this->assertSame(1000, $this->reward($c));
    }
}
```

Trước khi chạy: xác nhận route huỷ và tên lệnh hết hạn bằng `grep -n "cancel" backend/routes/api.php` và `grep -n "signature" backend/app/Console/Commands/ExpireStaleBookings.php`; nếu khác `/api/bookings/{id}/cancel` (PATCH) hoặc `bookings:expire-stale`, sửa test theo đúng route/lệnh thật (không đổi route).

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `docker compose exec -T app php artisan test --filter=BookingUsePointsTest`
Expected: FAIL (`points_used` không có trong JSON).

- [ ] **Step 3: Cài đặt**

`StoreBookingRequest::rules()` thêm `'use_points' => ['sometimes', 'boolean'],` (giữ nguyên các rule khác; nếu `bookingData()` lọc theo whitelist thì thêm `use_points` vào whitelist).

`BookingController::store` — bọc phần tạo `Booking::create([...])` trong transaction và giữ điểm ngay sau khi tạo (giữ nguyên toàn bộ logic voucher/thu hộ phía trên):

```php
        $booking = DB::transaction(function () use ($request, $data, $discount, $surcharge, $voucherId, $collectionFee, $collaboratorId) {
            $booking = Booking::create([ /* ...giữ nguyên toàn bộ mảng field hiện có... */ ]);

            if ($request->boolean('use_points')) {
                app(AffiliateService::class)->hold($booking);
            }

            return $booking;
        });
```

`BookingController::cancel` — trong closure transaction, ngay sau `$booking->update(['status' => 'cancelled', ...])`, thêm:

```php
            app(AffiliateService::class)->refund($booking, 'khách huỷ');
```

`BookingController::formatBooking` — đổi `'final_price' => ...` thành `'final_price' => $b->finalPrice(),` và thêm:

```php
            'points_used' => (int) $b->points_used,
            'points_discount' => $b->pointsDiscountVnd(),
```

`ExpireStaleBookings` — trong closure, sau `$booking->update([... 'cancelled_by' => 'system'])`:

```php
                app(AffiliateService::class)->refund($booking, 'hết hạn chưa có tài xế');
```

`StatsController` — đổi chuỗi SQL thành `'price - discount - points_used * 1000 + surcharge + COALESCE(collection_fee, 0)'` và cập nhật comment phía trên cho khớp.

Thêm `use App\Services\AffiliateService;` vào các file dùng.

- [ ] **Step 4: Chạy test**

Run: `docker compose exec -T app php artisan test --filter='BookingUsePointsTest|Booking|Voucher|CustomerStats|ExpireStale'`
Expected: PASS toàn bộ (test cũ về giảm giá / huỷ không đổi kết quả vì `points_used = 0`).

- [ ] **Step 5: Commit**

```bash
git add backend/app/Http/Requests/Customer/StoreBookingRequest.php backend/app/Http/Controllers/Customer/BookingController.php backend/app/Http/Controllers/Customer/StatsController.php backend/app/Console/Commands/ExpireStaleBookings.php backend/tests/Feature/BookingUsePointsTest.php
git commit -m "feat(affiliate): đặt xe dùng điểm (trần 10%), giá cuối trừ điểm, hoàn điểm khi khách huỷ / hết hạn"
```

---

### Task 4: Tài xế — phí nhận cuốc trừ phần điểm, hiển thị, cộng điểm khi hoàn thành

**Files:**
- Modify: `backend/app/Http/Controllers/Driver/TripController.php` (`accept`, `updateStatus` completed, `settleCompletion`, `formatTrip`), `backend/app/Notifications/TripCompletedDriverNotification.php`
- Create: `backend/app/Notifications/RewardPointsEarnedNotification.php`
- Test: `backend/tests/Feature/AffiliateTripTest.php`

**Interfaces:**
- Consumes: Task 1 `Booking::driverFeePoints/finalPrice/pointsDiscountVnd`; Task 2 `AffiliateService::settle`.
- Produces: `formatTrip` thêm `points_used` (int), `points_discount` (int VND); `app_fee` = phí VND thực trừ (= phí 20% − `points_discount`); `final_price` = `Booking::finalPrice()`; `required_points` dùng `driverFeePoints`. `RewardPointsEarnedNotification(Booking $booking, int $points, string $kind)` với `$kind ∈ {'cashback','commission'}`.

- [ ] **Step 1: Viết test thất bại**

```php
<?php
// backend/tests/Feature/AffiliateTripTest.php
namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use App\Models\Wallet;
use App\Notifications\RewardPointsEarnedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class AffiliateTripTest extends TestCase
{
    use RefreshDatabase;

    private function driver(int $points = 1000): User
    {
        $d = User::factory()->create(['role' => 'driver']);
        $d->driverProfile()->create([
            'vehicle_make' => 'Toyota', 'vehicle_model' => 'Vios', 'vehicle_plate' => '30A-'.random_int(10000, 99999),
            'vehicle_year' => 2022, 'vehicle_color' => 'Trắng', 'vehicle_type' => 'sedan_4', 'status' => 'active',
        ]);
        Wallet::create(['user_id' => $d->id, 'points' => $points]);

        return $d;
    }

    private function booking(User $customer, int $pointsUsed): Booking
    {
        return Booking::create([
            'customer_id' => $customer->id, 'pickup' => 'Hà Nội', 'destination' => 'Sân bay Nội Bài',
            'date' => now()->addDay()->format('Y-m-d'), 'time' => '08:00', 'vehicle_type' => 'sedan_4', 'distance_km' => 30,
            'price' => 500_000, 'discount' => 50_000, 'surcharge' => 0, 'points_used' => $pointsUsed, 'status' => 'finding_driver',
        ]);
    }

    private function points(User $u, string $col = 'points'): int
    {
        return (int) Wallet::where('user_id', $u->id)->value($col);
    }

    private function complete(User $d, Booking $b)
    {
        $this->actingAs($d, 'sanctum')->patchJson("/api/driver/trips/{$b->id}/status", ['status' => 'in_progress'])->assertOk();

        return $this->actingAs($d, 'sanctum')->patchJson("/api/driver/trips/{$b->id}/status", ['status' => 'completed']);
    }

    public function test_accept_charges_fee_minus_points_and_driver_nets_80_percent(): void
    {
        $d = $this->driver(1000);
        $b = $this->booking(User::factory()->create(['role' => 'customer']), 45);

        $res = $this->actingAs($d, 'sanctum')->postJson("/api/driver/trips/{$b->id}/accept")->assertOk();

        $this->assertSame(1000 - (90 - 45), $this->points($d));
        $this->assertSame(45, $b->fresh()->charged_fee_points);
        $this->assertSame(405_000, $res->json('final_price'));       // tiền mặt khách trả
        $this->assertSame(45_000, $res->json('app_fee'));            // phí thực trừ
        $this->assertSame(45, $res->json('points_used'));
        $this->assertSame(360_000, $res->json('net_earning'));       // 80% × 450k
        $this->assertSame(405_000 - 45_000, $res->json('net_earning')); // = tiền mặt − phí thực trừ
    }

    public function test_driver_cancel_keeps_customer_points_and_next_driver_pays_reduced_fee(): void
    {
        $c = User::factory()->create(['role' => 'customer']);
        Wallet::create(['user_id' => $c->id, 'reward_points' => 0]);
        $b = $this->booking($c, 45);
        $d1 = $this->driver(1000);
        $d2 = $this->driver(1000);

        $this->actingAs($d1, 'sanctum')->postJson("/api/driver/trips/{$b->id}/accept")->assertOk();
        $this->actingAs($d1, 'sanctum')->postJson("/api/driver/trips/{$b->id}/cancel", ['reason' => 'Xe hỏng'])->assertOk();
        $this->actingAs($d2, 'sanctum')->postJson("/api/driver/trips/{$b->id}/accept")->assertOk();

        $this->assertSame(45, $b->fresh()->points_used);
        $this->assertNull($b->fresh()->points_refunded_at);
        $this->assertSame(0, $this->points($c, 'reward_points'));
        $this->assertSame(1000 - 45, $this->points($d2));
    }

    public function test_completion_credits_cashback_and_commission_and_notifies(): void
    {
        Notification::fake();
        $referrer = User::factory()->create(['role' => 'customer']);
        $c = User::factory()->create(['role' => 'customer', 'referred_by_user_id' => $referrer->id]);
        $d = $this->driver(1000);
        $b = $this->booking($c, 0);
        $this->actingAs($d, 'sanctum')->postJson("/api/driver/trips/{$b->id}/accept")->assertOk();

        $this->complete($d, $b)->assertOk();

        $this->assertSame(22, $this->points($c, 'reward_points'));
        $this->assertSame(22, $this->points($referrer, 'reward_points'));
        Notification::assertSentTo($c, RewardPointsEarnedNotification::class);
        Notification::assertSentTo($referrer, RewardPointsEarnedNotification::class);
    }

    public function test_legacy_booking_without_charged_fee_completes_and_credits_once(): void
    {
        $c = User::factory()->create(['role' => 'customer']);
        $d = $this->driver(1000);
        $b = $this->booking($c, 0);
        $b->update(['driver_id' => $d->id, 'status' => 'accepted', 'accepted_at' => now()]); // nhận trước bản trừ-lúc-nhận

        $this->complete($d, $b)->assertOk();
        $this->actingAs($d, 'sanctum')->patchJson("/api/driver/trips/{$b->id}/status", ['status' => 'completed'])->assertStatus(422);

        $this->assertSame(22, $this->points($c, 'reward_points'));
    }
}
```

Trước khi chạy: xác nhận route huỷ của tài xế bằng `grep -n "trips/{" backend/routes/api.php`; nếu khác `POST /api/driver/trips/{id}/cancel` hoặc field lý do khác `reason`, sửa test theo route thật.

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `docker compose exec -T app php artisan test --filter=AffiliateTripTest`
Expected: FAIL (phí trừ 90 thay vì 45; class `RewardPointsEarnedNotification` không tồn tại).

- [ ] **Step 3: Cài đặt**

`accept()` — đổi `$feePoints = $booking->appFeePoints(AppSetting::appFeeRate());` thành:

```php
            // Khách dùng điểm thưởng → app bù cho tài xế bằng cách trừ phí ít đi đúng số điểm đó.
            $feePoints = $booking->driverFeePoints(AppSetting::appFeeRate());
```

và mô tả giao dịch phí: `'Phí app '.AppSetting::appFeePercent()."% cuốc #{$booking->id}".($booking->points_used > 0 ? " (app bù {$booking->points_used} điểm khách dùng)" : '')`.

`settleCompletion()` — ngay trước `$booking->update(['status' => 'completed']);` thêm:

```php
        $this->affiliateResult = app(AffiliateService::class)->settle($booking);
```

thêm thuộc tính `private array $affiliateResult = ['cashback' => 0, 'commission' => 0, 'referrer_id' => null];` và trong `updateStatus` nhánh `completed` (sau các notify hiện có):

```php
            if ($this->affiliateResult['cashback'] > 0) {
                $booking->customer?->notify(new RewardPointsEarnedNotification($booking, $this->affiliateResult['cashback'], 'cashback'));
            }
            if ($this->affiliateResult['referrer_id']) {
                User::find($this->affiliateResult['referrer_id'])
                    ?->notify(new RewardPointsEarnedNotification($booking, $this->affiliateResult['commission'], 'commission'));
            }
```

`formatTrip()` — thay khối tính đầu hàm và các khoá liên quan:

```php
        // Phí app chỉ tính trên giá cuốc sau voucher, KHÔNG tính trên tiền thu hộ. Khách dùng điểm thì
        // app bù: phí thực trừ giảm đúng phần điểm, tiền mặt khách trả cũng giảm đúng chừng đó.
        $effectivePrice = $b->basePrice();
        $feePercent = $this->feePercent();
        $appFee = (int) round($effectivePrice * $feePercent / 100);
        $netEarning = $effectivePrice - $appFee;
```

trong mảng trả về: `'final_price' => $b->finalPrice(),`, `'app_fee' => $appFee - $b->pointsDiscountVnd(),`, thêm `'points_used' => (int) $b->points_used,` và `'points_discount' => $b->pointsDiscountVnd(),`; `'required_points' => $b->driverFeePoints($feePercent / 100) + $b->collectionPoints() + $b->surchargePoints(),`.

`TripCompletedDriverNotification` — đổi phần tính phí trên `price` thành trên `$booking->basePrice()` (giá sau voucher), giữ nguyên nội dung chữ.

Tạo `RewardPointsEarnedNotification`:

```php
<?php
namespace App\Notifications;

use App\Channels\WebPushChannel;
use App\Models\Booking;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

class RewardPointsEarnedNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(private Booking $booking, private int $points, private string $kind) {}

    public function via($notifiable): array
    {
        return ['database', WebPushChannel::class];
    }

    private function body(): string
    {
        return $this->kind === 'commission'
            ? "+{$this->points} điểm hoa hồng từ chuyến của bạn bè bạn giới thiệu"
            : "+{$this->points} điểm hoàn từ chuyến #{$this->booking->id}";
    }

    public function toWebPush($notifiable, $notification): array
    {
        return ['title' => 'Bạn nhận điểm thưởng', 'body' => $this->body(), 'data' => ['action' => 'open_url', 'url' => '/customer/reward-wallet']];
    }

    public function toArray($notifiable): array
    {
        return ['title' => 'Bạn nhận điểm thưởng', 'body' => $this->body(), 'action' => 'open_url', 'url' => '/customer/reward-wallet', 'points' => $this->points, 'kind' => $this->kind, 'booking_id' => $this->booking->id];
    }
}
```

Kiểm `frontend/src/sw.ts` `notificationclick` đã hỗ trợ `action: 'open_url'` + `url` (có — dùng cho Cuốc Free); nếu app khách lọc URL theo whitelist thì thêm `/customer/reward-wallet`.

Thêm `use App\Models\User; use App\Services\AffiliateService; use App\Notifications\RewardPointsEarnedNotification;` vào TripController nếu chưa có.

- [ ] **Step 4: Chạy test**

Run: `docker compose exec -T app php artisan test --filter='AffiliateTripTest|Trip|CollectionFee|Collaborator|DriverReferral|Referral'`
Expected: PASS (test cũ dùng `points_used = 0` → phí và giá không đổi).

- [ ] **Step 5: Commit**

```bash
git add backend/app/Http/Controllers/Driver/TripController.php backend/app/Notifications/TripCompletedDriverNotification.php backend/app/Notifications/RewardPointsEarnedNotification.php backend/tests/Feature/AffiliateTripTest.php
git commit -m "feat(affiliate): app bù điểm khách dùng qua phí nhận cuốc; cộng hoàn + hoa hồng khi hoàn thành"
```

---

### Task 5: API khách — ví điểm thưởng, danh sách F1; ví CTV không lẫn điểm thưởng

**Files:**
- Create: `backend/app/Http/Controllers/Customer/RewardWalletController.php`, `backend/app/Http/Controllers/Customer/ReferralController.php`
- Modify: `backend/routes/api.php` (nhóm route khách, cạnh `/customer/collaborator/wallet`), `backend/app/Http/Controllers/Customer/CollaboratorWalletController.php`, `backend/app/Http/Controllers/Admin/AdminWalletController.php` (chỉ kiểm, xem Step 3)
- Test: `backend/tests/Feature/CustomerRewardApiTest.php`

**Interfaces:**
- Consumes: Task 1–4 cột/giao dịch.
- Produces:
  - `GET /api/customer/reward-wallet` → `{reward_points:int, max_rate_percent:float, cashback_percent:float, commission_percent:float}`
  - `GET /api/customer/reward-wallet/transactions?page=` → `{data:[{id,type,kind,points,description,booking_id,created_at}], next_page:int|null}` (20/trang, mới nhất trước)
  - `GET /api/customer/referrals?month=YYYY-MM` → `{total_f1:int, f1_this_month:int, monthly:[{month:'YYYY-MM', count:int}] (12 tháng gần nhất, cũ→mới), items:[{id, name:?string, phone_masked:string, registered_at:string, trips:int, spent:int, commission_points:int}]}`; `month` lọc `trips/spent/commission_points` theo tháng chuyến hoàn thành (bỏ trống = trọn đời). `phone_masked` dạng `0912***678`.

- [ ] **Step 1: Viết test thất bại**

```php
<?php
// backend/tests/Feature/CustomerRewardApiTest.php
namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CustomerRewardApiTest extends TestCase
{
    use RefreshDatabase;

    private function completed(User $c, int $price, string $at, int $commission = 0): Booking
    {
        $b = Booking::create([
            'customer_id' => $c->id, 'pickup' => 'A', 'destination' => 'B', 'date' => '2026-10-01', 'time' => '08:00',
            'vehicle_type' => 'sedan_4', 'distance_km' => 10, 'price' => $price, 'discount' => 0, 'surcharge' => 0,
            'status' => 'completed', 'cashback_points' => 0, 'commission_points' => $commission,
        ]);
        Booking::whereKey($b->id)->update(['updated_at' => $at, 'created_at' => $at]);

        return $b;
    }

    public function test_reward_wallet_and_transactions(): void
    {
        $c = User::factory()->create(['role' => 'customer']);
        $w = Wallet::create(['user_id' => $c->id, 'points' => 500, 'reward_points' => 0]);
        $w->creditReward(22, 'cashback', 'Hoàn điểm cuốc #1');
        $w->credit(400, 'Thu hộ'); // điểm thường — không được hiện ở ví thưởng

        $this->actingAs($c, 'sanctum')->getJson('/api/customer/reward-wallet')
            ->assertOk()->assertJson(['reward_points' => 22, 'max_rate_percent' => 10, 'cashback_percent' => 5, 'commission_percent' => 5]);

        $tx = $this->actingAs($c, 'sanctum')->getJson('/api/customer/reward-wallet/transactions')->assertOk()->json('data');
        $this->assertCount(1, $tx);
        $this->assertSame('cashback', $tx[0]['kind']);
    }

    public function test_reward_wallet_for_customer_without_wallet(): void
    {
        $c = User::factory()->create(['role' => 'customer']);
        $this->actingAs($c, 'sanctum')->getJson('/api/customer/reward-wallet')->assertOk()->assertJson(['reward_points' => 0]);
    }

    public function test_referrals_list_masks_phone_and_filters_by_month(): void
    {
        $me = User::factory()->create(['role' => 'customer']);
        $f1 = User::factory()->create(['role' => 'customer', 'phone' => '0912345678', 'name' => 'Lan', 'referred_by_user_id' => $me->id]);
        User::factory()->create(['role' => 'customer', 'referred_by_user_id' => $me->id]);
        User::factory()->create(['role' => 'customer']); // không phải F1
        $this->completed($f1, 500_000, '2026-09-10 10:00:00', 25);
        $this->completed($f1, 300_000, '2026-10-05 10:00:00', 15);

        $all = $this->actingAs($me, 'sanctum')->getJson('/api/customer/referrals')->assertOk();
        $all->assertJson(['total_f1' => 2]);
        $lan = collect($all->json('items'))->firstWhere('name', 'Lan');
        $this->assertSame('0912***678', $lan['phone_masked']);
        $this->assertSame(2, $lan['trips']);
        $this->assertSame(800_000, $lan['spent']);
        $this->assertSame(40, $lan['commission_points']);
        $this->assertCount(12, $all->json('monthly'));

        $oct = collect($this->actingAs($me, 'sanctum')->getJson('/api/customer/referrals?month=2026-10')->json('items'))->firstWhere('name', 'Lan');
        $this->assertSame(1, $oct['trips']);
        $this->assertSame(300_000, $oct['spent']);
        $this->assertSame(15, $oct['commission_points']);

        $this->actingAs($me, 'sanctum')->getJson('/api/customer/referrals?month=2026-13')->assertStatus(422);
    }

    public function test_collaborator_wallet_ignores_reward_transactions(): void
    {
        $ctv = User::factory()->create(['role' => 'customer', 'is_collaborator' => true]);
        $w = Wallet::create(['user_id' => $ctv->id, 'points' => 0]);
        $b = Booking::create([
            'customer_id' => $ctv->id, 'collaborator_id' => $ctv->id, 'pickup' => 'A', 'destination' => 'B', 'date' => '2026-10-01',
            'time' => '08:00', 'vehicle_type' => 'sedan_4', 'distance_km' => 10, 'price' => 500_000, 'discount' => 0, 'surcharge' => 0,
            'collection_fee' => 100_000, 'status' => 'completed',
        ]);
        $w->credit(100, "Thu hộ cuốc #{$b->id}", $b->id);
        $w->creditReward(25, 'cashback', "Hoàn điểm cuốc #{$b->id}", $b->id);

        $this->actingAs($ctv, 'sanctum')->getJson('/api/customer/collaborator/wallet')->assertOk()->assertJson(['points' => 100, 'total_earned' => 100]);
        $this->assertCount(1, $this->actingAs($ctv, 'sanctum')->getJson('/api/customer/collaborator/wallet/transactions')->json());
    }
}
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `docker compose exec -T app php artisan test --filter=CustomerRewardApiTest`
Expected: FAIL (404 route; CTV `total_earned` = 125).

- [ ] **Step 3: Cài đặt**

`RewardWalletController`:

```php
<?php
namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Controller;
use App\Models\AppSetting;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

// Ví điểm thưởng affiliate của khách (hoàn / hoa hồng / dùng / hoàn lại) — tách khỏi ví thu hộ CTV.
class RewardWalletController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        return response()->json([
            'reward_points' => (int) Wallet::where('user_id', $request->user()->id)->value('reward_points'),
            'max_rate_percent' => AppSetting::pointsMaxRatePercent(),
            'cashback_percent' => AppSetting::cashbackPercent(),
            'commission_percent' => AppSetting::commissionPercent(),
        ]);
    }

    public function transactions(Request $request): JsonResponse
    {
        $walletId = Wallet::where('user_id', $request->user()->id)->value('id');
        if (! $walletId) {
            return response()->json(['data' => [], 'next_page' => null]);
        }

        $page = WalletTransaction::where('wallet_id', $walletId)->where('balance', 'reward')
            ->orderByDesc('id')->paginate(20);

        return response()->json([
            'data' => collect($page->items())->map(fn ($t) => [
                'id' => $t->id, 'type' => $t->type, 'kind' => $t->kind, 'points' => $t->points,
                'description' => $t->description, 'booking_id' => $t->booking_id, 'created_at' => $t->created_at?->toISOString(),
            ])->values(),
            'next_page' => $page->hasMorePages() ? $page->currentPage() + 1 : null,
        ]);
    }
}
```

`ReferralController`:

```php
<?php
namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

// F1 của khách: khách đăng ký bằng mã/SĐT của người này. Số liệu chuyến tính theo tháng HOÀN THÀNH
// (updated_at của booking completed) — cùng mốc với hoa hồng được cộng.
class ReferralController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate(['month' => ['nullable', 'date_format:Y-m']]);
        $me = $request->user();

        $f1 = User::where('referred_by_user_id', $me->id)->where('role', 'customer')->orderByDesc('id')
            ->get(['id', 'name', 'phone', 'created_at']);

        $trips = Booking::whereIn('customer_id', $f1->pluck('id'))->where('status', 'completed')
            ->when($data['month'] ?? null, function ($q, $month) {
                $start = Carbon::createFromFormat('Y-m', $month)->startOfMonth();
                $q->whereBetween('updated_at', [$start, $start->copy()->endOfMonth()]);
            })
            ->selectRaw('customer_id, COUNT(*) AS trips, SUM(price - discount) AS spent, SUM(COALESCE(commission_points, 0)) AS commission')
            ->groupBy('customer_id')->get()->keyBy('customer_id');

        $monthly = collect(range(11, 0))->map(function ($ago) use ($f1) {
            $m = now()->startOfMonth()->subMonths($ago);

            return ['month' => $m->format('Y-m'), 'count' => $f1->filter(fn ($u) => $u->created_at?->format('Y-m') === $m->format('Y-m'))->count()];
        })->values();

        return response()->json([
            'total_f1' => $f1->count(),
            'f1_this_month' => $f1->filter(fn ($u) => $u->created_at?->isSameMonth(now()))->count(),
            'monthly' => $monthly,
            'items' => $f1->map(fn ($u) => [
                'id' => $u->id,
                'name' => $u->name,
                'phone_masked' => self::mask($u->phone),
                'registered_at' => $u->created_at?->toISOString(),
                'trips' => (int) ($trips[$u->id]->trips ?? 0),
                'spent' => (int) ($trips[$u->id]->spent ?? 0),
                'commission_points' => (int) ($trips[$u->id]->commission ?? 0),
            ])->values(),
        ]);
    }

    /** 0912345678 → 0912***678 */
    public static function mask(?string $phone): string
    {
        $p = (string) $phone;

        return strlen($p) >= 8 ? substr($p, 0, 4).'***'.substr($p, -3) : '***';
    }
}
```

`routes/api.php` (nhóm khách, cạnh route collaborator wallet; import 2 controller):

```php
        Route::get('/customer/reward-wallet', [RewardWalletController::class, 'show']);
        Route::get('/customer/reward-wallet/transactions', [RewardWalletController::class, 'transactions']);
        Route::get('/customer/referrals', [ReferralController::class, 'index']);
```

`CollaboratorWalletController` — thêm `->where('balance', 'points')` vào CẢ truy vấn `total_earned` trong `show()` VÀ truy vấn danh sách trong `transactions()`.

`AdminWalletController` — đọc `resetPoints`/`deductPoints`: phải chỉ thao tác cột `points` và ghi giao dịch có `balance` mặc định `points`. Nếu đúng vậy thì không sửa; nếu có truy vấn tổng hợp giao dịch theo ví (không lọc balance) thì thêm `->where('balance', 'points')`.

- [ ] **Step 4: Chạy test**

Run: `docker compose exec -T app php artisan test --filter='CustomerRewardApiTest|CollaboratorWallet|AdminWallet'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/Http/Controllers/Customer backend/routes/api.php backend/app/Http/Controllers/Admin/AdminWalletController.php backend/tests/Feature/CustomerRewardApiTest.php
git commit -m "feat(affiliate): API ví điểm thưởng và danh sách F1 cho khách; ví CTV không lẫn điểm thưởng"
```

---

### Task 6: API admin — báo cáo giới thiệu

**Files:**
- Create: `backend/app/Http/Controllers/Admin/ReferralReportController.php`
- Modify: `backend/routes/api.php` (nhóm `role:admin`, cạnh `/admin/revenue`)
- Test: `backend/tests/Feature/AdminReferralReportTest.php`

**Interfaces:**
- Produces:
  - `GET /api/admin/referrals?month=YYYY-MM` (mặc định tháng hiện tại) → `{month, top:[{id, name, phone, f1_total:int, f1_revenue:int, commission_points:int}] (≤10, sắp theo f1_revenue giảm dần, chỉ người giới thiệu role customer), monthly:[{month, f1_registered:int, f1_revenue:int, reward_points:int}] (12 tháng, cũ→mới)}`. F1 = khách có người giới thiệu là khách. `f1_revenue` = Σ(price−discount) chuyến completed của F1 trong tháng; `reward_points` = Σ(cashback_points + commission_points) chuyến completed trong tháng (mọi khách).
  - `GET /api/admin/referrals/{user}` → `{id, name, phone, f1:[{id, name, phone, registered_at, trips:int, spent:int, commission_points:int}]}` (trọn đời; SĐT KHÔNG che cho admin).

- [ ] **Step 1: Viết test thất bại**

```php
<?php
// backend/tests/Feature/AdminReferralReportTest.php
namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminReferralReportTest extends TestCase
{
    use RefreshDatabase;

    private function trip(User $c, int $price, string $at, int $cashback = 0, int $commission = 0): void
    {
        $b = Booking::create([
            'customer_id' => $c->id, 'pickup' => 'A', 'destination' => 'B', 'date' => '2026-10-01', 'time' => '08:00',
            'vehicle_type' => 'sedan_4', 'distance_km' => 10, 'price' => $price, 'discount' => 0, 'surcharge' => 0,
            'status' => 'completed', 'cashback_points' => $cashback, 'commission_points' => $commission,
        ]);
        Booking::whereKey($b->id)->update(['updated_at' => $at]);
    }

    public function test_top_referrers_monthly_and_detail(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $a = User::factory()->create(['role' => 'customer', 'name' => 'A']);
        $b = User::factory()->create(['role' => 'customer', 'name' => 'B']);
        $driver = User::factory()->create(['role' => 'driver']);
        $a1 = User::factory()->create(['role' => 'customer', 'referred_by_user_id' => $a->id, 'created_at' => '2026-10-02']);
        $b1 = User::factory()->create(['role' => 'customer', 'referred_by_user_id' => $b->id, 'created_at' => '2026-09-02']);
        $d1 = User::factory()->create(['role' => 'customer', 'referred_by_user_id' => $driver->id, 'created_at' => '2026-10-03']);
        $this->trip($a1, 300_000, '2026-10-10 09:00:00', 15, 15);
        $this->trip($b1, 900_000, '2026-10-11 09:00:00', 45, 45);
        $this->trip($b1, 500_000, '2026-09-11 09:00:00', 25, 25);
        $this->trip($d1, 1_000_000, '2026-10-12 09:00:00', 50, 0);

        $res = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/referrals?month=2026-10')->assertOk();

        $this->assertSame(['B', 'A'], collect($res->json('top'))->pluck('name')->all()); // tài xế không vào top
        $this->assertSame(900_000, $res->json('top.0.f1_revenue'));
        $oct = collect($res->json('monthly'))->firstWhere('month', '2026-10');
        $this->assertSame(1, $oct['f1_registered']);        // a1 (d1 do tài xế giới thiệu — không phải F1)
        $this->assertSame(1_200_000, $oct['f1_revenue']);   // a1 300k + b1 900k (d1 không tính)
        $this->assertSame(15 + 15 + 45 + 45 + 50, $oct['reward_points']);

        $detail = $this->actingAs($admin, 'sanctum')->getJson("/api/admin/referrals/{$b->id}")->assertOk();
        $this->assertSame(2, $detail->json('f1.0.trips'));
        $this->assertSame(1_400_000, $detail->json('f1.0.spent'));

        $this->actingAs($a, 'sanctum')->getJson('/api/admin/referrals')->assertForbidden();
    }
}
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `docker compose exec -T app php artisan test --filter=AdminReferralReportTest`
Expected: FAIL (404).

- [ ] **Step 3: Cài đặt**

```php
<?php
namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

// Báo cáo giới thiệu (CR affiliate mục 6): top 10 người giới thiệu theo doanh số F1 trong tháng,
// số F1 đăng ký + doanh số F1 + điểm thưởng đã phát theo 12 tháng, chi tiết một người giới thiệu.
// Doanh số = Σ(price − discount) chuyến completed, theo tháng hoàn thành (updated_at).
class ReferralReportController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate(['month' => ['nullable', 'date_format:Y-m']]);
        $start = isset($data['month']) ? Carbon::createFromFormat('Y-m', $data['month'])->startOfMonth() : now()->startOfMonth();
        $end = $start->copy()->endOfMonth();

        $f1Revenue = Booking::query()
            ->join('users as f1', 'f1.id', '=', 'bookings.customer_id')
            ->join('users as ref', 'ref.id', '=', 'f1.referred_by_user_id')
            ->where('ref.role', 'customer')
            ->where('bookings.status', 'completed')
            ->whereBetween('bookings.updated_at', [$start, $end])
            ->groupBy('ref.id')
            ->selectRaw('ref.id AS id, SUM(bookings.price - bookings.discount) AS revenue, SUM(COALESCE(bookings.commission_points, 0)) AS commission')
            ->orderByDesc('revenue')->limit(10)->get();

        $referrers = User::whereIn('id', $f1Revenue->pluck('id'))->withCount(['referrals as f1_total' => fn ($q) => $q->where('role', 'customer')])
            ->get(['id', 'name', 'phone'])->keyBy('id');

        $top = $f1Revenue->map(fn ($r) => [
            'id' => (int) $r->id,
            'name' => $referrers[$r->id]->name ?? null,
            'phone' => $referrers[$r->id]->phone ?? null,
            'f1_total' => (int) ($referrers[$r->id]->f1_total ?? 0),
            'f1_revenue' => (int) $r->revenue,
            'commission_points' => (int) $r->commission,
        ])->values();

        $monthly = collect(range(11, 0))->map(function ($ago) use ($start) {
            $m = $start->copy()->subMonths($ago);
            $mEnd = $m->copy()->endOfMonth();

            $completed = Booking::where('status', 'completed')->whereBetween('updated_at', [$m, $mEnd]);
            // F1 = khách do một KHÁCH giới thiệu (spec) — khách do tài xế giới thiệu không tính.
            $f1 = fn () => User::where('role', 'customer')->whereHas('referredBy', fn ($q) => $q->where('role', 'customer'));

            return [
                'month' => $m->format('Y-m'),
                'f1_registered' => $f1()->whereBetween('created_at', [$m, $mEnd])->count(),
                'f1_revenue' => (int) (clone $completed)->whereIn('customer_id', $f1()->select('id'))->sum(DB::raw('price - discount')),
                'reward_points' => (int) (clone $completed)->sum(DB::raw('COALESCE(cashback_points, 0) + COALESCE(commission_points, 0)')),
            ];
        })->values();

        return response()->json(['month' => $start->format('Y-m'), 'top' => $top, 'monthly' => $monthly]);
    }

    public function show(User $user): JsonResponse
    {
        $f1 = User::where('referred_by_user_id', $user->id)->where('role', 'customer')->orderByDesc('id')->get(['id', 'name', 'phone', 'created_at']);
        $trips = Booking::whereIn('customer_id', $f1->pluck('id'))->where('status', 'completed')
            ->selectRaw('customer_id, COUNT(*) AS trips, SUM(price - discount) AS spent, SUM(COALESCE(commission_points, 0)) AS commission')
            ->groupBy('customer_id')->get()->keyBy('customer_id');

        return response()->json([
            'id' => $user->id, 'name' => $user->name, 'phone' => $user->phone,
            'f1' => $f1->map(fn ($u) => [
                'id' => $u->id, 'name' => $u->name, 'phone' => $u->phone, 'registered_at' => $u->created_at?->toISOString(),
                'trips' => (int) ($trips[$u->id]->trips ?? 0), 'spent' => (int) ($trips[$u->id]->spent ?? 0),
                'commission_points' => (int) ($trips[$u->id]->commission ?? 0),
            ])->values(),
        ]);
    }
}
```

Thêm vào `User.php` (nếu chưa có quan hệ ngược của `referredBy`):

```php
    public function referrals()
    {
        return $this->hasMany(User::class, 'referred_by_user_id');
    }
```

Thêm `use Illuminate\Support\Facades\DB;` ở đầu controller. Route trong nhóm admin:

```php
        Route::get('/admin/referrals', [ReferralReportController::class, 'index']);
        Route::get('/admin/referrals/{user}', [ReferralReportController::class, 'show']);
```

- [ ] **Step 4: Chạy test**

Run: `docker compose exec -T app php artisan test --filter=AdminReferralReportTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/Http/Controllers/Admin/ReferralReportController.php backend/app/Models/User.php backend/routes/api.php backend/tests/Feature/AdminReferralReportTest.php
git commit -m "feat(affiliate): báo cáo giới thiệu cho admin — top 10, F1 và doanh số F1 theo tháng"
```

---

### Task 7: App khách — Ví điểm, công tắc Dùng điểm, dòng điểm, Bạn bè đã giới thiệu

**Files:**
- Create: `frontend/src/api/rewards.ts`, `frontend/src/pages/customer/RewardWalletPage.tsx`, `frontend/src/pages/customer/ReferralsPage.tsx`
- Modify: `frontend/src/router/customer.tsx`, `frontend/src/pages/customer/BookingFormPage.tsx`, `frontend/src/pages/customer/BookingStatusPage.tsx`, `frontend/src/pages/customer/ProfilePage.tsx`, `frontend/src/types.d.ts` (thêm `points_used`, `points_discount` vào kiểu booking khách nếu kiểu đó khai báo ở đây)
- Test: `frontend/e2e/affiliate.spec.ts`

**Interfaces:**
- Consumes: API Task 3 (`use_points`, `points_used`, `points_discount`), Task 5.
- Produces: route `/customer/reward-wallet`, `/customer/referrals`.

- [ ] **Step 1: Viết e2e thất bại**

Đọc `frontend/e2e/fixtures/auth.ts` (`loginExisting`, `stubGoong`, `createBooking` nếu có) và `frontend/e2e/fixtures/testData.ts` để dùng đúng helper. Seed điểm thưởng cho khách seed bằng API admin không có → dùng lệnh tinker trong container (test e2e chạy trên DB dev local):

```ts
// frontend/e2e/affiliate.spec.ts
import { test, expect } from '@playwright/test'
import { execSync } from 'node:child_process'
import { APP, SEEDED } from './fixtures/testData'
import { loginExisting, stubGoong } from './fixtures/auth'

// Đặt số dư điểm thưởng cho khách seed (DB dev local, không phải sqlite test).
function setReward(phone: string, points: number) {
  execSync(`docker compose exec -T app php artisan tinker --execute="\\$u=App\\Models\\User::where('phone','${phone}')->where('role','customer')->first(); App\\Models\\Wallet::updateOrCreate(['user_id'=>\\$u->id],[])->update(['reward_points'=>${points}]);"`, { cwd: '..' })
}

test('khách có điểm bật "Dùng điểm" → tổng tiền giảm, đơn có dòng điểm; trang Ví điểm và Bạn bè', async ({ page }) => {
  setReward(SEEDED.customer, 500)
  await stubGoong(page)
  await loginExisting(page, APP.customer, SEEDED.customer)
  await expect(page).toHaveURL(/\/customer\/booking/)

  // Điền form đặt xe như createBooking của fixtures (điểm đón, điểm đến, giá) — dùng đúng helper/selector có sẵn.
  // Sau khi có giá:
  const toggle = page.getByTestId('use-points-toggle')
  await expect(toggle).toBeVisible()
  const totalBefore = await page.getByTestId('booking-total').textContent()
  await toggle.click()
  await expect(page.getByTestId('booking-total')).not.toHaveText(totalBefore ?? '')
  await page.getByRole('button', { name: /Đặt xe/ }).click()
  await expect(page.getByTestId('booking-points-line')).toBeVisible()

  await page.goto(`${APP.customer}/customer/reward-wallet`)
  await expect(page.getByTestId('reward-balance')).toBeVisible()
  await expect(page.getByText('Dùng điểm cuốc')).toBeVisible()

  await page.goto(`${APP.customer}/customer/referrals`)
  await expect(page.getByTestId('referrals-total')).toBeVisible()
})
```

Nếu fixtures đã có helper điền form đặt xe (vd. `createBooking(page)` chỉ điền rồi bấm), tách phần điền thành helper `fillBookingForm(page)` trong `fixtures` và dùng ở đây trước khi bật công tắc.

- [ ] **Step 2: Chạy e2e, xác nhận thất bại**

Run: `cd frontend && npx playwright test e2e/affiliate.spec.ts`
Expected: FAIL (không có `use-points-toggle`).

- [ ] **Step 3: Cài đặt**

`api/rewards.ts`:

```ts
import api from './axios'

export interface RewardWallet {
  reward_points: number
  max_rate_percent: number
  cashback_percent: number
  commission_percent: number
}

export interface RewardTransaction {
  id: number
  type: 'credit' | 'debit'
  kind: 'cashback' | 'commission' | 'spend' | 'refund'
  points: number
  description: string
  booking_id: number | null
  created_at: string
}

export interface ReferralItem {
  id: number
  name: string | null
  phone_masked: string
  registered_at: string
  trips: number
  spent: number
  commission_points: number
}

export interface ReferralSummary {
  total_f1: number
  f1_this_month: number
  monthly: { month: string; count: number }[]
  items: ReferralItem[]
}

export const getRewardWallet = () => api.get<RewardWallet>('/customer/reward-wallet')
export const getRewardTransactions = (page = 1) =>
  api.get<{ data: RewardTransaction[]; next_page: number | null }>('/customer/reward-wallet/transactions', { params: { page } })
export const getReferrals = (month?: string) =>
  api.get<ReferralSummary>('/customer/referrals', { params: month ? { month } : {} })

/** Trần điểm dùng được cho một chuyến — cùng công thức với AffiliateService::spendable (làm tròn xuống). */
export const spendablePoints = (balance: number, basePrice: number, maxRatePercent: number) =>
  Math.max(0, Math.min(balance, Math.floor((basePrice * maxRatePercent) / 100 / 1000)))
```

`BookingFormPage.tsx`:
- `const { data: rewardWallet } = useQuery({ queryKey: ['reward-wallet'], queryFn: () => getRewardWallet().then((r) => r.data) })`
- `const [usePoints, setUsePoints] = useState(false)`
- `const pointsToUse = usePoints && rewardWallet ? spendablePoints(rewardWallet.reward_points, Math.max(0, price - discount), rewardWallet.max_rate_percent) : 0`
- đổi `const total = Math.max(0, price - discount) + collectionFee` thành `const total = Math.max(0, price - discount) - pointsToUse * 1000 + collectionFee`
- payload `mutationFn` thêm `use_points: pointsToUse > 0 ? true : undefined,`
- `onSuccess` thêm `queryClient.invalidateQueries({ queryKey: ['reward-wallet'] })`
- ngay sau `<VoucherSheet ... />`, trước khối "GHI CHÚ CHO TÀI XẾ", chèn (ẩn khi số dư 0):

```tsx
        {rewardWallet && rewardWallet.reward_points > 0 && (
          <label className="mt-3 bg-white rounded-card shadow-card border border-border-soft px-4 py-3 flex items-center gap-3 cursor-pointer">
            <span className="material-symbols-outlined text-gold" style={{ fontVariationSettings: "'FILL' 1" }}>stars</span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-navy">Dùng điểm thưởng</span>
              <span className="block text-[12px] text-neutral-gray">
                Có {rewardWallet.reward_points.toLocaleString('vi-VN')} điểm · tối đa {rewardWallet.max_rate_percent}% giá chuyến
              </span>
            </span>
            {pointsToUse > 0 && <span className="text-sm font-semibold text-primary whitespace-nowrap">−{(pointsToUse * 1000).toLocaleString('vi-VN')}đ</span>}
            <input type="checkbox" data-testid="use-points-toggle" className="w-5 h-5 accent-primary"
              checked={usePoints} onChange={(e) => setUsePoints(e.target.checked)} />
          </label>
        )}
```

- footer tổng tiền: gắn `data-testid="booking-total"` lên phần tử hiển thị `total`; nếu `pointsToUse > 0` thêm dòng nhỏ "Đã trừ {pointsToUse} điểm".

`BookingStatusPage.tsx` — trong bảng giá (sau dòng voucher), khi `booking.points_used > 0`:

```tsx
            {booking.points_used > 0 && (
              <div data-testid="booking-points-line" className="flex justify-between text-sm">
                <span className="text-neutral-gray">Điểm thưởng ({booking.points_used} điểm)</span>
                <span className="text-primary font-medium">−{booking.points_discount.toLocaleString('vi-VN')}đ</span>
              </div>
            )}
```

(theo đúng class/markup các dòng giá sẵn có trong file).

`RewardWalletPage.tsx` — trang có header như các trang khách khác: thẻ số dư `data-testid="reward-balance"` (số điểm + "≈ {điểm×1000}đ"), dòng giải thích "Hoàn {cashback_percent}% mỗi chuyến · nhận {commission_percent}% chuyến của bạn bè bạn giới thiệu · dùng tối đa {max_rate_percent}% giá mỗi chuyến", danh sách giao dịch dùng `useInfiniteQuery` với `getRewardTransactions` (mỗi dòng: icon theo `kind` — cashback `savings`, commission `group_add`, spend `shopping_cart`, refund `undo`; `description`; ngày `dd/MM/yyyy HH:mm`; `+`/`−` theo `type`, màu `text-success-green`/`text-danger-red`), nút "Xem thêm" khi `next_page`, `EmptyState` khi trống ("Chưa có điểm thưởng — hoàn thành chuyến để nhận điểm").

`ReferralsPage.tsx` — header "Bạn bè đã giới thiệu"; 2 thẻ số `data-testid="referrals-total"` (Tổng F1 = `total_f1`) và "Tháng này" (`f1_this_month`); biểu đồ cột nhỏ 12 tháng bằng `react-chartjs-2` `Bar` (nhãn `MM/YY`, dữ liệu `monthly.count`, màu `#006a36`, cùng cách đăng ký Chart.js như `pages/admin/RevenuePage.tsx`); bộ chọn tháng `<input type="month">` (trống = trọn đời) truyền vào `getReferrals(month)`; danh sách F1: tên (hoặc "Khách hàng"), `phone_masked`, "Đăng ký dd/MM/yyyy", "{trips} chuyến · {spent}đ · +{commission_points} điểm"; `EmptyState` khi chưa có F1 ("Chia sẻ số điện thoại của bạn để mời bạn bè").

`router/customer.tsx` — thêm 2 route trong nhóm `CustomerLayout`:

```tsx
          { path: '/customer/reward-wallet', element: <RewardWalletPage /> },
          { path: '/customer/referrals', element: <ReferralsPage /> },
```

`ProfilePage.tsx` (khách) — thêm thẻ/menu "Ví điểm thưởng" (hiện số dư từ `getRewardWallet`, `Link` tới `/customer/reward-wallet`) phía trên mục "Giới thiệu bạn bè"; trong bottom sheet "Giới thiệu bạn bè" thêm nút "Xem bạn bè đã giới thiệu" → `/customer/referrals`; sửa câu chia sẻ để nêu hoa hồng điểm (vd. "Đăng ký {BRAND.name} bằng số điện thoại của tôi để nhận ưu đãi").

- [ ] **Step 4: Kiểm tra**

Run: `cd frontend && npx tsc -b --noEmit && npx eslint src/api/rewards.ts src/pages/customer/RewardWalletPage.tsx src/pages/customer/ReferralsPage.tsx src/pages/customer/BookingFormPage.tsx src/pages/customer/BookingStatusPage.tsx src/pages/customer/ProfilePage.tsx src/router/customer.tsx && npx playwright test e2e/affiliate.spec.ts`
Expected: tsc/eslint sạch (trừ lỗi có sẵn trên main không thuộc dòng sửa); e2e PASS. Nếu e2e bị chặn ở bước OTP/môi trường local (`APP_ENV=staging`), ghi rõ trong báo cáo kèm bước dừng.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/rewards.ts frontend/src/pages/customer frontend/src/router/customer.tsx frontend/src/types.d.ts frontend/e2e/affiliate.spec.ts frontend/e2e/fixtures
git commit -m "feat(affiliate): app khách — Ví điểm, công tắc Dùng điểm, dòng điểm trên chuyến, trang Bạn bè đã giới thiệu"
```

---

### Task 8: App tài xế + admin — dòng điểm khách dùng, trang Giới thiệu, 3 ô Cài đặt

**Files:**
- Create: `frontend/src/api/adminReferrals.ts`, `frontend/src/pages/admin/ReferralsPage.tsx`
- Modify: `frontend/src/pages/driver/TripDetailPage.tsx`, `frontend/src/types.d.ts` (kiểu trip tài xế: `points_used`, `points_discount`), `frontend/src/router/admin.tsx`, `frontend/src/layouts/AdminLayout.tsx`, `frontend/src/api/settings.ts`, `frontend/src/pages/admin/SettingsPage.tsx`
- Test: thêm vào `frontend/e2e/affiliate.spec.ts`

**Interfaces:**
- Consumes: Task 4 (`points_used`, `points_discount`, `app_fee` đã trừ), Task 6 API, Task 1 settings keys.

- [ ] **Step 1: Viết e2e thất bại** (thêm test vào `affiliate.spec.ts`)

```ts
test('admin xem trang Giới thiệu và chỉnh 3 tỷ lệ điểm', async ({ page }) => {
  await loginExisting(page, APP.admin, SEEDED.admin)
  await page.getByRole('link', { name: 'Giới thiệu' }).click()
  await expect(page.getByTestId('referral-report-top')).toBeVisible()
  await expect(page.getByTestId('referral-report-chart')).toBeVisible()

  await page.goto(`${APP.admin}/settings`)
  await expect(page.getByLabel('% hoàn điểm cho khách')).toBeVisible()
  await expect(page.getByLabel('% hoa hồng giới thiệu')).toBeVisible()
  await expect(page.getByLabel('% tối đa trừ bằng điểm')).toBeVisible()
})
```

Xác nhận `APP.admin` / `SEEDED.admin` và cách đăng nhập admin trong `fixtures/testData.ts` + `fixtures/auth.ts`; dùng đúng helper có sẵn (vd. `loginAdmin`).

- [ ] **Step 2: Chạy e2e, xác nhận thất bại**

Run: `cd frontend && npx playwright test e2e/affiliate.spec.ts -g "admin"`
Expected: FAIL (không có link "Giới thiệu").

- [ ] **Step 3: Cài đặt**

`TripDetailPage.tsx` (tài xế) — trong khối giá (cạnh dòng phí app hiện có ~:212), khi `trip.points_used > 0`:

```tsx
            {trip.points_used > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-neutral-gray">Khách dùng {trip.points_used} điểm — app bù</span>
                <span className="text-navy font-medium">{trip.points_discount.toLocaleString('vi-VN')}đ</span>
              </div>
            )}
```

(phí app hiển thị đã là số thực trừ vì backend trả `app_fee` đã giảm).

`api/adminReferrals.ts`:

```ts
import api from './axios'

export interface ReferralTopRow { id: number; name: string | null; phone: string | null; f1_total: number; f1_revenue: number; commission_points: number }
export interface ReferralMonthRow { month: string; f1_registered: number; f1_revenue: number; reward_points: number }
export interface ReferralReport { month: string; top: ReferralTopRow[]; monthly: ReferralMonthRow[] }
export interface ReferrerDetail {
  id: number; name: string | null; phone: string
  f1: { id: number; name: string | null; phone: string; registered_at: string; trips: number; spent: number; commission_points: number }[]
}

export const getReferralReport = (month?: string) => api.get<ReferralReport>('/admin/referrals', { params: month ? { month } : {} })
export const getReferrerDetail = (id: number) => api.get<ReferrerDetail>(`/admin/referrals/${id}`)
```

`pages/admin/ReferralsPage.tsx` — theo bố cục `RevenuePage.tsx` (tiêu đề "Giới thiệu", `<input type="month">` mặc định tháng hiện tại):
- Biểu đồ `data-testid="referral-report-chart"`: `react-chartjs-2` `Bar` 12 tháng, 2 dataset — "F1 đăng ký" (`f1_registered`, trục trái) và "Doanh số F1" (`f1_revenue`, trục phải, đơn vị đ); dưới biểu đồ dòng "Điểm thưởng đã phát tháng này: {reward_points của tháng chọn} điểm".
- Bảng top 10 `data-testid="referral-report-top"`: hạng, tên, SĐT, tổng F1, doanh số F1 tháng (đ), hoa hồng (điểm); bấm một dòng mở panel/modal chi tiết gọi `getReferrerDetail` (bảng F1: tên, SĐT, ngày đăng ký, số chuyến, chi tiêu, hoa hồng). `EmptyState` khi tháng chưa có dữ liệu.

`router/admin.tsx` — thêm `{ path: '/referrals', element: <ReferralsPage /> }` (import trang).
`AdminLayout.tsx` — thêm vào mảng menu sau "Doanh thu": `{ to: '/referrals', icon: 'group_add', label: 'Giới thiệu' },`.

`api/settings.ts` — thêm vào `AdminSettings`: `affiliate_cashback_percent: number; affiliate_commission_percent: number; points_max_rate_percent: number`.
`SettingsPage.tsx` — thêm 3 field vào zod schema (`z.coerce.number().min(0).max(50)`), `defaultValues`, và 3 ô nhập cùng kiểu ô `app_fee_percent` hiện có, nhóm dưới tiêu đề "Chương trình điểm thưởng", mỗi ô có `<label htmlFor>` khớp: "% hoàn điểm cho khách", "% hoa hồng giới thiệu", "% tối đa trừ bằng điểm".

- [ ] **Step 4: Kiểm tra**

Run: `cd frontend && npx tsc -b --noEmit && npx eslint src/api/adminReferrals.ts src/pages/admin/ReferralsPage.tsx src/pages/admin/SettingsPage.tsx src/pages/driver/TripDetailPage.tsx src/router/admin.tsx src/layouts/AdminLayout.tsx src/api/settings.ts && npx playwright test e2e/affiliate.spec.ts`
Expected: sạch; e2e PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/adminReferrals.ts frontend/src/pages/admin frontend/src/pages/driver/TripDetailPage.tsx frontend/src/router/admin.tsx frontend/src/layouts/AdminLayout.tsx frontend/src/api/settings.ts frontend/src/types.d.ts frontend/e2e/affiliate.spec.ts
git commit -m "feat(affiliate): tài xế thấy điểm khách dùng; admin trang Giới thiệu + 3 tỷ lệ điểm ở Cài đặt"
```

---

### Task 9: Tài liệu chính sách + chạy toàn bộ test

**Files:**
- Modify: `docs/specs/affiliate-policy.md`, `docs/CR/2026-10-04-CR-affiliate.md` (cột Trạng thái mục 1, 2, 5, 6 → "Đã làm — PR …")

- [ ] **Step 1: Viết lại `docs/specs/affiliate-policy.md`** theo spec: mã giới thiệu = SĐT (mã GCA- cũ vẫn nhận); voucher 100k cho người giới thiệu khi F1 đăng ký; hoàn `cashback%` cho mọi khách; hoa hồng `commission%` chuyến F1 (người giới thiệu là khách, 1 tầng, trọn đời); dùng điểm ≤ `max_rate%` giá sau voucher, giữ khi đặt, hoàn khi huỷ/hết hạn, tài xế huỷ thì giữ; app bù tài xế qua phí nhận cuốc; tỷ lệ chỉnh ở Cài đặt; ví dụ chuyến 500.000đ của F1 (tài xế 400k, F1 25 điểm, người giới thiệu 25 điểm, app 50k).

- [ ] **Step 2: Chạy toàn bộ test backend + pint**

Run: `docker compose exec -T app php artisan test` rồi `docker compose exec -T app ./vendor/bin/pint --test app tests database`
Expected: toàn bộ PASS trừ các test đã fail sẵn trên main (ghi tên nếu có); pint sạch trên file đã sửa.

- [ ] **Step 3: Commit**

```bash
git add docs/specs/affiliate-policy.md docs/CR/2026-10-04-CR-affiliate.md
git commit -m "docs(affiliate): cập nhật chính sách affiliate và trạng thái CR"
```
