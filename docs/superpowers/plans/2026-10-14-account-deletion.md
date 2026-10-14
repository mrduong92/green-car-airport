# Xoá tài khoản — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khách và tài xế tự xoá tài khoản trong app (và web), dữ liệu nhận dạng bị xoá, cuốc/giao dịch giữ ẩn danh — đáp ứng yêu cầu Google Play.

**Architecture:** Một service backend (`AccountDeletionService`) chứa toàn bộ quy tắc chặn + ẩn danh hoá trong một transaction; API `DELETE /api/me` và lệnh `account:delete` đều gọi service này. Dòng `users` được giữ (id không đổi) nên không đổi khoá ngoại nào; cột mới `users.deleted_at` đánh dấu. Frontend thêm một bottom sheet dùng chung cho 2 app.

**Tech Stack:** Laravel 13 / PHP 8.4 (PHPUnit Feature tests, sqlite in-memory), React 19 + TanStack Query + Tailwind, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-10-14-account-deletion-design.md`

## Global Constraints

- Mọi chuỗi giao diện và thông báo lỗi bằng **tiếng Việt**, đúng văn bản trong spec mục 2.
- Tên thay thế: `Người dùng đã xoá`. SĐT thay thế: `deleted-<id>`.
- **Không** dùng trait `SoftDeletes`; chỉ cột `users.deleted_at`.
- Mọi thay đổi dữ liệu khi xoá nằm trong **một** `DB::transaction`, khoá dòng user + ví trước khi kiểm lại điều kiện chặn.
- Cuốc dở dang và ví > 0 **luôn** chặn (kể cả `--force`); `--force` chỉ bỏ qua bị khoá + nợ phạt.
- Không thêm thư viện mới. Lệnh test backend: `.superpowers/sdd/2026-10-14-account-deletion/be php artisan test` (helper chạy docker image `green-car-airport_app:latest` mount `backend/`).
- 1 PR riêng từ `main` (nhánh `feat/account-deletion`).

## Review Focus

1. **Tài xế nhận cuốc đúng lúc đang xoá** — `TripController::accept` khoá `bookings`, không khoá `users`; reviewer kiểm xem có khe hở để cuốc được gán cho tài khoản vừa ẩn danh hay không, và kết quả mà người dùng thấy.
2. **Người giới thiệu đã xoá** — thưởng giới thiệu về sau không được cộng điểm/phát voucher cho tài khoản đã xoá (ví không còn ai quyết toán); người được giới thiệu vẫn nhận phần của mình. Test ở Task 4.
3. **Một SĐT có cả tài khoản khách và tài xế** — xoá tài khoản khách không được đụng tài khoản tài xế cùng số (token, push, hồ sơ). Test ở Task 1.
4. **Bên kia xem cuốc cũ** — tài xế xem cuốc của khách đã xoá (và ngược lại) không được lộ chuỗi `deleted-<id>` hay hiện nút gọi `tel:deleted-…`. Test ở Task 3 + sửa UI ở Task 6.
5. **Admin dùng `/api/me` để tự xoá** — admin không được tự xoá qua API (khoá luôn quyền quản trị). Test ở Task 2.

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `backend/database/migrations/2026_10_17_000001_add_deleted_at_to_users_table.php` | Cột `users.deleted_at` |
| `backend/app/Models/User.php` | `isDeleted()`, `contactPhone()`, cast `deleted_at` |
| `backend/app/Exceptions/AccountDeletionBlocked.php` | Exception mang thông báo chặn |
| `backend/app/Services/AccountDeletionService.php` | `blockingReason()`, `delete()` |
| `backend/app/Http/Requests/Auth/DeleteAccountRequest.php` | Validate PIN |
| `backend/app/Http/Controllers/Auth/AccountController.php` | `destroy` |
| `backend/routes/api.php` | `DELETE /api/me` |
| `backend/app/Http/Controllers/Customer/BookingController.php`, `Driver/TripController.php` | Không lộ SĐT của người đã xoá |
| `backend/app/Http/Controllers/Admin/CustomerController.php`, `Admin/DriverController.php` | Lọc `deleted_at` |
| `backend/app/Services/ReferralService.php` | Bỏ qua người giới thiệu đã xoá |
| `backend/app/Console/Commands/DeleteAccount.php` | `account:delete` |
| `backend/resources/legal/delete-account.html`, `database/seeders/StaticPageSeeder.php` | Trang `xoa-tai-khoan` |
| `frontend/src/api/auth.ts` | `deleteAccount()` |
| `frontend/src/components/common/DeleteAccountSheet.tsx` | Sheet xác nhận dùng chung |
| `frontend/src/pages/customer/ProfilePage.tsx`, `pages/driver/ProfilePage.tsx` | Dòng "Xoá tài khoản" |
| `frontend/src/pages/driver/TripDetailPage.tsx`, `pages/customer/BookingStatusPage.tsx`, `src/types.d.ts` | Ẩn nút gọi khi không có SĐT |
| `frontend/e2e/account-deletion.spec.ts` | e2e |

---

### Task 1: Cột `deleted_at` + `AccountDeletionService`

**Files:**
- Create: `backend/database/migrations/2026_10_17_000001_add_deleted_at_to_users_table.php`
- Create: `backend/app/Exceptions/AccountDeletionBlocked.php`
- Create: `backend/app/Services/AccountDeletionService.php`
- Modify: `backend/app/Models/User.php`
- Test: `backend/tests/Feature/AccountDeletionServiceTest.php`

**Interfaces:**
- Produces: `AccountDeletionService::blockingReason(User $user, bool $ignoreHolds = false): ?string`; `AccountDeletionService::delete(User $user, bool $ignoreHolds = false): void` (ném `AccountDeletionBlocked`); `AccountDeletionService::DELETED_NAME = 'Người dùng đã xoá'`; `User::isDeleted(): bool`; `User::contactPhone(): ?string`.

- [ ] **Step 1: Write the failing test**

```php
<?php
// backend/tests/Feature/AccountDeletionServiceTest.php

namespace Tests\Feature;

use App\Exceptions\AccountDeletionBlocked;
use App\Models\Booking;
use App\Models\DeviceToken;
use App\Models\DriverHiddenSender;
use App\Models\DriverProfile;
use App\Models\Otp;
use App\Models\User;
use App\Models\Voucher;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Services\AccountDeletionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AccountDeletionServiceTest extends TestCase
{
    use RefreshDatabase;

    private function service(): AccountDeletionService
    {
        return app(AccountDeletionService::class);
    }

    private function booking(array $attrs): Booking
    {
        return Booking::create(array_merge([
            'customer_id' => User::factory()->create(['role' => 'customer'])->id,
            'pickup' => 'Hà Nội', 'destination' => 'Sân bay Nội Bài',
            'date' => now()->addDay()->format('Y-m-d'), 'time' => '08:00',
            'vehicle_type' => 'sedan_4', 'distance_km' => 30,
            'price' => 300_000, 'discount' => 0, 'surcharge' => 0, 'status' => 'completed',
        ], $attrs));
    }

    private function driver(): User
    {
        $driver = User::factory()->create(['role' => 'driver', 'phone' => '0912000111']);
        DriverProfile::create([
            'user_id' => $driver->id, 'vehicle_make' => 'Toyota', 'vehicle_model' => 'Vios',
            'vehicle_plate' => '30A-12345', 'vehicle_year' => 2021, 'vehicle_color' => 'Trắng',
            'vehicle_type' => 'sedan_4', 'status' => 'active', 'cccd_number' => '001099000111',
        ]);

        return $driver;
    }

    public function test_xoa_khach_an_danh_hoa_va_xoa_du_lieu_ca_nhan(): void
    {
        $customer = User::factory()->create(['role' => 'customer', 'phone' => '0901000111', 'referral_code' => 'GCA-AAA']);
        $customer->createToken('app');
        DeviceToken::create(['user_id' => $customer->id, 'endpoint' => 'https://push.example/1', 'p256dh' => 'p', 'auth' => 'a']);
        DB::table('notifications')->insert([
            'id' => (string) \Illuminate\Support\Str::uuid(), 'type' => 'X', 'notifiable_type' => User::class,
            'notifiable_id' => $customer->id, 'data' => '{}', 'created_at' => now(), 'updated_at' => now(),
        ]);
        Otp::create(['phone' => '0901000111', 'code' => '123456', 'expires_at' => now()->addMinutes(5)]);
        $unused = Voucher::create(['code' => 'GCA-U1', 'type' => 'fixed', 'value' => 50000, 'target' => 'specific', 'usage_count' => 0, 'is_active' => true, 'user_id' => $customer->id]);
        $used = Voucher::create(['code' => 'GCA-U2', 'type' => 'fixed', 'value' => 50000, 'target' => 'specific', 'usage_count' => 1, 'is_active' => true, 'user_id' => $customer->id]);
        $trip = $this->booking(['customer_id' => $customer->id, 'note' => 'Gọi 0901000111', 'voucher_id' => $used->id]);

        $this->service()->delete($customer);

        $customer->refresh();
        $this->assertSame(AccountDeletionService::DELETED_NAME, $customer->name);
        $this->assertSame("deleted-{$customer->id}", $customer->phone);
        $this->assertNull($customer->referral_code);
        $this->assertTrue($customer->isDeleted());
        $this->assertNull($customer->contactPhone());
        $this->assertSame(0, $customer->tokens()->count());
        $this->assertDatabaseMissing('device_tokens', ['user_id' => $customer->id]);
        $this->assertDatabaseMissing('notifications', ['notifiable_id' => $customer->id]);
        $this->assertDatabaseMissing('otps', ['phone' => '0901000111']);
        $this->assertDatabaseMissing('vouchers', ['id' => $unused->id]);
        $this->assertDatabaseHas('vouchers', ['id' => $used->id]);
        $this->assertDatabaseHas('bookings', ['id' => $trip->id, 'customer_id' => $customer->id, 'note' => null, 'status' => 'completed']);
    }

    public function test_xoa_tai_xe_xoa_ho_so_giu_vi_va_giao_dich(): void
    {
        $driver = $this->driver();
        $wallet = Wallet::create(['user_id' => $driver->id, 'points' => 0]);
        WalletTransaction::create(['wallet_id' => $wallet->id, 'type' => 'topup', 'description' => 'Nạp', 'points' => 100]);
        DriverHiddenSender::create(['driver_id' => $driver->id, 'sender_uid' => 'u1', 'qr_code' => 'q1']);
        $trip = $this->booking(['driver_id' => $driver->id]);

        $this->service()->delete($driver);

        $this->assertDatabaseMissing('driver_profiles', ['user_id' => $driver->id]);
        $this->assertDatabaseMissing('driver_hidden_senders', ['driver_id' => $driver->id]);
        $this->assertDatabaseHas('wallets', ['id' => $wallet->id]);
        $this->assertDatabaseHas('wallet_transactions', ['wallet_id' => $wallet->id, 'points' => 100]);
        $this->assertDatabaseHas('bookings', ['id' => $trip->id, 'driver_id' => $driver->id]);
    }

    public function test_cung_so_co_tai_khoan_tai_xe_thi_khong_dung_toi(): void
    {
        $driver = $this->driver();
        $driver->createToken('app');
        $customer = User::factory()->create(['role' => 'customer', 'phone' => '0912000111']);

        $this->service()->delete($customer);

        $this->assertSame('0912000111', $driver->fresh()->phone);
        $this->assertDatabaseHas('driver_profiles', ['user_id' => $driver->id]);
        $this->assertSame(1, $driver->tokens()->count());
    }

    /** @return array<string, array{0: callable(self): User, 1: string}> */
    public static function blockedCases(): array
    {
        return [
            'khách còn cuốc đang tìm tài xế' => [fn (self $t) => tap(User::factory()->create(['role' => 'customer']), fn ($u) => $t->booking(['customer_id' => $u->id, 'status' => 'finding_driver'])), 'Bạn còn cuốc chưa hoàn thành. Vui lòng hoàn thành hoặc huỷ cuốc trước khi xoá tài khoản.'],
            'tài xế đang chạy cuốc' => [fn (self $t) => tap($t->driver(), fn ($u) => $t->booking(['driver_id' => $u->id, 'status' => 'in_progress'])), 'Bạn còn cuốc chưa hoàn thành. Vui lòng hoàn thành hoặc huỷ cuốc trước khi xoá tài khoản.'],
            'ví còn điểm' => [fn (self $t) => tap($t->driver(), fn ($u) => Wallet::create(['user_id' => $u->id, 'points' => 1250])), 'Ví của bạn còn 1.250 điểm. Vui lòng liên hệ admin để quyết toán trước khi xoá tài khoản.'],
            'user bị khoá' => [fn (self $t) => User::factory()->create(['role' => 'customer', 'is_blocked' => true]), 'Tài khoản đang bị khoá. Vui lòng liên hệ admin.'],
            'hồ sơ tài xế bị khoá' => [fn (self $t) => tap($t->driver(), fn ($u) => $u->driverProfile->update(['status' => 'blocked'])), 'Tài khoản đang bị khoá. Vui lòng liên hệ admin.'],
            'nợ phí phạt' => [fn (self $t) => User::factory()->create(['role' => 'customer', 'pending_penalty' => 50000]), 'Bạn còn phí phạt huỷ cuốc chưa thanh toán. Vui lòng liên hệ admin.'],
        ];
    }

    /** @dataProvider blockedCases */
    public function test_bi_chan_thi_khong_doi_gi($make, string $message): void
    {
        $user = $make($this);
        $before = $user->fresh()->only(['name', 'phone', 'deleted_at']);

        try {
            $this->service()->delete($user);
            $this->fail('Phải ném AccountDeletionBlocked');
        } catch (AccountDeletionBlocked $e) {
            $this->assertSame($message, $e->getMessage());
        }

        $this->assertSame($before, $user->fresh()->only(['name', 'phone', 'deleted_at']));
    }

    public function test_ignore_holds_bo_qua_khoa_va_no_nhung_van_chan_vi_va_cuoc(): void
    {
        $blocked = User::factory()->create(['role' => 'customer', 'is_blocked' => true, 'pending_penalty' => 50000]);
        $this->service()->delete($blocked, ignoreHolds: true);
        $this->assertTrue($blocked->fresh()->isDeleted());

        $rich = $this->driver();
        Wallet::create(['user_id' => $rich->id, 'points' => 10]);
        $this->expectException(AccountDeletionBlocked::class);
        $this->service()->delete($rich, ignoreHolds: true);
    }
}
```

Kiểm tên cột trước khi chạy: `grep -n "fillable" -A4 backend/app/Models/Otp.php backend/app/Models/DriverHiddenSender.php` — nếu `Otp` cần thêm cột bắt buộc (vd. `purpose`) hay `DriverHiddenSender` khác `sender_uid`/`qr_code`, sửa dữ liệu test cho khớp model, không sửa model.

- [ ] **Step 2: Run test to verify it fails**

Run: `.superpowers/sdd/2026-10-14-account-deletion/be php artisan test --filter=AccountDeletionServiceTest`
Expected: FAIL — `Class "App\Services\AccountDeletionService" not found`.

- [ ] **Step 3: Write minimal implementation**

`backend/database/migrations/2026_10_17_000001_add_deleted_at_to_users_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Đánh dấu tài khoản đã tự xoá (ẩn danh hoá) — KHÔNG phải SoftDeletes của Laravel:
// global scope của trait đó làm `booking->customer` thành null ở mọi màn lịch sử cuốc.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('deleted_at')->nullable()->index();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex(['deleted_at']);
            $table->dropColumn('deleted_at');
        });
    }
};
```

`backend/app/Exceptions/AccountDeletionBlocked.php`:

```php
<?php

namespace App\Exceptions;

use RuntimeException;

/** Tài khoản chưa được xoá — message là thông báo tiếng Việt hiện thẳng cho người dùng. */
class AccountDeletionBlocked extends RuntimeException {}
```

`backend/app/Models/User.php` — thêm vào `$casts` dòng `'deleted_at' => 'datetime',` và hai method:

```php
    /** Đã tự xoá tài khoản — dữ liệu nhận dạng đã bị ẩn danh hoá. */
    public function isDeleted(): bool
    {
        return $this->deleted_at !== null;
    }

    /** SĐT để bên kia liên hệ — null khi đã xoá (phone lúc đó là `deleted-<id>`, không gọi được). */
    public function contactPhone(): ?string
    {
        return $this->isDeleted() ? null : $this->phone;
    }
```

`backend/app/Services/AccountDeletionService.php`:

```php
<?php

namespace App\Services;

use App\Exceptions\AccountDeletionBlocked;
use App\Models\Booking;
use App\Models\DeviceToken;
use App\Models\DriverFreeRideAlert;
use App\Models\DriverHiddenSender;
use App\Models\DriverProfile;
use App\Models\FreeRideReport;
use App\Models\Otp;
use App\Models\User;
use App\Models\Voucher;
use App\Models\Wallet;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Xoá tài khoản = ẩn danh hoá tại chỗ (spec 2026-10-14-account-deletion-design.md).
 * Giữ dòng users để cuốc/giao dịch của NGƯỜI KHÁC và doanh thu không bị sai.
 */
class AccountDeletionService
{
    public const DELETED_NAME = 'Người dùng đã xoá';

    private const CUSTOMER_OPEN = ['finding_driver', 'accepted', 'picking_up', 'in_progress'];

    private const DRIVER_OPEN = ['accepted', 'picking_up', 'in_progress'];

    /**
     * Lý do không được xoá, hoặc null. Cuốc dở dang và ví > 0 luôn chặn; `$ignoreHolds`
     * (admin xoá giúp) chỉ bỏ qua bị khoá và nợ phí phạt.
     */
    public function blockingReason(User $user, bool $ignoreHolds = false): ?string
    {
        $hasOpenTrip = Booking::where(fn ($q) => $q
            ->where(fn ($q2) => $q2->where('customer_id', $user->id)->whereIn('status', self::CUSTOMER_OPEN))
            ->orWhere(fn ($q2) => $q2->where('driver_id', $user->id)->whereIn('status', self::DRIVER_OPEN)))
            ->exists();
        if ($hasOpenTrip) {
            return 'Bạn còn cuốc chưa hoàn thành. Vui lòng hoàn thành hoặc huỷ cuốc trước khi xoá tài khoản.';
        }

        $points = (int) Wallet::where('user_id', $user->id)->value('points');
        if ($points > 0) {
            return 'Ví của bạn còn '.number_format($points, 0, ',', '.').' điểm. Vui lòng liên hệ admin để quyết toán trước khi xoá tài khoản.';
        }

        if ($ignoreHolds) {
            return null;
        }

        if ($user->is_blocked || $user->driverProfile?->status === 'blocked') {
            return 'Tài khoản đang bị khoá. Vui lòng liên hệ admin.';
        }
        if ($user->pending_penalty > 0) {
            return 'Bạn còn phí phạt huỷ cuốc chưa thanh toán. Vui lòng liên hệ admin.';
        }

        return null;
    }

    public function delete(User $user, bool $ignoreHolds = false): void
    {
        DB::transaction(function () use ($user, $ignoreHolds) {
            // Khoá rồi mới kiểm lại: không để điểm/cuốc mới chen vào giữa lúc kiểm và lúc xoá.
            $user = User::lockForUpdate()->findOrFail($user->id);
            Wallet::where('user_id', $user->id)->lockForUpdate()->first();
            if ($user->isDeleted()) {
                return;
            }

            $reason = $this->blockingReason($user, $ignoreHolds);
            if ($reason !== null) {
                throw new AccountDeletionBlocked($reason);
            }

            DriverProfile::where('user_id', $user->id)->delete();
            $user->tokens()->delete();
            DeviceToken::where('user_id', $user->id)->delete();
            $user->notifications()->delete();
            Otp::where('phone', $user->phone)->delete();
            DriverFreeRideAlert::where('driver_id', $user->id)->delete();
            DriverHiddenSender::where('driver_id', $user->id)->delete();
            FreeRideReport::where('driver_id', $user->id)->delete();
            Voucher::where('user_id', $user->id)->doesntHave('bookings')->delete();
            // Khách hay ghi SĐT/tên vào ghi chú cuốc.
            Booking::where('customer_id', $user->id)->whereNotNull('note')->update(['note' => null]);

            $user->forceFill([
                'name' => self::DELETED_NAME,
                'phone' => "deleted-{$user->id}",
                'password' => Hash::make(Str::random(64)),
                'referral_code' => null,
                'is_collaborator' => false,
                'deleted_at' => now(),
            ])->save();
        });
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.superpowers/sdd/2026-10-14-account-deletion/be php artisan test --filter=AccountDeletionServiceTest`
Expected: PASS (5 tests + 6 data-provider cases).

- [ ] **Step 5: Commit**

```bash
git add backend/database/migrations/2026_10_17_000001_add_deleted_at_to_users_table.php backend/app/Exceptions/AccountDeletionBlocked.php backend/app/Services/AccountDeletionService.php backend/app/Models/User.php backend/tests/Feature/AccountDeletionServiceTest.php
git commit -m "feat(account): AccountDeletionService — ẩn danh hoá tài khoản, chặn khi còn cuốc/điểm/khoá/nợ"
```

---

### Task 2: API `DELETE /api/me`

**Files:**
- Create: `backend/app/Http/Requests/Auth/DeleteAccountRequest.php`
- Create: `backend/app/Http/Controllers/Auth/AccountController.php`
- Modify: `backend/routes/api.php` (nhóm `auth:sanctum`, cạnh `/auth/logout`)
- Test: `backend/tests/Feature/AccountDeletionApiTest.php`

**Interfaces:**
- Consumes: `AccountDeletionService::delete()`, `AccountDeletionBlocked` (Task 1).
- Produces: `DELETE /api/me` body `{ password: "123456" }` → 200 `{ message: 'Tài khoản của bạn đã được xoá.' }` | 422 `{ message }` | 403 (admin).

- [ ] **Step 1: Write the failing test**

```php
<?php
// backend/tests/Feature/AccountDeletionApiTest.php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AccountDeletionApiTest extends TestCase
{
    use RefreshDatabase;

    private function customer(array $attrs = []): User
    {
        return User::factory()->create(array_merge([
            'role' => 'customer', 'phone' => '0901222333', 'password' => Hash::make('123456'),
        ], $attrs));
    }

    public function test_xoa_thanh_cong_token_cu_het_hieu_luc(): void
    {
        $user = $this->customer();
        $token = $user->createToken('app')->plainTextToken;

        $this->withToken($token)->deleteJson('/api/me', ['password' => '123456'])
            ->assertOk()
            ->assertJsonPath('message', 'Tài khoản của bạn đã được xoá.');

        $this->assertTrue($user->fresh()->isDeleted());
        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/auth/me')->assertUnauthorized();
    }

    public function test_sau_khi_xoa_khong_dang_nhap_duoc_nhung_dang_ky_lai_duoc(): void
    {
        $user = $this->customer();
        $this->actingAs($user, 'sanctum')->deleteJson('/api/me', ['password' => '123456'])->assertOk();

        $this->postJson('/api/auth/login', ['phone' => '0901222333', 'password' => '123456', 'role' => 'customer'])
            ->assertStatus(422);

        $this->postJson('/api/auth/register', [
            'phone' => '0901222333', 'otp' => '000000', 'password' => '654321', 'accept_terms' => true,
        ])->assertOk();

        $this->assertSame(2, User::where('role', 'customer')->count());
        $this->assertNotSame($user->id, User::where('phone', '0901222333')->value('id'));
    }

    public function test_sai_pin_422_khong_doi_gi(): void
    {
        $user = $this->customer();

        $this->actingAs($user, 'sanctum')->deleteJson('/api/me', ['password' => '000000'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Mã PIN không đúng.');

        $this->assertFalse($user->fresh()->isDeleted());
    }

    public function test_thieu_pin_bao_tieng_viet(): void
    {
        $this->actingAs($this->customer(), 'sanctum')->deleteJson('/api/me', [])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Vui lòng nhập đủ 6 số PIN.');
    }

    public function test_bi_chan_tra_dung_thong_bao(): void
    {
        $user = $this->customer();
        Booking::create([
            'customer_id' => $user->id, 'pickup' => 'Hà Nội', 'destination' => 'Nội Bài',
            'date' => now()->addDay()->format('Y-m-d'), 'time' => '08:00', 'vehicle_type' => 'sedan_4',
            'distance_km' => 30, 'price' => 300_000, 'discount' => 0, 'surcharge' => 0, 'status' => 'finding_driver',
        ]);

        $this->actingAs($user, 'sanctum')->deleteJson('/api/me', ['password' => '123456'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Bạn còn cuốc chưa hoàn thành. Vui lòng hoàn thành hoặc huỷ cuốc trước khi xoá tài khoản.');

        $this->assertFalse($user->fresh()->isDeleted());
    }

    public function test_admin_khong_tu_xoa_duoc(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'password' => Hash::make('123456')]);

        $this->actingAs($admin, 'sanctum')->deleteJson('/api/me', ['password' => '123456'])->assertForbidden();
        $this->assertFalse($admin->fresh()->isDeleted());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.superpowers/sdd/2026-10-14-account-deletion/be php artisan test --filter=AccountDeletionApiTest`
Expected: FAIL — 404/405 cho `DELETE /api/me`.

- [ ] **Step 3: Write minimal implementation**

`backend/app/Http/Requests/Auth/DeleteAccountRequest.php`:

```php
<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

class DeleteAccountRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return ['password' => 'required|string|size:6|regex:/^\d{6}$/'];
    }

    public function messages(): array
    {
        return ['password.*' => 'Vui lòng nhập đủ 6 số PIN.'];
    }
}
```

`backend/app/Http/Controllers/Auth/AccountController.php`:

```php
<?php

namespace App\Http\Controllers\Auth;

use App\Exceptions\AccountDeletionBlocked;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\DeleteAccountRequest;
use App\Services\AccountDeletionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Hash;

class AccountController extends Controller
{
    /** Khách/tài xế tự xoá tài khoản (yêu cầu Google Play). Admin không tự xoá qua đây. */
    public function destroy(DeleteAccountRequest $request, AccountDeletionService $service): JsonResponse
    {
        $user = $request->user();
        if (! in_array($user->role, ['customer', 'driver'], true)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }
        if (! Hash::check($request->input('password'), $user->password)) {
            return response()->json(['message' => 'Mã PIN không đúng.'], 422);
        }

        try {
            $service->delete($user);
        } catch (AccountDeletionBlocked $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['message' => 'Tài khoản của bạn đã được xoá.']);
    }
}
```

`backend/routes/api.php` — thêm `use App\Http\Controllers\Auth\AccountController;` ở đầu file và ngay dưới `Route::post('/auth/logout', ...)`:

```php
    Route::delete('/me', [AccountController::class, 'destroy']);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.superpowers/sdd/2026-10-14-account-deletion/be php artisan test --filter=AccountDeletionApiTest`
Expected: PASS (6 tests). Nếu `test_sau_khi_xoa...` thất bại ở bước register vì payload đăng ký khác (vd. cần `name`), chỉnh payload theo `RegisterTest`, không sửa controller đăng ký.

- [ ] **Step 5: Commit**

```bash
git add backend/app/Http/Requests/Auth/DeleteAccountRequest.php backend/app/Http/Controllers/Auth/AccountController.php backend/routes/api.php backend/tests/Feature/AccountDeletionApiTest.php
git commit -m "feat(account): API DELETE /api/me xác nhận bằng PIN"
```

---

### Task 3: Bên kia và admin không thấy dữ liệu của người đã xoá

**Files:**
- Modify: `backend/app/Http/Controllers/Customer/BookingController.php` (`formatBooking`, khối `'driver' => …`)
- Modify: `backend/app/Http/Controllers/Driver/TripController.php` (`formatTrip`: `$phone = …`)
- Modify: `backend/app/Http/Controllers/Admin/CustomerController.php` (`index`)
- Modify: `backend/app/Http/Controllers/Admin/DriverController.php` (`index`)
- Test: `backend/tests/Feature/DeletedAccountVisibilityTest.php`

**Interfaces:**
- Consumes: `AccountDeletionService::delete()`, `User::contactPhone()` (Task 1).
- Produces: payload khách `driver.phone: string|null`; payload tài xế `customer_phone: ''` khi khách đã xoá.

- [ ] **Step 1: Write the failing test**

```php
<?php
// backend/tests/Feature/DeletedAccountVisibilityTest.php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\DriverProfile;
use App\Models\User;
use App\Services\AccountDeletionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DeletedAccountVisibilityTest extends TestCase
{
    use RefreshDatabase;

    private function driver(): User
    {
        $d = User::factory()->create(['role' => 'driver']);
        DriverProfile::create([
            'user_id' => $d->id, 'vehicle_make' => 'Toyota', 'vehicle_model' => 'Vios', 'vehicle_plate' => '30A-1',
            'vehicle_year' => 2021, 'vehicle_color' => 'Trắng', 'vehicle_type' => 'sedan_4', 'status' => 'active',
        ]);

        return $d;
    }

    private function trip(User $customer, User $driver): Booking
    {
        return Booking::create([
            'customer_id' => $customer->id, 'driver_id' => $driver->id, 'pickup' => 'Hà Nội', 'destination' => 'Nội Bài',
            'date' => now()->subDay()->format('Y-m-d'), 'time' => '08:00', 'vehicle_type' => 'sedan_4',
            'distance_km' => 30, 'price' => 300_000, 'discount' => 0, 'surcharge' => 0, 'status' => 'completed',
        ]);
    }

    public function test_tai_xe_xem_cuoc_cua_khach_da_xoa(): void
    {
        $customer = User::factory()->create(['role' => 'customer']);
        $driver = $this->driver();
        $trip = $this->trip($customer, $driver);
        app(AccountDeletionService::class)->delete($customer);

        $this->actingAs($driver, 'sanctum')->getJson("/api/driver/trips/{$trip->id}")
            ->assertOk()
            ->assertJsonPath('customer_name', AccountDeletionService::DELETED_NAME)
            ->assertJsonPath('customer_phone', '')
            ->assertJsonPath('customer_phone_masked', '');
    }

    public function test_khach_xem_cuoc_cua_tai_xe_da_xoa(): void
    {
        $customer = User::factory()->create(['role' => 'customer']);
        $driver = $this->driver();
        $trip = $this->trip($customer, $driver);
        app(AccountDeletionService::class)->delete($driver);

        $this->actingAs($customer, 'sanctum')->getJson("/api/bookings/{$trip->id}")
            ->assertOk()
            ->assertJsonPath('driver.name', AccountDeletionService::DELETED_NAME)
            ->assertJsonPath('driver.phone', null)
            ->assertJsonPath('driver.vehicle_plate', null);
    }

    public function test_admin_khong_thay_tai_khoan_da_xoa(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $gone = User::factory()->create(['role' => 'customer']);
        $kept = User::factory()->create(['role' => 'customer']);
        $goneDriver = $this->driver();
        app(AccountDeletionService::class)->delete($gone);
        app(AccountDeletionService::class)->delete($goneDriver);

        $customers = collect($this->actingAs($admin, 'sanctum')->getJson('/api/admin/customers')->assertOk()->json());
        $drivers = collect($this->actingAs($admin, 'sanctum')->getJson('/api/admin/drivers')->assertOk()->json());

        $this->assertFalse($customers->pluck('id')->contains($gone->id));
        $this->assertTrue($customers->pluck('id')->contains($kept->id));
        $this->assertFalse($drivers->pluck('id')->contains($goneDriver->id));
    }
}
```

Cả 2 `index` admin trả mảng thẳng (`response()->json($result)` / `response()->json($drivers)`), mỗi phần tử có `id`.

- [ ] **Step 2: Run test to verify it fails**

Run: `.superpowers/sdd/2026-10-14-account-deletion/be php artisan test --filter=DeletedAccountVisibilityTest`
Expected: FAIL — `customer_phone` là `deleted-<id>`; `driver.phone` là `deleted-<id>`; admin còn thấy tài khoản đã xoá.

- [ ] **Step 3: Write minimal implementation**

`Customer/BookingController.php` trong `formatBooking`:

```php
                'phone' => $driver->contactPhone(),
```

`Driver/TripController.php` trong `formatTrip`:

```php
        $phone = $b->customer?->contactPhone() ?? '';
```

`Admin/CustomerController.php` `index`:

```php
        $query = User::with('bookingsAsCustomer')->where('role', 'customer')->whereNull('deleted_at');
```

`Admin/DriverController.php` `index`:

```php
        $query = User::with(['driverProfile', 'wallet'])->where('role', 'driver')->whereNull('deleted_at');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.superpowers/sdd/2026-10-14-account-deletion/be php artisan test --filter=DeletedAccountVisibilityTest`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/Http/Controllers/Customer/BookingController.php backend/app/Http/Controllers/Driver/TripController.php backend/app/Http/Controllers/Admin/CustomerController.php backend/app/Http/Controllers/Admin/DriverController.php backend/tests/Feature/DeletedAccountVisibilityTest.php
git commit -m "feat(account): không lộ SĐT người đã xoá cho bên kia, ẩn khỏi danh sách admin"
```

---

### Task 4: Thưởng giới thiệu bỏ qua người giới thiệu đã xoá

**Files:**
- Modify: `backend/app/Services/ReferralService.php` (`processDriverReferral`, `processCustomerReferral`)
- Test: `backend/tests/Feature/ReferralDeletedReferrerTest.php`

**Interfaces:**
- Consumes: `User::isDeleted()` (Task 1), `ReferralService` hiện có.

- [ ] **Step 1: Write the failing test**

```php
<?php
// backend/tests/Feature/ReferralDeletedReferrerTest.php

namespace Tests\Feature;

use App\Models\DriverProfile;
use App\Models\User;
use App\Models\Voucher;
use App\Models\Wallet;
use App\Services\AccountDeletionService;
use App\Services\ReferralService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReferralDeletedReferrerTest extends TestCase
{
    use RefreshDatabase;

    public function test_khach_gioi_thieu_da_xoa_khong_nhan_voucher(): void
    {
        $referrer = User::factory()->create(['role' => 'customer']);
        $customer = User::factory()->create(['role' => 'customer', 'referred_by_user_id' => $referrer->id]);
        app(AccountDeletionService::class)->delete($referrer);

        app(ReferralService::class)->processCustomerReferral($customer->fresh());

        $this->assertSame(0, Voucher::where('user_id', $referrer->id)->count());
    }

    public function test_tai_xe_gioi_thieu_da_xoa_khong_duoc_cong_diem_nguoi_moi_van_nhan(): void
    {
        $referrer = User::factory()->create(['role' => 'driver']);
        $driver = User::factory()->create(['role' => 'driver', 'referred_by_user_id' => $referrer->id]);
        DriverProfile::create([
            'user_id' => $driver->id, 'vehicle_make' => 'Toyota', 'vehicle_model' => 'Vios', 'vehicle_plate' => '30A-2',
            'vehicle_year' => 2021, 'vehicle_color' => 'Trắng', 'vehicle_type' => 'sedan_4', 'status' => 'active', 'trips_count' => 1,
        ]);
        app(AccountDeletionService::class)->delete($referrer);

        app(ReferralService::class)->processDriverReferral($driver->fresh());

        $this->assertSame(0, (int) Wallet::where('user_id', $referrer->id)->value('points'));
        $this->assertGreaterThan(0, (int) Wallet::where('user_id', $driver->id)->value('points'));
        $this->assertNotNull($driver->fresh()->referral_rewarded_at);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.superpowers/sdd/2026-10-14-account-deletion/be php artisan test --filter=ReferralDeletedReferrerTest`
Expected: FAIL — người giới thiệu đã xoá vẫn nhận voucher / được cộng điểm.

- [ ] **Step 3: Write minimal implementation**

`processCustomerReferral` — đổi `if ($referrer === null) {` thành:

```php
        if ($referrer === null || $referrer->isDeleted()) {
```

`processDriverReferral` — trong `DB::transaction`, thay dòng cộng điểm cho người giới thiệu:

```php
            // Người giới thiệu đã xoá tài khoản: không cộng vào ví không còn ai quyết toán.
            if (! $referrer->isDeleted()) {
                $this->creditPoints($referrer, $points, "Thưởng giới thiệu tài xế #{$driver->id}");
            }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.superpowers/sdd/2026-10-14-account-deletion/be php artisan test --filter='ReferralDeletedReferrerTest|Referral'`
Expected: PASS (test mới + các test Referral cũ).

- [ ] **Step 5: Commit**

```bash
git add backend/app/Services/ReferralService.php backend/tests/Feature/ReferralDeletedReferrerTest.php
git commit -m "feat(account): thưởng giới thiệu bỏ qua người giới thiệu đã xoá tài khoản"
```

---

### Task 5: Lệnh `account:delete` + trang `xoa-tai-khoan`

**Files:**
- Create: `backend/app/Console/Commands/DeleteAccount.php`
- Create: `backend/resources/legal/delete-account.html`
- Modify: `backend/database/seeders/StaticPageSeeder.php`
- Modify: `docs/DEPLOY.md` (mục deploy: chạy seeder cho trang mới)
- Test: `backend/tests/Feature/DeleteAccountCommandTest.php`

**Interfaces:**
- Consumes: `AccountDeletionService::blockingReason()`, `::delete()`, `App\Support\PhoneNumber::normalize()`.

- [ ] **Step 1: Write the failing test**

```php
<?php
// backend/tests/Feature/DeleteAccountCommandTest.php

namespace Tests\Feature;

use App\Models\StaticPage;
use App\Models\User;
use App\Models\Wallet;
use Database\Seeders\StaticPageSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DeleteAccountCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_xoa_sau_khi_xac_nhan(): void
    {
        $user = User::factory()->create(['role' => 'customer', 'phone' => '0903444555']);

        $this->artisan('account:delete', ['phone' => '0903444555', 'role' => 'customer'])
            ->expectsConfirmation("Xoá tài khoản #{$user->id} {$user->name} (0903444555, customer)? Không thể khôi phục.", 'yes')
            ->assertSuccessful();

        $this->assertTrue($user->fresh()->isDeleted());
    }

    public function test_bi_khoa_can_force(): void
    {
        $user = User::factory()->create(['role' => 'customer', 'phone' => '0903444556', 'is_blocked' => true]);

        $this->artisan('account:delete', ['phone' => '0903444556', 'role' => 'customer'])
            ->expectsOutputToContain('Tài khoản đang bị khoá')
            ->assertFailed();

        $this->artisan('account:delete', ['phone' => '0903444556', 'role' => 'customer', '--force' => true])
            ->expectsConfirmation("Xoá tài khoản #{$user->id} {$user->name} (0903444556, customer)? Không thể khôi phục.", 'yes')
            ->assertSuccessful();
    }

    public function test_force_van_chan_vi_con_diem(): void
    {
        $user = User::factory()->create(['role' => 'driver', 'phone' => '0903444557']);
        Wallet::create(['user_id' => $user->id, 'points' => 5]);

        $this->artisan('account:delete', ['phone' => '0903444557', 'role' => 'driver', '--force' => true])
            ->expectsOutputToContain('Ví của bạn còn 5 điểm')
            ->assertFailed();
    }

    public function test_seeder_tao_trang_xoa_tai_khoan(): void
    {
        $this->seed(StaticPageSeeder::class);

        $page = StaticPage::where('slug', 'xoa-tai-khoan')->firstOrFail();
        $this->assertTrue((bool) $page->is_active);
        $this->assertStringContainsString('Xoá tài khoản', $page->content);
        $this->getJson('/api/pages/xoa-tai-khoan')->assertOk();
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.superpowers/sdd/2026-10-14-account-deletion/be php artisan test --filter=DeleteAccountCommandTest`
Expected: FAIL — `The command "account:delete" does not exist.`

- [ ] **Step 3: Write minimal implementation**

`backend/app/Console/Commands/DeleteAccount.php`:

```php
<?php

namespace App\Console\Commands;

use App\Exceptions\AccountDeletionBlocked;
use App\Models\User;
use App\Services\AccountDeletionService;
use App\Support\PhoneNumber;
use Illuminate\Console\Command;

/** Admin xoá giúp sau khi đã quyết toán ví / gỡ khoá / xử lý nợ (spec mục 3). */
class DeleteAccount extends Command
{
    protected $signature = 'account:delete {phone} {role : customer|driver}
        {--force : Bỏ qua chặn "đang bị khoá" và "nợ phí phạt" (cuốc dở và ví > 0 vẫn chặn)}';

    protected $description = 'Xoá (ẩn danh hoá) tài khoản khách/tài xế theo yêu cầu của người dùng';

    public function handle(AccountDeletionService $service): int
    {
        $role = $this->argument('role');
        if (! in_array($role, ['customer', 'driver'], true)) {
            $this->error('Role phải là customer hoặc driver.');

            return self::FAILURE;
        }

        $phone = PhoneNumber::normalize($this->argument('phone'));
        $user = User::where('phone', $phone)->where('role', $role)->whereNull('deleted_at')->first();
        if (! $user) {
            $this->error('Không tìm thấy tài khoản.');

            return self::FAILURE;
        }

        $force = (bool) $this->option('force');
        $reason = $service->blockingReason($user, $force);
        if ($reason !== null) {
            $this->error($reason);

            return self::FAILURE;
        }

        if (! $this->confirm("Xoá tài khoản #{$user->id} {$user->name} ({$user->phone}, {$role})? Không thể khôi phục.")) {
            return self::FAILURE;
        }

        try {
            $service->delete($user, $force);
        } catch (AccountDeletionBlocked $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $this->info("Đã xoá tài khoản #{$user->id}.");

        return self::SUCCESS;
    }
}
```

`backend/resources/legal/delete-account.html`:

```html
<h2>Xoá tài khoản GreenCA</h2>
<p>Bạn có thể xoá tài khoản GreenCA (khách hàng hoặc tài xế) bất cứ lúc nào. Xoá là vĩnh viễn, không thể khôi phục.</p>

<h3>Cách 1 — Tự xoá trong ứng dụng hoặc trên web</h3>
<ol>
  <li>Đăng nhập ứng dụng GreenCA, hoặc trên web: <a href="https://greenca.vn/login">greenca.vn</a> (khách hàng) / <a href="https://driver.greenca.vn/login">driver.greenca.vn</a> (tài xế).</li>
  <li>Vào <strong>Hồ sơ</strong> → bấm <strong>Xoá tài khoản</strong>.</li>
  <li>Nhập mã PIN 6 số để xác nhận.</li>
</ol>

<h3>Cách 2 — Nhờ GreenCA xoá giúp</h3>
<p>Liên hệ bộ phận hỗ trợ qua Zalo hoặc hotline ghi ở mục <strong>Liên hệ</strong> trong ứng dụng, cung cấp số điện thoại đã đăng ký. Chúng tôi xác minh và xoá trong vòng 72 giờ.</p>

<h3>Dữ liệu bị xoá ngay</h3>
<ul>
  <li>Họ tên, số điện thoại, mã PIN, mã giới thiệu.</li>
  <li>Hồ sơ tài xế: số CCCD, giấy phép lái xe, đăng ký xe, đăng kiểm, bảo hiểm, biển số và thông tin xe, vị trí.</li>
  <li>Thông báo, phiên đăng nhập, mã nhận thông báo đẩy, cài đặt cuốc Free, voucher cá nhân chưa dùng, ghi chú trong cuốc xe.</li>
</ul>

<h3>Dữ liệu được giữ ở dạng ẩn danh</h3>
<p>Lịch sử cuốc xe (điểm đón, điểm đến, giá, thời gian) và lịch sử giao dịch điểm được giữ lại nhưng không còn gắn với tên hay số điện thoại của bạn, vì là chứng từ kế toán phải lưu tối thiểu 10 năm theo Luật Kế toán, và để lịch sử chuyến của tài xế/khách hàng còn lại không bị sai.</p>

<h3>Trường hợp chưa xoá được ngay</h3>
<p>Nếu bạn còn cuốc chưa hoàn thành, ví còn điểm, tài khoản đang bị khoá hoặc còn phí phạt chưa thanh toán, vui lòng hoàn tất hoặc liên hệ GreenCA để được quyết toán trước khi xoá.</p>
```

`StaticPageSeeder::run()` — thêm sau trang `privacy`:

```php
        // Link khai báo với Google Play (bắt buộc cho app có tạo tài khoản).
        StaticPage::updateOrCreate(['slug' => 'xoa-tai-khoan'], [
            'title' => 'Xoá tài khoản',
            'content' => file_get_contents(resource_path('legal/delete-account.html')),
            'is_active' => true,
        ]);
```

`docs/DEPLOY.md` — trong mục "1. Backend" của cả PRODUCTION và STAGING, ngay dưới dòng `php artisan migrate --force`, thêm:

```bash
php artisan db:seed --class=StaticPageSeeder --force   # trang /pages/xoa-tai-khoan (Google Play) — an toàn chạy lại (updateOrCreate)
```

⚠️ Seeder `updateOrCreate` trang `privacy` bằng nội dung tạm → **ghi đè** chính sách bảo mật nếu admin đã sửa trên production. Trước khi thêm dòng trên, đổi trang `privacy` trong seeder sang `firstOrCreate` (chỉ tạo khi chưa có) — thêm assert vào test: seed khi đã có trang `privacy` nội dung khác thì nội dung giữ nguyên:

```php
    public function test_seeder_khong_ghi_de_chinh_sach_bao_mat_da_sua(): void
    {
        StaticPage::create(['slug' => 'privacy', 'title' => 'Chính sách bảo mật', 'content' => '<p>Bản thật</p>', 'is_active' => true]);

        $this->seed(StaticPageSeeder::class);

        $this->assertSame('<p>Bản thật</p>', StaticPage::where('slug', 'privacy')->value('content'));
    }
```

và đổi trong seeder:

```php
        StaticPage::firstOrCreate(['slug' => 'privacy'], [
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.superpowers/sdd/2026-10-14-account-deletion/be php artisan test --filter='DeleteAccountCommandTest|StaticPageTest'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/Console/Commands/DeleteAccount.php backend/resources/legal/delete-account.html backend/database/seeders/StaticPageSeeder.php backend/tests/Feature/DeleteAccountCommandTest.php docs/DEPLOY.md
git commit -m "feat(account): lệnh account:delete cho admin, trang /pages/xoa-tai-khoan cho Google Play"
```

---

### Task 6: Frontend — sheet xoá tài khoản, ẩn nút gọi khi không có SĐT

**Files:**
- Modify: `frontend/src/api/auth.ts`
- Create: `frontend/src/components/common/DeleteAccountSheet.tsx`
- Modify: `frontend/src/pages/customer/ProfilePage.tsx` (dưới nút "Đăng xuất")
- Modify: `frontend/src/pages/driver/ProfilePage.tsx` (dưới khối có nút "Đăng xuất")
- Modify: `frontend/src/pages/driver/TripDetailPage.tsx:189`, `frontend/src/pages/customer/BookingStatusPage.tsx:192,497`, `frontend/src/types.d.ts` (`driver.phone`)

**Interfaces:**
- Consumes: `DELETE /api/me` (Task 2); `getContactSettings` (`@/api/settings`), `zaloLink` (`@/utils/zalo`), `apiMessage` (`@/utils/apiError`), `unregisterPushSubscription` (`@/push`), `useAuthStore().clearAuth`, `useUiStore().showToast`.
- Produces: `deleteAccount(password: string)`; `<DeleteAccountSheet open onClose />`.

- [ ] **Step 1: API**

`frontend/src/api/auth.ts` — thêm cuối file:

```ts
/** Tự xoá tài khoản (yêu cầu Google Play) — xác nhận bằng PIN 6 số. */
export const deleteAccount = (password: string) =>
  api.delete<{ message: string }>('/me', { data: { password } })
```

- [ ] **Step 2: Sheet**

`frontend/src/components/common/DeleteAccountSheet.tsx`:

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { deleteAccount } from '@/api/auth'
import { getContactSettings } from '@/api/settings'
import { unregisterPushSubscription } from '@/push'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { apiMessage } from '@/utils/apiError'
import { zaloLink } from '@/utils/zalo'
import Button from '@/components/common/Button'

// Xoá tài khoản (yêu cầu Google Play). Dữ liệu nhận dạng xoá ngay; cuốc/giao dịch giữ ẩn danh
// — xem docs/superpowers/specs/2026-10-14-account-deletion-design.md.
export default function DeleteAccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const showToast = useUiStore((s) => s.showToast)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { data: contact } = useQuery({ queryKey: ['contact-settings'], queryFn: getContactSettings, enabled: open })

  const mutation = useMutation({
    mutationFn: () => deleteAccount(pin),
    onSuccess: async () => {
      // Server đã xoá token đăng nhập + token push: gọi API ở đây sẽ 401 (bỏ qua) —
      // chỉ còn dọn trạng thái trên máy. Không gọi logoutApi().
      await unregisterPushSubscription()
      clearAuth()
      showToast('Tài khoản của bạn đã được xoá', 'success')
      navigate('/login', { replace: true })
    },
    onError: (err) => setError(apiMessage(err, 'Xoá tài khoản thất bại, vui lòng thử lại')),
  })

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end" onClick={onClose}>
      <div className="bg-white w-full rounded-t-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-4 border-b border-border-soft">
          <p className="text-[15px] font-semibold text-danger-red">Xoá tài khoản</p>
          <button onClick={onClose} aria-label="Đóng">
            <span className="material-symbols-outlined text-neutral-gray text-[20px]">close</span>
          </button>
        </div>

        <div className="px-4 py-4 flex flex-col gap-3 text-[13px] text-navy">
          <p><strong>Xoá ngay:</strong> họ tên, số điện thoại, mã PIN, giấy tờ và thông tin xe, thông báo, voucher chưa dùng.</p>
          <p><strong>Giữ ẩn danh:</strong> lịch sử cuốc và giao dịch điểm (chứng từ kế toán), không còn gắn với bạn.</p>
          <p className="text-danger-red font-medium">Không thể khôi phục sau khi xoá.</p>

          <label className="text-[12px] text-neutral-gray font-medium" htmlFor="delete-account-pin">Nhập mã PIN để xác nhận</label>
          <input
            id="delete-account-pin"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            maxLength={6}
            value={pin}
            onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setError(null) }}
            placeholder="••••••"
            className="border border-border-gray rounded-input px-3 py-2.5 text-sm text-navy outline-none focus:border-danger-red tracking-[0.4em]"
          />

          {error && (
            <div className="bg-danger-red/5 border border-danger-red/30 rounded-input px-3 py-2.5 flex flex-col gap-1">
              <p className="text-danger-red text-[13px]">{error}</p>
              {contact && (
                <a href={zaloLink(contact.zalo_phone)} target="_blank" rel="noreferrer" className="text-primary text-[13px] font-medium">
                  Liên hệ admin qua Zalo
                </a>
              )}
            </div>
          )}
        </div>

        <div className="px-4 pb-6 pt-3 flex gap-3 border-t border-border-soft">
          <Button fullWidth variant="outline" onClick={onClose}>Huỷ</Button>
          <button
            type="button"
            disabled={pin.length !== 6 || mutation.isPending}
            onClick={() => mutation.mutate()}
            className="w-full h-11 rounded-pill bg-danger-red text-white text-sm font-semibold disabled:opacity-50"
          >
            {mutation.isPending ? 'Đang xoá…' : 'Xoá vĩnh viễn'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

`getContactSettings` đã trả thẳng `App.ContactSettings` (`.then((r) => r.data)`).

- [ ] **Step 3: Nút trên 2 trang Hồ sơ**

`pages/customer/ProfilePage.tsx` — thêm import `import DeleteAccountSheet from '@/components/common/DeleteAccountSheet'`, state `const [showDelete, setShowDelete] = useState(false)`, và ngay sau `</button>` của nút "Đăng xuất":

```tsx
      <button type="button" onClick={() => setShowDelete(true)}
        className="self-center text-[12px] text-danger-red/80 underline underline-offset-2 py-1">
        Xoá tài khoản
      </button>
      <DeleteAccountSheet open={showDelete} onClose={() => setShowDelete(false)} />
```

`pages/driver/ProfilePage.tsx` — cùng import/state; ngay sau `</div>` đóng khối chứa nút "Đăng xuất" (trước `{/* Referral section */}`):

```tsx
      <div className="flex justify-center mt-2">
        <button type="button" onClick={() => setShowDelete(true)}
          className="text-[12px] text-danger-red/80 underline underline-offset-2 py-1">
          Xoá tài khoản
        </button>
      </div>
      <DeleteAccountSheet open={showDelete} onClose={() => setShowDelete(false)} />
```

(Nếu `useState` chưa import ở file nào, thêm vào import `react` sẵn có.)

- [ ] **Step 4: Ẩn nút gọi khi không có SĐT**

`src/types.d.ts` — trong kiểu `driver` của `Booking`, đổi `phone: string` thành `phone: string | null` (đúng khối có `vehicle_plate`; kiểm bằng `grep -n "vehicle_plate" -B6 src/types.d.ts`).

`pages/driver/TripDetailPage.tsx:189` — bọc thẻ `<a href={`tel:${trip.customer_phone}`} …>…</a>` trong `{trip.customer_phone && (…)}`.

`pages/customer/BookingStatusPage.tsx:192` và `:497` — bọc từng thẻ `<a href={`tel:${booking.driver.phone}`} …>…</a>` trong `{booking.driver.phone && (…)}`.

- [ ] **Step 5: Kiểm tra**

Run: `cd frontend && npx tsc -b --noEmit && npx eslint src/components/common/DeleteAccountSheet.tsx src/api/auth.ts && npm run build:customer -- --mode staging >/dev/null && npm run build:driver -- --mode staging >/dev/null && echo ok`
Expected: `ok` (không lỗi tsc/eslint mới; cảnh báo cũ ở các trang đã có từ trước thì để nguyên).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/auth.ts frontend/src/components/common/DeleteAccountSheet.tsx frontend/src/pages/customer/ProfilePage.tsx frontend/src/pages/driver/ProfilePage.tsx frontend/src/pages/driver/TripDetailPage.tsx frontend/src/pages/customer/BookingStatusPage.tsx frontend/src/types.d.ts
git commit -m "feat(account): nút Xoá tài khoản ở Hồ sơ khách/tài xế, xác nhận bằng PIN"
```

---

### Task 7: e2e luồng xoá tài khoản

**Files:**
- Create: `frontend/e2e/account-deletion.spec.ts`

**Interfaces:**
- Consumes: `APP`, `TEST_PASSWORD`, `randomPhone` (`e2e/fixtures/testData`), `registerCustomer` (`e2e/fixtures/auth`).

- [ ] **Step 1: Viết spec**

```ts
import { test, expect } from '@playwright/test'
import { APP, TEST_PASSWORD, randomPhone } from './fixtures/testData'
import { registerCustomer } from './fixtures/auth'

test.describe('Xoá tài khoản', () => {
  test('khách tự xoá tài khoản → về màn đăng nhập, không đăng nhập lại được', async ({ page }) => {
    const phone = randomPhone()
    await registerCustomer(page, phone)

    await page.goto(`${APP.customer}/customer/profile`)
    await page.getByRole('button', { name: 'Xoá tài khoản' }).click()
    const del = page.getByRole('button', { name: 'Xoá vĩnh viễn' })
    await expect(del).toBeDisabled()

    await page.getByLabel('Nhập mã PIN để xác nhận').fill('111111')
    await del.click()
    await expect(page.getByText('Mã PIN không đúng.')).toBeVisible()

    await page.getByLabel('Nhập mã PIN để xác nhận').fill(TEST_PASSWORD)
    await del.click()
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByText('Tài khoản của bạn đã được xoá')).toBeVisible()
  })
})
```

- [ ] **Step 2: Chạy (chỉ khi được phép)**

e2e chạy trên repo chính với Docker và **dùng chung DB** (`frontend/e2e/README.md`). **Hỏi người dùng trước khi chạy.** Khi được phép:

Run: `cd frontend && npx playwright test e2e/account-deletion.spec.ts`
Expected: 1 passed.

- [ ] **Step 3: Commit**

```bash
git add frontend/e2e/account-deletion.spec.ts
git commit -m "test(e2e): khách tự xoá tài khoản"
```

---

### Task 8: Kiểm toàn bộ

- [ ] **Step 1:** `.superpowers/sdd/2026-10-14-account-deletion/be php artisan test` → toàn bộ pass (trước nhánh: 599 passed / 13 skipped).
- [ ] **Step 2:** `.superpowers/sdd/2026-10-14-account-deletion/be ./vendor/bin/pint --test` cho các file PHP mới/sửa → PASS.
- [ ] **Step 3:** `cd frontend && npx tsc -b --noEmit` → không lỗi.
