# Tuỳ chọn VIP (xe cá nhân) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khách đặt xe chọn được **VIP** — cam kết xe cá nhân, biển trắng — và cuốc đó chỉ đến tay tài xế đã khai xe cá nhân, với bảng giá riêng.

**Architecture:** VIP là cột boolean `is_vip` trên `bookings`, `driver_profiles`, `price_configs` — **không** phải giá trị thứ tư của `vehicle_type`, vì `vehicle_type` là thang sức chứa (`VehicleCapacity::RANK`) mà xe biển trắng thì có thể 4, 5 hay 7 chỗ. Quy tắc ghép cuốc gom về một chỗ duy nhất là `App\Support\VehicleCapacity`.

**Tech Stack:** Laravel 13 / PHP 8.4 · MySQL 8 (prod) + sqlite (test) · Redis cache · React 19 + TypeScript + Tailwind v3 · PHPUnit

**Spec:** `docs/superpowers/specs/2026-08-10-vip-vehicle-option-design.md`

## Global Constraints

- Mọi chuỗi hiển thị là **tiếng Việt**. Không dịch sang tiếng Anh ở bất kỳ đâu.
- Tên cột là `is_vip` ở cả ba bảng — không đặt tên khác nhau giữa các bảng.
- Cột `is_vip` luôn là `boolean NOT NULL DEFAULT false`.
- Test chạy trên **sqlite** (`phpunit.xml` đặt `APP_ENV=testing`). Cấm `withCount()+having()` (sqlite báo "HAVING clause on a non-aggregate query") và cấm hàm SQL riêng của MySQL như `DATE_FORMAT`.
- `down()` của mọi migration bọc trong `Schema::hasColumn()` — rollback trên MySQL và sqlite hành xử khác nhau.
- Phí app vẫn **20%** cho cuốc VIP, không có mức riêng.
- Chạy test: `docker compose exec app php artisan test --filter=<TênTest>`
- Chạy lint backend: `docker compose exec app ./vendor/bin/pint`
- Chạy check frontend: `cd frontend && npx tsc -b --noEmit && npx eslint src`

---

### Task 1: Dọn bản sao quy tắc sức chứa trong TripController

Đây là **refactor thuần, không đổi hành vi**. Làm trước để nếu test vỡ thì biết chắc là do việc dọn, không phải do tính năng VIP.

`TripController` đang giữ bản sao của quy tắc sức chứa, trong khi `VehicleCapacity` có docblock tự nhận là "NGUỒN DUY NHẤT". Ở Task 3 ta thêm chiều VIP vào `VehicleCapacity`; nếu bản sao còn đó thì cuốc VIP sẽ lọt xuống tài xế thường **mà không có lỗi nào báo**.

**Files:**
- Modify: `backend/app/Http/Controllers/Driver/TripController.php` (xoá `VEHICLE_CAPACITY_RANK`, `vehicleTypesFittingDriver()`, `fitsDriverVehicle()`)
- Test: `backend/tests/Feature/TripVehicleCapacityTest.php`, `backend/tests/Feature/AvailableTripsListTest.php` (đã có sẵn, không sửa)

**Interfaces:**
- Consumes: `App\Support\VehicleCapacity::bookingTypesFittingDriver(?string): array`, `VehicleCapacity::fits(?string $bookingType, ?string $driverType): bool`
- Produces: `TripController` không còn thành viên nào về sức chứa — Task 3 và Task 5 chỉ sửa `VehicleCapacity`

- [ ] **Step 1: Chạy test hiện có để có mốc so sánh**

```bash
docker compose exec app php artisan test --filter=TripVehicleCapacityTest
docker compose exec app php artisan test --filter=AvailableTripsListTest
```

Expected: PASS cả hai. Nếu đã đỏ từ trước thì dừng lại, báo người review — không sửa tiếp trên nền đỏ.

- [ ] **Step 2: Thêm import VehicleCapacity**

Trong `backend/app/Http/Controllers/Driver/TripController.php`, thêm vào khối `use` (giữ thứ tự alphabet):

```php
use App\Support\VehicleCapacity;
```

- [ ] **Step 3: Thay lời gọi trong index()**

Dòng 48 hiện là:

```php
$allowed = $this->vehicleTypesFittingDriver($profile?->vehicle_type);
```

Đổi thành:

```php
$allowed = VehicleCapacity::bookingTypesFittingDriver($profile?->vehicle_type);
```

- [ ] **Step 4: Thay lời gọi trong accept()**

Dòng 109 hiện là:

```php
if (! $this->fitsDriverVehicle($booking->vehicle_type, $request->user()->driverProfile?->vehicle_type)) {
```

Đổi thành:

```php
if (! VehicleCapacity::fits($booking->vehicle_type, $request->user()->driverProfile?->vehicle_type)) {
```

- [ ] **Step 5: Xoá ba thành viên thừa**

Xoá khỏi `TripController`: hằng `VEHICLE_CAPACITY_RANK`, method `vehicleTypesFittingDriver()`, method `fitsDriverVehicle()` (kèm docblock của chúng).

- [ ] **Step 6: Kiểm tra không còn tham chiếu nào sót**

```bash
grep -n "VEHICLE_CAPACITY_RANK\|fitsDriverVehicle\|vehicleTypesFittingDriver" backend/app/Http/Controllers/Driver/TripController.php
```

Expected: không ra dòng nào.

- [ ] **Step 7: Chạy lại test**

```bash
docker compose exec app php artisan test --filter=TripVehicleCapacityTest
docker compose exec app php artisan test --filter=AvailableTripsListTest
docker compose exec app php artisan test --filter=TripCapacityLimitTest
```

Expected: PASS cả ba, y hệt Step 1.

- [ ] **Step 8: Commit**

```bash
git add backend/app/Http/Controllers/Driver/TripController.php
git commit -m "refactor(trips): TripController dùng VehicleCapacity thay bản sao nội bộ

VehicleCapacity tự nhận là nguồn duy nhất của quy tắc sức chứa nhưng
TripController vẫn giữ bản sao RANK + hai hàm lọc. Hai bản lệch nhau là lỗi
âm thầm: danh sách và accept() cho kết quả khác nhau mà không ai báo."
```

---

### Task 2: Cột is_vip trên ba bảng

**Files:**
- Create: `backend/database/migrations/2026_08_10_000001_add_is_vip_to_bookings_table.php`
- Create: `backend/database/migrations/2026_08_10_000002_add_is_vip_to_driver_profiles_table.php`
- Create: `backend/database/migrations/2026_08_10_000003_add_is_vip_to_price_configs_table.php`
- Modify: `backend/app/Models/Booking.php` (`$fillable`, `$casts`)
- Modify: `backend/app/Models/DriverProfile.php` (`$fillable`, `$casts`)
- Modify: `backend/app/Models/PriceConfig.php` (`$fillable`, `$casts`)
- Test: `backend/tests/Feature/VipColumnTest.php` (tạo mới)

**Interfaces:**
- Produces: `Booking->is_vip`, `DriverProfile->is_vip`, `PriceConfig->is_vip` — đều là `bool`, mặc định `false`, dùng được trong `create()` và `update()`

- [ ] **Step 1: Viết test thất bại**

Tạo `backend/tests/Feature/VipColumnTest.php`:

```php
<?php
// backend/tests/Feature/VipColumnTest.php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\DriverProfile;
use App\Models\PriceConfig;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class VipColumnTest extends TestCase
{
    use RefreshDatabase;

    public function test_booking_is_vip_defaults_to_false_and_is_fillable(): void
    {
        $customer = User::factory()->create(['role' => 'customer']);

        $plain = Booking::create([
            'customer_id' => $customer->id,
            'pickup' => 'Hà Nội',
            'destination' => 'Sân bay Nội Bài',
            'date' => now()->addDay()->format('Y-m-d'),
            'time' => '08:00',
            'vehicle_type' => 'sedan_4',
            'distance_km' => 30,
            'price' => 500_000,
            'discount' => 0,
            'surcharge' => 0,
            'status' => 'finding_driver',
        ]);
        $this->assertFalse($plain->fresh()->is_vip);

        $vip = Booking::create([
            'customer_id' => $customer->id,
            'pickup' => 'Hà Nội',
            'destination' => 'Sân bay Nội Bài',
            'date' => now()->addDay()->format('Y-m-d'),
            'time' => '09:00',
            'vehicle_type' => 'sedan_4',
            'distance_km' => 30,
            'price' => 500_000,
            'discount' => 0,
            'surcharge' => 0,
            'status' => 'finding_driver',
            'is_vip' => true,
        ]);
        $this->assertTrue($vip->fresh()->is_vip);
    }

    public function test_driver_profile_is_vip_defaults_to_false_and_is_fillable(): void
    {
        $driver = User::factory()->create(['role' => 'driver']);

        $profile = DriverProfile::create([
            'user_id' => $driver->id,
            'vehicle_make' => 'Toyota',
            'vehicle_model' => 'Camry',
            'vehicle_plate' => '51G-12345',
            'vehicle_year' => 2020,
            'vehicle_color' => 'Trắng',
            'vehicle_type' => 'sedan_4',
            'status' => 'active',
        ]);
        $this->assertFalse($profile->fresh()->is_vip);

        $profile->update(['is_vip' => true]);
        $this->assertTrue($profile->fresh()->is_vip);
    }

    public function test_price_config_is_vip_defaults_to_false_and_is_fillable(): void
    {
        $config = PriceConfig::create([
            'service_type' => 'airport',
            'trip_type' => 'one_way',
            'vehicle_type' => 'sedan_4',
            'price_type' => 'range',
            'min_price' => 200_000,
            'max_price' => 300_000,
        ]);
        $this->assertFalse($config->fresh()->is_vip);

        $vipConfig = PriceConfig::create([
            'service_type' => 'airport',
            'trip_type' => 'one_way',
            'vehicle_type' => 'sedan_4',
            'price_type' => 'range',
            'min_price' => 350_000,
            'max_price' => 500_000,
            'is_vip' => true,
        ]);
        $this->assertTrue($vipConfig->fresh()->is_vip);
    }
}
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

```bash
docker compose exec app php artisan test --filter=VipColumnTest
```

Expected: FAIL — sqlite báo `no such column: is_vip`.

- [ ] **Step 3: Migration cho bookings**

Tạo `backend/database/migrations/2026_08_10_000001_add_is_vip_to_bookings_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * VIP = xe cá nhân, biển trắng, KHÔNG phải xe dịch vụ.
 *
 * Không phải hạng xe sang, và cố ý KHÔNG nhét vào enum `vehicle_type`:
 * vehicle_type là thang sức chứa (4 < 5 < 7 chỗ), còn xe biển trắng thì có thể
 * là bất kỳ số chỗ nào. Gán cho VIP một bậc trên thang đó thì hoặc tài xế VIP
 * 4 chỗ bị đẩy cuốc 7 chỗ, hoặc tài xế 7 chỗ biển vàng nhận được cuốc VIP.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->boolean('is_vip')->default(false)->after('vehicle_type');
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            if (Schema::hasColumn('bookings', 'is_vip')) {
                $table->dropColumn('is_vip');
            }
        });
    }
};
```

- [ ] **Step 4: Migration cho driver_profiles**

Tạo `backend/database/migrations/2026_08_10_000002_add_is_vip_to_driver_profiles_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Xe của tài xế là xe cá nhân, biển trắng.
 *
 * Hệ thống chỉ lưu chuỗi biển số nên không tự phân biệt được biển trắng/vàng —
 * giá trị này do tài xế tự khai lúc đăng ký và admin xác nhận khi duyệt hồ sơ.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('driver_profiles', function (Blueprint $table) {
            $table->boolean('is_vip')->default(false)->after('vehicle_type');
        });
    }

    public function down(): void
    {
        Schema::table('driver_profiles', function (Blueprint $table) {
            if (Schema::hasColumn('driver_profiles', 'is_vip')) {
                $table->dropColumn('is_vip');
            }
        });
    }
};
```

- [ ] **Step 5: Migration cho price_configs**

Tạo `backend/database/migrations/2026_08_10_000003_add_is_vip_to_price_configs_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Dòng bảng giá này áp cho cuốc VIP.
 *
 * Khoá tra bảng giá đổi từ (service_type, trip_type, vehicle_type) thành
 * (service_type, trip_type, vehicle_type, is_vip). Bảng không có unique index ở
 * tầng DB — việc chống trùng nằm trong PriceConfigController::store().
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('price_configs', function (Blueprint $table) {
            $table->boolean('is_vip')->default(false)->after('vehicle_type');
        });
    }

    public function down(): void
    {
        Schema::table('price_configs', function (Blueprint $table) {
            if (Schema::hasColumn('price_configs', 'is_vip')) {
                $table->dropColumn('is_vip');
            }
        });
    }
};
```

- [ ] **Step 6: Khai báo trong ba model**

`backend/app/Models/Booking.php` — thêm `'is_vip'` vào `$fillable` ngay sau `'vehicle_type'`, và thêm vào `$casts`:

```php
    protected $casts = [
        'cancelled_at' => 'datetime',
        'accepted_at'  => 'datetime',
        'is_vip'       => 'boolean',
    ];
```

`backend/app/Models/DriverProfile.php` — thêm `'is_vip'` vào `$fillable` ngay sau `'vehicle_type'`, và thêm `'is_vip' => 'boolean',` vào `$casts`.

`backend/app/Models/PriceConfig.php` — thêm `'is_vip'` vào `$fillable` ngay sau `'vehicle_type'`, và thêm `'is_vip' => 'boolean',` vào `$casts`.

- [ ] **Step 7: Chạy test để xác nhận đã xanh**

```bash
docker compose exec app php artisan test --filter=VipColumnTest
```

Expected: PASS 3 test.

- [ ] **Step 8: Chạy migration trên DB dev**

```bash
docker compose exec app php artisan migrate
```

Expected: 3 migration chạy xong, không lỗi.

- [ ] **Step 9: Commit**

```bash
git add backend/database/migrations/2026_08_10_00000*_add_is_vip_to_*.php \
        backend/app/Models/Booking.php \
        backend/app/Models/DriverProfile.php \
        backend/app/Models/PriceConfig.php \
        backend/tests/Feature/VipColumnTest.php
git commit -m "feat(vip): thêm cột is_vip cho bookings, driver_profiles, price_configs"
```

---

### Task 3: VehicleCapacity nhận chiều VIP

**Files:**
- Modify: `backend/app/Support/VehicleCapacity.php`
- Test: `backend/tests/Unit/Support/VehicleCapacityTest.php` (tạo mới)

**Interfaces:**
- Produces: `VehicleCapacity::fits(?string $bookingType, ?string $driverType, bool $bookingIsVip = false, bool $driverIsVip = false): bool` — hai tham số mới có giá trị mặc định nên mọi lời gọi cũ vẫn biên dịch được
- `bookingTypesFittingDriver()` và `driverTypesFittingBooking()` **giữ nguyên chữ ký**, chỉ nói về sức chứa. Điều kiện VIP là một `where` riêng ở tầng SQL (Task 5, Task 6) — cố ý tách để danh sách loại xe vẫn dùng được làm khoá cache

- [ ] **Step 1: Viết test thất bại**

Tạo `backend/tests/Unit/Support/VehicleCapacityTest.php`:

```php
<?php
// backend/tests/Unit/Support/VehicleCapacityTest.php

namespace Tests\Unit\Support;

use App\Support\VehicleCapacity;
use PHPUnit\Framework\TestCase;

class VehicleCapacityTest extends TestCase
{
    public function test_vip_booking_needs_vip_driver(): void
    {
        $this->assertTrue(VehicleCapacity::fits('sedan_4', 'sedan_4', true, true));
        $this->assertFalse(VehicleCapacity::fits('sedan_4', 'sedan_4', true, false));
    }

    public function test_vip_driver_can_take_normal_booking(): void
    {
        $this->assertTrue(VehicleCapacity::fits('sedan_4', 'sedan_4', false, true));
    }

    public function test_normal_booking_normal_driver_unchanged(): void
    {
        $this->assertTrue(VehicleCapacity::fits('sedan_4', 'sedan_4', false, false));
        $this->assertFalse(VehicleCapacity::fits('mpv_7', 'sedan_4', false, false));
    }

    /**
     * Nhánh "xe không rõ loại thì cho phép tất cả" KHÔNG được nuốt luôn điều
     * kiện VIP: tài xế chưa khai loại xe mà không phải xe cá nhân thì vẫn phải
     * bị chặn khỏi cuốc VIP.
     */
    public function test_unknown_vehicle_type_still_blocked_from_vip(): void
    {
        $this->assertTrue(VehicleCapacity::fits('mpv_7', null, false, false));
        $this->assertFalse(VehicleCapacity::fits('mpv_7', null, true, false));
        $this->assertTrue(VehicleCapacity::fits('mpv_7', null, true, true));
    }

    public function test_vip_does_not_bypass_capacity(): void
    {
        // Tài xế VIP nhưng xe 4 chỗ vẫn không chở được cuốc VIP 7 chỗ
        $this->assertFalse(VehicleCapacity::fits('mpv_7', 'sedan_4', true, true));
    }

    public function test_capacity_helpers_stay_vip_agnostic(): void
    {
        $this->assertEquals(
            ['sedan_4', 'suv_5'],
            VehicleCapacity::bookingTypesFittingDriver('suv_5'),
        );
        $this->assertEquals(
            ['suv_5', 'mpv_7'],
            VehicleCapacity::driverTypesFittingBooking('suv_5'),
        );
    }
}
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

```bash
docker compose exec app php artisan test --filter=VehicleCapacityTest
```

Expected: FAIL — `test_vip_booking_needs_vip_driver` báo `assertFalse` nhận `true`, vì `fits()` hiện bỏ qua hai tham số mới.

- [ ] **Step 3: Sửa VehicleCapacity::fits()**

Trong `backend/app/Support/VehicleCapacity.php`, thay toàn bộ method `fits()`:

```php
    /**
     * Tài xế có nhận được cuốc này không — vị từ ĐẦY ĐỦ, gồm cả sức chứa lẫn VIP.
     *
     * @param  bool  $bookingIsVip  Khách yêu cầu xe cá nhân (biển trắng)
     * @param  bool  $driverIsVip   Xe của tài xế là xe cá nhân
     */
    public static function fits(
        ?string $bookingType,
        ?string $driverType,
        bool $bookingIsVip = false,
        bool $driverIsVip = false,
    ): bool {
        // Kiểm VIP TRƯỚC nhánh "xe không rõ loại thì cho phép tất cả" bên dưới.
        // Đảo thứ tự thì tài xế chưa khai vehicle_type sẽ lọt qua cả cuốc VIP —
        // đúng nhóm dễ lọt nhất, vì cột đó nullable và có tài xế cũ bỏ trống.
        if ($bookingIsVip && ! $driverIsVip) {
            return false;
        }

        if (! $driverType || ! isset(self::RANK[$driverType])) {
            return true;
        }

        return (self::RANK[$bookingType] ?? 0) <= self::RANK[$driverType];
    }
```

- [ ] **Step 4: Chạy test để xác nhận xanh**

```bash
docker compose exec app php artisan test --filter=VehicleCapacityTest
```

Expected: PASS 6 test.

- [ ] **Step 5: Chạy lại test sức chứa cũ để chắc không hồi quy**

```bash
docker compose exec app php artisan test --filter=TripVehicleCapacityTest
```

Expected: PASS — hai tham số mới có mặc định `false` nên lời gọi cũ giữ nguyên hành vi.

- [ ] **Step 6: Commit**

```bash
git add backend/app/Support/VehicleCapacity.php backend/tests/Unit/Support/VehicleCapacityTest.php
git commit -m "feat(vip): VehicleCapacity::fits() nhận thêm chiều VIP

Điều kiện VIP đặt TRƯỚC nhánh 'xe không rõ loại thì cho phép tất cả', nếu
không tài xế chưa khai vehicle_type sẽ nhận được cả cuốc VIP."
```

---

### Task 4: AvailableTripsCache tách khoá theo VIP

Cache khoá theo tập loại xe. Cuốc VIP và cuốc thường cùng loại xe mà dùng chung entry thì: tài xế VIP mở app trước → nạp cache **có** cuốc VIP → tài xế thường đọc trúng entry đó → **nhìn thấy cuốc VIP**. Bộ lọc SQL ở Task 5 đúng vẫn không cứu được, vì query không chạy lại.

**Files:**
- Modify: `backend/app/Support/AvailableTripsCache.php`
- Modify: `backend/app/Http/Controllers/Driver/TripController.php:54` (lời gọi `remember`)
- Test: `backend/tests/Feature/VipTripVisibilityTest.php` (tạo mới, dùng lại ở Task 5)

**Interfaces:**
- Consumes: `VehicleCapacity::bookingTypesFittingDriver()` (Task 1)
- Produces: `AvailableTripsCache::remember(array $vehicleTypes, bool $driverIsVip, Closure $callback): mixed` — **chữ ký đổi**, tham số thứ hai là bắt buộc; `flush()` giữ nguyên

- [ ] **Step 1: Viết test thất bại**

Tạo `backend/tests/Feature/VipTripVisibilityTest.php`:

```php
<?php
// backend/tests/Feature/VipTripVisibilityTest.php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use App\Models\Wallet;
use App\Support\AvailableTripsCache;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class VipTripVisibilityTest extends TestCase
{
    use RefreshDatabase;

    private function makeDriver(bool $isVip, string $vehicleType = 'sedan_4'): User
    {
        $driver = User::factory()->create(['role' => 'driver']);
        $driver->driverProfile()->create([
            'vehicle_make' => 'Toyota',
            'vehicle_model' => 'Camry',
            'vehicle_plate' => '51G-'.random_int(10000, 99999),
            'vehicle_year' => 2020,
            'vehicle_color' => 'Trắng',
            'vehicle_type' => $vehicleType,
            'is_vip' => $isVip,
            'status' => 'active',
        ]);
        Wallet::create(['user_id' => $driver->id, 'points' => 1000]);

        return $driver;
    }

    private function makeBooking(bool $isVip, string $vehicleType = 'sedan_4'): Booking
    {
        $customer = User::factory()->create(['role' => 'customer']);

        return Booking::create([
            'customer_id' => $customer->id,
            'pickup' => 'Hà Nội',
            'destination' => 'Sân bay Nội Bài',
            'date' => now()->addDay()->format('Y-m-d'),
            'time' => '08:00',
            'vehicle_type' => $vehicleType,
            'is_vip' => $isVip,
            'distance_km' => 30,
            'price' => 500_000,
            'discount' => 0,
            'surcharge' => 0,
            'status' => 'finding_driver',
        ]);
    }

    /**
     * Bài test quan trọng nhất của Task 4: tài xế VIP gọi TRƯỚC để nạp cache,
     * rồi tài xế thường gọi sau. Nếu hai bên dùng chung entry cache thì tài xế
     * thường sẽ thấy cuốc VIP dù bộ lọc SQL viết đúng.
     */
    public function test_normal_driver_does_not_read_vip_entry_from_cache(): void
    {
        $vipBooking = $this->makeBooking(true);
        $plainBooking = $this->makeBooking(false);

        $vipDriver = $this->makeDriver(true);
        $vipIds = collect($this->actingAs($vipDriver, 'sanctum')
            ->getJson('/api/driver/trips')->assertOk()->json())->pluck('id')->sort()->values()->all();
        $this->assertEquals(
            collect([$vipBooking->id, $plainBooking->id])->sort()->values()->all(),
            $vipIds,
            'tài xế VIP phải thấy cả cuốc VIP lẫn cuốc thường',
        );

        // KHÔNG flush cache — đó chính là điều kiện tái hiện lỗi
        $plainDriver = $this->makeDriver(false);
        $plainIds = collect($this->actingAs($plainDriver, 'sanctum')
            ->getJson('/api/driver/trips')->assertOk()->json())->pluck('id')->all();

        $this->assertEquals([$plainBooking->id], $plainIds);
    }

    public function test_cache_flush_still_works(): void
    {
        $this->makeBooking(false);
        $driver = $this->makeDriver(false);

        $this->actingAs($driver, 'sanctum')->getJson('/api/driver/trips')->assertOk();

        $fresh = $this->makeBooking(false);
        AvailableTripsCache::flush();

        $ids = collect($this->actingAs($driver, 'sanctum')
            ->getJson('/api/driver/trips')->assertOk()->json())->pluck('id')->all();

        $this->assertContains($fresh->id, $ids);
    }
}
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

```bash
docker compose exec app php artisan test --filter=VipTripVisibilityTest
```

Expected: FAIL — `test_normal_driver_does_not_read_vip_entry_from_cache` thấy 2 cuốc thay vì 1.

> Nếu test này lại PASS ngay: kiểm tra `phpunit.xml` có đặt `CACHE_STORE=array` không. Cache `array` không sống qua request nên không tái hiện được lỗi. Trường hợp đó, đổi test sang gọi thẳng `AvailableTripsCache::remember()` hai lần với `$driverIsVip` khác nhau và khẳng định callback chạy đủ hai lần.

- [ ] **Step 3: Sửa AvailableTripsCache**

Trong `backend/app/Support/AvailableTripsCache.php`, thay `remember()` và `key()`:

```php
    /**
     * @param  bool  $driverIsVip  Tài xế lái xe cá nhân — thấy được cả cuốc VIP.
     *   PHẢI nằm trong khoá cache: hai nhóm tài xế có danh sách khác nhau, dùng
     *   chung entry thì nhóm thường đọc trúng cache do nhóm VIP nạp và nhìn
     *   thấy cuốc VIP, dù query lọc đúng.
     */
    public static function remember(array $vehicleTypes, bool $driverIsVip, Closure $callback): mixed
    {
        return Cache::remember(self::key($vehicleTypes, $driverIsVip), self::TTL, $callback);
    }
```

```php
    private static function key(array $vehicleTypes, bool $driverIsVip): string
    {
        sort($vehicleTypes);

        return 'trips:available:v'.self::version()
            .':'.implode(',', $vehicleTypes)
            .($driverIsVip ? ':vip' : '');
    }
```

- [ ] **Step 4: Cập nhật lời gọi trong TripController::index()**

Trong `backend/app/Http/Controllers/Driver/TripController.php`, ngay sau dòng lấy `$allowed`, thêm:

```php
        $driverIsVip = (bool) $profile?->is_vip;
```

rồi đổi lời gọi `AvailableTripsCache::remember($allowed, fn () => ...)` thành:

```php
        $trips = AvailableTripsCache::remember($allowed, $driverIsVip, fn () => Booking::with('customer')
```

(phần thân closure giữ nguyên ở bước này — bộ lọc SQL là Task 5)

- [ ] **Step 5: Chạy test**

```bash
docker compose exec app php artisan test --filter=VipTripVisibilityTest
```

Expected: `test_cache_flush_still_works` PASS. `test_normal_driver_does_not_read_vip_entry_from_cache` **vẫn FAIL** — cache đã tách nhưng query chưa lọc `is_vip`. Đó là đúng, Task 5 sẽ đóng nốt.

- [ ] **Step 6: Chạy test cache cũ để chắc không hồi quy**

```bash
docker compose exec app php artisan test --filter=AvailableTripsListTest
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/Support/AvailableTripsCache.php \
        backend/app/Http/Controllers/Driver/TripController.php \
        backend/tests/Feature/VipTripVisibilityTest.php
git commit -m "feat(vip): tách khoá AvailableTripsCache theo cờ VIP của tài xế

Dùng chung entry thì tài xế thường đọc trúng cache do tài xế VIP nạp và nhìn
thấy cuốc VIP — bộ lọc SQL đúng cũng không cứu được vì query không chạy lại."
```

---

### Task 5: TripController lọc cuốc VIP ở index() và accept()

**Files:**
- Modify: `backend/app/Http/Controllers/Driver/TripController.php` (`index()`, `accept()`)
- Test: `backend/tests/Feature/VipTripVisibilityTest.php` (bổ sung test cho `accept`)

**Interfaces:**
- Consumes: `VehicleCapacity::fits(?string, ?string, bool, bool): bool` (Task 3), `AvailableTripsCache::remember(array, bool, Closure)` (Task 4), `Booking->is_vip` / `DriverProfile->is_vip` (Task 2)

- [ ] **Step 1: Thêm test cho accept()**

Thêm vào `backend/tests/Feature/VipTripVisibilityTest.php` (giữ nguyên các test đã có):

```php
    public function test_normal_driver_cannot_accept_vip_booking(): void
    {
        \Illuminate\Support\Facades\Notification::fake();

        $booking = $this->makeBooking(true);
        $driver = $this->makeDriver(false);

        $this->actingAs($driver, 'sanctum')
            ->postJson("/api/driver/trips/{$booking->id}/accept")
            ->assertStatus(422)
            ->assertJsonPath('message', 'Cuốc VIP chỉ dành cho tài xế xe cá nhân (biển trắng).');

        $this->assertEquals('finding_driver', $booking->fresh()->status);
        $this->assertNull($booking->fresh()->driver_id);
    }

    public function test_vip_driver_can_accept_vip_booking(): void
    {
        \Illuminate\Support\Facades\Notification::fake();

        $booking = $this->makeBooking(true);
        $driver = $this->makeDriver(true);

        $this->actingAs($driver, 'sanctum')
            ->postJson("/api/driver/trips/{$booking->id}/accept")
            ->assertOk();

        $this->assertEquals('accepted', $booking->fresh()->status);
        $this->assertEquals($driver->id, $booking->fresh()->driver_id);
    }

    /**
     * Thông báo lỗi phải nói đúng lý do. Tài xế VIP xe 4 chỗ bấm cuốc VIP 7 chỗ
     * là hỏng vì SỨC CHỨA, không phải vì VIP — báo nhầm thì tài xế đi liên hệ
     * admin xin duyệt VIP trong khi vấn đề là xe nhỏ.
     */
    public function test_capacity_message_wins_when_driver_is_vip(): void
    {
        \Illuminate\Support\Facades\Notification::fake();

        $booking = $this->makeBooking(true, 'mpv_7');
        $driver = $this->makeDriver(true, 'sedan_4');

        $this->actingAs($driver, 'sanctum')
            ->postJson("/api/driver/trips/{$booking->id}/accept")
            ->assertStatus(422)
            ->assertJsonPath('message', 'Cuốc này cần xe lớn hơn, không phù hợp với xe của bạn.');
    }
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

```bash
docker compose exec app php artisan test --filter=VipTripVisibilityTest
```

Expected: FAIL — `test_normal_driver_cannot_accept_vip_booking` nhận 200 thay vì 422.

- [ ] **Step 3: Lọc is_vip trong index()**

Trong closure query của `index()`, thêm `->when()` ngay sau `->whereIn('vehicle_type', $allowed)`:

```php
            ->whereIn('vehicle_type', $allowed)
            // Tài xế thường không thấy cuốc VIP. Tài xế VIP thấy cả hai — xe
            // biển trắng chạy cuốc thường được, không có lý do chặn.
            ->when(! $driverIsVip, fn ($q) => $q->where('is_vip', false))
```

- [ ] **Step 4: Lọc VIP trong accept()**

Thay khối kiểm tra xe hiện tại trong `accept()`:

```php
        $profile = $request->user()->driverProfile;

        if (! VehicleCapacity::fits(
            $booking->vehicle_type,
            $profile?->vehicle_type,
            (bool) $booking->is_vip,
            (bool) $profile?->is_vip,
        )) {
            // Chọn thông báo theo lý do THẬT: báo nhầm "cần xe lớn hơn" cho một
            // tài xế bị chặn vì không phải xe cá nhân sẽ khiến họ đi đổi xe.
            return response()->json([
                'message' => $booking->is_vip && ! $profile?->is_vip
                    ? 'Cuốc VIP chỉ dành cho tài xế xe cá nhân (biển trắng).'
                    : 'Cuốc này cần xe lớn hơn, không phù hợp với xe của bạn.',
            ], 422);
        }
```

- [ ] **Step 5: Chạy test**

```bash
docker compose exec app php artisan test --filter=VipTripVisibilityTest
```

Expected: PASS toàn bộ 5 test, kể cả `test_normal_driver_does_not_read_vip_entry_from_cache` từ Task 4.

- [ ] **Step 6: Mở rộng test parity SQL ↔ PHP**

Trong `backend/tests/Feature/AvailableTripsListTest.php`, thêm test mới (giữ nguyên test cũ):

```php
    /**
     * Parity cho chiều VIP: bộ lọc SQL trong index() và vị từ PHP
     * VehicleCapacity::fits() phải khớp ở MỌI tổ hợp (loại xe × VIP).
     * Lệch nhau nghĩa là cuốc hiện trong danh sách nhưng bấm nhận thì 422.
     */
    public function test_sql_filter_matches_fits_for_every_vip_combination(): void
    {
        $types = ['sedan_4', 'suv_5', 'mpv_7'];
        $cases = [];
        foreach ($types as $t) {
            foreach ([false, true] as $vip) {
                $booking = $this->makeWaitingBooking($t);
                $booking->update(['is_vip' => $vip]);
                $cases[] = ['id' => $booking->id, 'type' => $t, 'vip' => $vip];
            }
        }

        foreach ($types as $driverType) {
            foreach ([false, true] as $driverVip) {
                $driver = $this->makeDriver($driverType);
                $driver->driverProfile->update(['is_vip' => $driverVip]);
                \App\Support\AvailableTripsCache::flush();

                $returned = collect($this->actingAs($driver, 'sanctum')
                    ->getJson('/api/driver/trips')->assertOk()->json())
                    ->pluck('id')->sort()->values()->all();

                $expected = collect($cases)
                    ->filter(fn ($c) => \App\Support\VehicleCapacity::fits(
                        $c['type'], $driverType, $c['vip'], $driverVip,
                    ))
                    ->pluck('id')->sort()->values()->all();

                $this->assertEquals(
                    $expected,
                    $returned,
                    "lệch ở tài xế xe $driverType, vip=".var_export($driverVip, true),
                );
            }
        }
    }
```

- [ ] **Step 7: Chạy test parity**

```bash
docker compose exec app php artisan test --filter=AvailableTripsListTest
```

Expected: PASS. Nếu FAIL, đọc thông báo `"lệch ở tài xế xe ..."` để biết tổ hợp nào sai — gần như chắc chắn là thiếu `->when(! $driverIsVip, ...)` hoặc thiếu `AvailableTripsCache::flush()` giữa các vòng lặp.

- [ ] **Step 8: Commit**

```bash
git add backend/app/Http/Controllers/Driver/TripController.php \
        backend/tests/Feature/VipTripVisibilityTest.php \
        backend/tests/Feature/AvailableTripsListTest.php
git commit -m "feat(vip): tài xế thường không thấy và không nhận được cuốc VIP"
```

---

### Task 6: Push thông báo cuốc VIP chỉ tới tài xế xe cá nhân

**Files:**
- Modify: `backend/app/Jobs/SendNewBookingBroadcastJob.php`
- Test: `backend/tests/Feature/NewBookingBroadcastFilterTest.php` (bổ sung)

**Interfaces:**
- Consumes: `Booking->is_vip`, `DriverProfile->is_vip` (Task 2)

- [ ] **Step 1: Đọc test hiện có để lấy đúng helper**

```bash
sed -n 1,62p backend/tests/Feature/NewBookingBroadcastFilterTest.php
```

Ghi lại tên và chữ ký của các helper tạo tài xế / tạo cuốc trong file này để tái dùng ở Step 2 thay vì viết lại.

- [ ] **Step 2: Thêm test thất bại**

Thêm vào `backend/tests/Feature/NewBookingBroadcastFilterTest.php`, dùng helper đã đọc ở Step 1 (nếu helper tạo tài xế chưa nhận cờ VIP thì cập nhật profile sau khi tạo bằng `$driver->driverProfile->update(['is_vip' => true])`):

```php
    public function test_cuoc_vip_chi_bao_cho_tai_xe_xe_ca_nhan(): void
    {
        \Illuminate\Support\Facades\Notification::fake();

        $vipDriver = $this->makeOnlineDriver();
        $vipDriver->driverProfile->update(['is_vip' => true]);

        $plainDriver = $this->makeOnlineDriver();
        $plainDriver->driverProfile->update(['is_vip' => false]);

        $booking = $this->makeFindingBooking();
        $booking->update(['is_vip' => true]);

        (new \App\Jobs\SendNewBookingBroadcastJob($booking))->handle();

        \Illuminate\Support\Facades\Notification::assertSentTo(
            $vipDriver, \App\Notifications\NewBookingAvailableNotification::class);
        \Illuminate\Support\Facades\Notification::assertNotSentTo(
            $plainDriver, \App\Notifications\NewBookingAvailableNotification::class);
    }

    public function test_cuoc_thuong_van_bao_cho_ca_tai_xe_vip(): void
    {
        \Illuminate\Support\Facades\Notification::fake();

        $vipDriver = $this->makeOnlineDriver();
        $vipDriver->driverProfile->update(['is_vip' => true]);

        $booking = $this->makeFindingBooking();

        (new \App\Jobs\SendNewBookingBroadcastJob($booking))->handle();

        \Illuminate\Support\Facades\Notification::assertSentTo(
            $vipDriver, \App\Notifications\NewBookingAvailableNotification::class);
    }
```

> Nếu tên helper trong file khác `makeOnlineDriver()` / `makeFindingBooking()`, đổi theo tên thật đọc được ở Step 1 — **không** thêm helper trùng chức năng.

- [ ] **Step 3: Chạy test để xác nhận thất bại**

```bash
docker compose exec app php artisan test --filter=NewBookingBroadcastFilterTest
```

Expected: FAIL — `test_cuoc_vip_chi_bao_cho_tai_xe_xe_ca_nhan` báo đã gửi cho `$plainDriver`.

- [ ] **Step 4: Thêm bộ lọc VIP vào job**

Trong `backend/app/Jobs/SendNewBookingBroadcastJob.php`, sau dòng lấy `$fittingTypes`, thêm:

```php
        // Cuốc VIP chỉ tới tài xế xe cá nhân. Không lọc ở đây thì tài xế thường
        // nhận noti rồi bấm vào chỉ ăn 422 — đúng thứ bộ lọc loại xe sinh ra để
        // tránh.
        $bookingIsVip = (bool) $this->booking->is_vip;
```

và trong closure `whereHas('driverProfile', ...)`, thêm một dòng ngay sau `->where('is_online', true)`:

```php
                ->when($bookingIsVip, fn ($q2) => $q2->where('is_vip', true))
```

- [ ] **Step 5: Chạy test**

```bash
docker compose exec app php artisan test --filter=NewBookingBroadcastFilterTest
docker compose exec app php artisan test --filter=NewBookingNotificationChannelsTest
```

Expected: PASS cả hai.

- [ ] **Step 6: Commit**

```bash
git add backend/app/Jobs/SendNewBookingBroadcastJob.php \
        backend/tests/Feature/NewBookingBroadcastFilterTest.php
git commit -m "feat(vip): push cuốc VIP chỉ tới tài xế xe cá nhân"
```

---

### Task 7: BookingController nhận và trả về is_vip

**Files:**
- Modify: `backend/app/Http/Controllers/Customer/BookingController.php` (`store()` validate + create, `formatBooking()`)
- Test: `backend/tests/Feature/VipBookingCreateTest.php` (tạo mới)

**Interfaces:**
- Produces: `POST /api/bookings` nhận `is_vip` (boolean, tuỳ chọn, mặc định `false`); mọi response booking có trường `is_vip` kiểu bool

- [ ] **Step 1: Viết test thất bại**

Tạo `backend/tests/Feature/VipBookingCreateTest.php`:

```php
<?php
// backend/tests/Feature/VipBookingCreateTest.php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class VipBookingCreateTest extends TestCase
{
    use RefreshDatabase;

    private function payload(array $extra = []): array
    {
        return array_merge([
            'pickup' => 'Hà Nội',
            'destination' => 'Sân bay Nội Bài',
            'date' => now()->addDay()->format('Y-m-d'),
            'time' => '08:00',
            'distance_km' => 30,
            'price' => 500_000,
            'vehicle_type' => 'sedan_4',
        ], $extra);
    }

    public function test_creates_vip_booking_when_flag_sent(): void
    {
        Notification::fake();
        $customer = User::factory()->create(['role' => 'customer']);

        $response = $this->actingAs($customer, 'sanctum')
            ->postJson('/api/bookings', $this->payload(['is_vip' => true]))
            ->assertCreated();

        $this->assertTrue($response->json('is_vip'));
        $this->assertDatabaseHas('bookings', ['id' => $response->json('id'), 'is_vip' => true]);
    }

    public function test_defaults_to_non_vip_when_flag_absent(): void
    {
        Notification::fake();
        $customer = User::factory()->create(['role' => 'customer']);

        $response = $this->actingAs($customer, 'sanctum')
            ->postJson('/api/bookings', $this->payload())
            ->assertCreated();

        $this->assertFalse($response->json('is_vip'));
        $this->assertDatabaseHas('bookings', ['id' => $response->json('id'), 'is_vip' => false]);
    }

    public function test_rejects_non_boolean_is_vip(): void
    {
        Notification::fake();
        $customer = User::factory()->create(['role' => 'customer']);

        $this->actingAs($customer, 'sanctum')
            ->postJson('/api/bookings', $this->payload(['is_vip' => 'có']))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['is_vip']);
    }
}
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

```bash
docker compose exec app php artisan test --filter=VipBookingCreateTest
```

Expected: FAIL — response không có khoá `is_vip`.

- [ ] **Step 3: Thêm validate**

Trong `store()` của `backend/app/Http/Controllers/Customer/BookingController.php`, thêm ngay sau dòng validate `vehicle_type`:

```php
            'is_vip' => 'sometimes|boolean',
```

- [ ] **Step 4: Lưu vào booking**

Trong mảng truyền cho `Booking::create()` (chỗ đang có `'vehicle_type' => $data['vehicle_type'],`), thêm ngay dưới:

```php
            'is_vip' => $request->boolean('is_vip'),
```

`$request->boolean()` quy `"1"`, `"true"`, `true` về `true` và trả `false` khi vắng mặt — không dùng `$data['is_vip'] ?? false` vì `sometimes` khiến khoá vắng hẳn khỏi `$data`.

- [ ] **Step 5: Trả về trong formatBooking()**

Trong `formatBooking()`, thêm ngay sau dòng `'vehicle_type' => $b->vehicle_type,`:

```php
            'is_vip' => (bool) $b->is_vip,
```

- [ ] **Step 6: Chạy test**

```bash
docker compose exec app php artisan test --filter=VipBookingCreateTest
docker compose exec app php artisan test --filter=BookingHistoryPaginationTest
```

Expected: PASS cả hai.

- [ ] **Step 7: Commit**

```bash
git add backend/app/Http/Controllers/Customer/BookingController.php \
        backend/tests/Feature/VipBookingCreateTest.php
git commit -m "feat(vip): API đặt xe nhận và trả về cờ is_vip"
```

---

### Task 8: Bảng giá VIP

**Files:**
- Modify: `backend/app/Http/Controllers/Admin/PriceConfigController.php` (`store()`, `update()`)
- Modify: `backend/database/seeders/PriceConfigSeeder.php`
- Test: `backend/tests/Feature/PriceConfigUniqueTest.php` (bổ sung)

**Interfaces:**
- Produces: `POST/PATCH /api/admin/price-configs` nhận `is_vip` boolean; khoá chống trùng là `(service_type, trip_type, vehicle_type, price_type, is_vip)` giới hạn trong các dòng `is_active = true`

- [ ] **Step 1: Viết test thất bại**

Thêm vào `backend/tests/Feature/PriceConfigUniqueTest.php`:

```php
    /**
     * Dòng giá VIP KHÔNG được coi là trùng dòng thường cùng tổ hợp. Thiếu
     * is_vip trong Rule::unique thì admin không tạo nổi bảng giá VIP và nhận
     * thông báo "Đã có bảng giá..." — sai hoàn toàn so với nguyên nhân.
     */
    public function test_store_allows_vip_row_alongside_normal_row(): void
    {
        PriceConfig::create($this->validPayload() + ['is_active' => true]);

        $this->actingAs($this->makeAdmin(), 'sanctum')
            ->postJson('/api/admin/price-configs', $this->validPayload() + ['is_vip' => true])
            ->assertCreated();

        $this->assertDatabaseCount('price_configs', 2);
    }

    public function test_store_rejects_duplicate_vip_row(): void
    {
        PriceConfig::create($this->validPayload() + ['is_active' => true, 'is_vip' => true]);

        $this->actingAs($this->makeAdmin(), 'sanctum')
            ->postJson('/api/admin/price-configs', $this->validPayload() + ['is_vip' => true])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['service_type']);

        $this->assertDatabaseCount('price_configs', 1);
    }
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

```bash
docker compose exec app php artisan test --filter=PriceConfigUniqueTest
```

Expected: FAIL — `test_store_allows_vip_row_alongside_normal_row` nhận 422 thay vì 201.

- [ ] **Step 3: Thêm is_vip vào Rule::unique và validate của store()**

Trong `store()` của `backend/app/Http/Controllers/Admin/PriceConfigController.php`, thêm một `->where()` vào chuỗi `Rule::unique`, và thêm dòng validate:

```php
            'service_type' => [
                'required', 'in:airport,provincial',
                Rule::unique('price_configs')
                    ->where('is_active', true)
                    ->where('trip_type', $request->trip_type)
                    ->where('vehicle_type', $request->vehicle_type)
                    ->where('price_type', $request->price_type)
                    ->where('is_vip', $request->boolean('is_vip')),
            ],
            'trip_type'    => 'required|in:one_way,round_trip',
            'vehicle_type' => 'required|in:sedan_4,suv_5,mpv_7',
            'is_vip'       => 'sometimes|boolean',
```

- [ ] **Step 4: Đảm bảo is_vip được lưu khi vắng mặt**

`Rule::unique` dùng `$request->boolean('is_vip')` nhưng `$data` sẽ không có khoá `is_vip` khi client không gửi (vì `sometimes`). Cột có `DEFAULT false` nên bản ghi vẫn đúng, nhưng để rõ ràng, đổi dòng tạo cuối `store()` thành:

```php
        $config = PriceConfig::create($data + ['is_vip' => $request->boolean('is_vip')]);
```

- [ ] **Step 5: Thêm is_vip vào update()**

Trong `update()`, thêm vào mảng validate:

```php
            'is_vip'       => 'sometimes|boolean',
```

- [ ] **Step 6: Thêm 6 dòng giá VIP vào seeder**

Trong `backend/database/seeders/PriceConfigSeeder.php`, thêm vào mảng dữ liệu (giữ nguyên 6 dòng cũ):

```php
            // Giá VIP (xe cá nhân, biển trắng). Số dùng cho môi trường dev —
            // admin sửa được ở trang Bảng giá, production nhập tay sau khi deploy.
            ['service_type' => 'airport',    'vehicle_type' => 'sedan_4', 'is_vip' => true, 'price_type' => 'range',  'min_price' => 350000, 'max_price' => 500000, 'sort_order' => 7],
            ['service_type' => 'airport',    'vehicle_type' => 'suv_5',   'is_vip' => true, 'price_type' => 'range',  'min_price' => 350000, 'max_price' => 500000, 'sort_order' => 8],
            ['service_type' => 'airport',    'vehicle_type' => 'mpv_7',   'is_vip' => true, 'price_type' => 'range',  'min_price' => 450000, 'max_price' => 600000, 'sort_order' => 9],
            ['service_type' => 'provincial', 'vehicle_type' => 'sedan_4', 'is_vip' => true, 'price_type' => 'per_km', 'min_price' => 16000,  'max_price' => 16000,  'sort_order' => 10],
            ['service_type' => 'provincial', 'vehicle_type' => 'suv_5',   'is_vip' => true, 'price_type' => 'per_km', 'min_price' => 16000,  'max_price' => 16000,  'sort_order' => 11],
            ['service_type' => 'provincial', 'vehicle_type' => 'mpv_7',   'is_vip' => true, 'price_type' => 'per_km', 'min_price' => 18000,  'max_price' => 18000,  'sort_order' => 12],
```

- [ ] **Step 7: Chạy test và seeder**

```bash
docker compose exec app php artisan test --filter=PriceConfigUniqueTest
docker compose exec app php artisan migrate:fresh --seed
docker compose exec app php artisan tinker --execute="echo App\Models\PriceConfig::where('is_vip', true)->count();"
```

Expected: test PASS; lệnh cuối in ra `6`.

- [ ] **Step 8: Commit**

```bash
git add backend/app/Http/Controllers/Admin/PriceConfigController.php \
        backend/database/seeders/PriceConfigSeeder.php \
        backend/tests/Feature/PriceConfigUniqueTest.php
git commit -m "feat(vip): bảng giá riêng cho cuốc VIP

is_vip phải nằm trong Rule::unique, nếu không dòng giá VIP bị coi là trùng
dòng thường và admin không tạo được."
```

---

### Task 9: Tài xế khai xe cá nhân, admin sửa được

**Files:**
- Modify: `backend/app/Http/Controllers/Auth/AuthController.php` (`registerDriver()`)
- Modify: `backend/app/Http/Controllers/Admin/DriverController.php` (`update()`, `formatDriver()`)
- Test: `backend/tests/Feature/DriverRegisterTest.php` (bổ sung), `backend/tests/Feature/AdminDriverDocumentsTest.php` (bổ sung)

**Interfaces:**
- Produces: `POST /api/auth/register/driver` nhận `is_vip` boolean tuỳ chọn; `PUT /api/admin/drivers/{user}` nhận `is_vip`; response tài xế của admin có trường `is_vip`

- [ ] **Step 1: Viết test thất bại cho đăng ký**

Thêm vào `backend/tests/Feature/DriverRegisterTest.php` (dùng lại payload helper có sẵn trong file; nếu không có, đọc test đầu tiên trong file để lấy đúng bộ trường bắt buộc):

```php
    public function test_driver_can_declare_private_plate_vehicle(): void
    {
        $payload = $this->validDriverPayload();
        $payload['is_vip'] = true;

        $this->postJson('/api/auth/register/driver', $payload)->assertCreated();

        $this->assertDatabaseHas('driver_profiles', [
            'vehicle_plate' => $payload['vehicle_plate'],
            'is_vip' => true,
        ]);
    }

    public function test_driver_defaults_to_non_vip(): void
    {
        $payload = $this->validDriverPayload();

        $this->postJson('/api/auth/register/driver', $payload)->assertCreated();

        $this->assertDatabaseHas('driver_profiles', [
            'vehicle_plate' => $payload['vehicle_plate'],
            'is_vip' => false,
        ]);
    }
```

> Nếu file chưa có `validDriverPayload()`, tạo helper private đó bằng cách gom đúng mảng payload mà test đầu tiên trong file đang dùng, rồi sửa test đó gọi helper — không chép payload ra hai chỗ.

- [ ] **Step 2: Chạy test để xác nhận thất bại**

```bash
docker compose exec app php artisan test --filter=DriverRegisterTest
```

Expected: FAIL — `is_vip` trong DB là `false` ở test đầu.

- [ ] **Step 3: Sửa registerDriver()**

Trong `backend/app/Http/Controllers/Auth/AuthController.php`, thêm vào mảng validate (cạnh dòng `'vehicle_type'`):

```php
            'is_vip' => 'sometimes|boolean',
```

và thêm vào mảng tạo `driverProfile` (cạnh `'vehicle_type' => $request->vehicle_type,`):

```php
            'is_vip' => $request->boolean('is_vip'),
```

- [ ] **Step 4: Chạy test đăng ký**

```bash
docker compose exec app php artisan test --filter=DriverRegisterTest
```

Expected: PASS.

- [ ] **Step 5: Viết test thất bại cho admin**

Thêm vào `backend/tests/Feature/AdminDriverDocumentsTest.php`:

```php
    public function test_admin_can_toggle_driver_vip_flag(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $driver = User::factory()->create(['role' => 'driver']);
        $driver->driverProfile()->create([
            'vehicle_make' => 'Toyota',
            'vehicle_model' => 'Camry',
            'vehicle_plate' => '51G-12345',
            'vehicle_year' => 2020,
            'vehicle_color' => 'Trắng',
            'vehicle_type' => 'sedan_4',
            'status' => 'active',
        ]);

        $this->actingAs($admin, 'sanctum')
            ->putJson("/api/admin/drivers/{$driver->id}", ['is_vip' => true])
            ->assertOk()
            ->assertJsonPath('is_vip', true);

        $this->assertTrue($driver->driverProfile->fresh()->is_vip);
    }
```

- [ ] **Step 6: Chạy test để xác nhận thất bại**

```bash
docker compose exec app php artisan test --filter=AdminDriverDocumentsTest
```

Expected: FAIL — response không có khoá `is_vip`.

- [ ] **Step 7: Sửa Admin/DriverController**

Thêm vào mảng validate của `update()`:

```php
            'is_vip'        => 'sometimes|boolean',
```

Thêm vào mảng trả về của `formatDriver()` (cạnh trường `vehicle_type` nếu có, nếu không thì cạnh `vehicle_plate`):

```php
            'is_vip' => (bool) $profile?->is_vip,
```

> Đọc `formatDriver()` trước để lấy đúng tên biến profile đang dùng trong hàm đó (`$profile`, `$p`, hay `$user->driverProfile`) — dùng đúng tên đó, đừng thêm biến mới.

- [ ] **Step 8: Chạy test**

```bash
docker compose exec app php artisan test --filter=AdminDriverDocumentsTest
```

Expected: PASS.

- [ ] **Step 9: Chạy toàn bộ test backend + lint**

```bash
docker compose exec app php artisan test
docker compose exec app ./vendor/bin/pint
```

Expected: toàn bộ PASS, Pint không đổi file nào ngoài các file vừa sửa.

- [ ] **Step 10: Commit**

```bash
git add backend/app/Http/Controllers/Auth/AuthController.php \
        backend/app/Http/Controllers/Admin/DriverController.php \
        backend/tests/Feature/DriverRegisterTest.php \
        backend/tests/Feature/AdminDriverDocumentsTest.php
git commit -m "feat(vip): tài xế khai xe cá nhân lúc đăng ký, admin sửa được"
```

---

### Task 10: Kiểu dữ liệu frontend + công tắc VIP ở màn đặt xe

**Files:**
- Modify: `frontend/src/types.d.ts` (`Booking`, `BookingPayload`, `PriceConfig`, `DriverProfile`)
- Modify: `frontend/src/pages/customer/BookingFormPage.tsx`

**Interfaces:**
- Consumes: `POST /api/bookings` nhận `is_vip?: boolean` (Task 7); `GET /api/price-configs` trả `is_vip: boolean` (Task 8)
- Produces: `App.Booking.is_vip`, `App.BookingPayload.is_vip`, `App.PriceConfig.is_vip`, `App.DriverProfile.is_vip` — đều `boolean`

- [ ] **Step 1: Thêm trường vào types.d.ts**

Trong `frontend/src/types.d.ts`:

- `interface Booking` — thêm sau `vehicle_type?: VehicleType`:
  ```ts
    is_vip?: boolean
  ```
- `interface BookingPayload` — thêm sau `vehicle_type: VehicleType`:
  ```ts
    is_vip?: boolean
  ```
- `interface PriceConfig` — thêm sau `vehicle_type: VehicleType`:
  ```ts
    is_vip: boolean
  ```
- `interface DriverProfile` — thêm sau `vehicle_type`:
  ```ts
    is_vip?: boolean
  ```

- [ ] **Step 2: Cho findPriceConfig biết chiều VIP**

Trong `frontend/src/pages/customer/BookingFormPage.tsx`, sửa `findPriceConfig()`:

```ts
function findPriceConfig(
  configs: App.PriceConfig[],
  vehicleType: VehicleType,
  serviceType: 'airport' | 'provincial',
  isVip: boolean,
): App.PriceConfig | undefined {
  return configs.find(
    (c) =>
      c.trip_type === 'one_way' &&
      c.vehicle_type === vehicleType &&
      c.service_type === serviceType &&
      // Ép về boolean hai phía: API trả 0/1 ở một số cấu hình PHP, mà `0 === false`
      // là sai — thiếu bước này thì mọi dòng giá VIP đều không khớp.
      Boolean(c.is_vip) === isVip &&
      c.is_active,
  )
}
```

- [ ] **Step 3: Thêm state và ref cho cờ VIP**

Ngay sau dòng `const [vehicleType, setVehicleType] = useState<VehicleType>('sedan_4')`, thêm:

```ts
  const [isVip, setIsVip] = useState(false)
```

Ngay sau `vehicleTypeRef`, thêm ref cùng kiểu (effect tính giá đọc giá trị mới nhất mà không phải đưa vào dependency — cùng lý do với `vehicleTypeRef` và `detectedServiceRef`):

```ts
  const isVipRef = useRef(isVip)
  isVipRef.current = isVip
```

- [ ] **Step 4: Truyền cờ vào bốn chỗ gọi findPriceConfig**

Có đúng **ba** lời gọi trong file (dòng 200, 213, 261 ở bản hiện tại). Cập nhật cả ba:

1. `const activeConfig = findPriceConfig(priceConfigs, vehicleType, detectedService)` → thêm `, isVip`
2. Trong effect tính khoảng cách, `findPriceConfig(priceConfigs, vehicleTypeRef.current, detectedServiceRef.current)` → thêm `, isVipRef.current`. **Phải dùng ref, không dùng `isVip` trực tiếp** — effect không có `isVip` trong dependency, đọc thẳng biến sẽ đóng băng giá trị của lần render đầu (`false`) và giá auto-fill luôn tính theo bảng giá thường.
3. Trong `handleVehicleChange`, `findPriceConfig(priceConfigs, v, detectedService)` → thêm `, isVip`

Kiểm tra bằng:

```bash
grep -n "findPriceConfig(" frontend/src/pages/customer/BookingFormPage.tsx
```

Expected: 4 dòng — 1 dòng định nghĩa hàm + 3 lời gọi, mỗi lời gọi có **4 tham số**.

- [ ] **Step 5: Thêm handler đổi cờ VIP**

Ngay dưới `handleVehicleChange`, thêm:

```ts
  // Bật/tắt VIP đổi bảng giá áp dụng, nên phải tính lại giá auto-fill y như khi
  // đổi loại xe — nếu không, dải "Mức giá tham khảo" nhảy sang giá VIP trong khi
  // ô "Giá bạn muốn trả" vẫn giữ số của bảng giá thường.
  const handleVipChange = (next: boolean) => {
    setIsVip(next)
    if (distance > 0) {
      const cfg = findPriceConfig(priceConfigs, vehicleType, detectedService, next)
      if (cfg) {
        setValue('price', configPrice(cfg, distance, 'min'), { shouldValidate: true })
      }
    }
  }
```

- [ ] **Step 6: Thêm công tắc VIP vào JSX**

Ngay sau khối `</div>` đóng lưới 3 chip loại xe (trước comment `{/* ── ĐẶT ĐI NGAY ── */}`), thêm:

```tsx
        {/* Xe cá nhân — vuông góc với số chỗ nên là công tắc riêng, không phải
            chip thứ tư: chọn chip VIP thì mất chỗ chọn 4/5/7 chỗ. */}
        <button
          type="button"
          onClick={() => handleVipChange(!isVip)}
          className={clsx(
            'w-full flex items-center gap-3 rounded-card border px-3.5 py-3 text-left transition-colors mt-2',
            isVip ? 'border-gold bg-gold-tint' : 'border-border-gray bg-white',
          )}
        >
          <span
            className={clsx(
              'w-5 h-5 rounded-[6px] border-2 flex items-center justify-center shrink-0',
              isVip ? 'bg-gold border-gold' : 'border-border-gray bg-white',
            )}
          >
            {isVip && <span className="material-symbols-outlined text-white text-[15px]">check</span>}
          </span>
          <span className="flex-1">
            <span className="block text-[14px] font-medium text-navy">Xe VIP</span>
            <span className="block text-[11px] text-neutral-gray">
              Xe cá nhân, biển trắng — không phải xe dịch vụ
            </span>
          </span>
          <span className="material-symbols-outlined text-gold text-[20px]"
                style={{ fontVariationSettings: "'FILL' 1" }}>workspace_premium</span>
        </button>
```

- [ ] **Step 7: Gửi cờ lên API**

Trong `bookingMutation`, thêm vào object truyền cho `createBooking` (cạnh `collection_fee`):

```ts
        is_vip: isVip,
```

- [ ] **Step 8: Kiểm tra kiểu và lint**

```bash
cd frontend && npx tsc -b --noEmit && npx eslint src/pages/customer/BookingFormPage.tsx src/types.d.ts
```

Expected: không có output.

- [ ] **Step 9: Kiểm tra bằng mắt trên dev**

```bash
docker compose exec app php artisan migrate:fresh --seed
```

Mở `http://localhost:5173/customer/booking`, chọn điểm đón + điểm đến để có khoảng cách, rồi:
1. Ghi lại "Mức giá tham khảo" và số trong ô "Giá bạn muốn trả".
2. Bật công tắc **Xe VIP**.
3. Xác nhận cả hai số đều tăng lên theo bảng giá VIP (airport sedan: 350.000 – 500.000).
4. Tắt công tắc, xác nhận cả hai quay lại số cũ.

Nếu dải giá về `0đ - 0đ`: seeder chưa chạy hoặc `Boolean(c.is_vip) === isVip` bị bỏ sót ở Step 2.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/types.d.ts frontend/src/pages/customer/BookingFormPage.tsx
git commit -m "feat(vip): công tắc Xe VIP ở màn đặt xe của khách"
```

---

### Task 11: Ô khai xe cá nhân ở màn đăng ký tài xế

**Files:**
- Modify: `frontend/src/api/auth.ts` (kiểu payload đăng ký tài xế)
- Modify: `frontend/src/pages/DriverRegisterPage.tsx`

**Interfaces:**
- Consumes: `POST /api/auth/register/driver` nhận `is_vip?: boolean` (Task 9)

- [ ] **Step 1: Thêm trường vào kiểu payload**

Trong `frontend/src/api/auth.ts`, thêm vào interface/type chứa `vehicle_type: 'sedan_4' | 'suv_5' | 'mpv_7'`:

```ts
  is_vip?: boolean
```

- [ ] **Step 2: Thêm state**

Trong `frontend/src/pages/DriverRegisterPage.tsx`, cạnh `const [vehicleType, setVType] = useState<VehicleType>('sedan_4')`, thêm:

```ts
  const [isVip, setIsVip] = useState(false)
```

- [ ] **Step 3: Thêm ô tích vào form**

Ngay sau khối chọn loại xe, thêm:

```tsx
      {/* Tài xế tự khai; admin xác nhận khi duyệt hồ sơ. Hệ thống chỉ lưu chuỗi
          biển số nên không tự phân biệt được biển trắng/vàng. */}
      <button
        type="button"
        onClick={() => setIsVip((v) => !v)}
        className={clsx(
          'w-full flex items-center gap-3 rounded-card border px-3.5 py-3 text-left transition-colors',
          isVip ? 'border-gold bg-gold-tint' : 'border-border-gray bg-white',
        )}
      >
        <span
          className={clsx(
            'w-5 h-5 rounded-[6px] border-2 flex items-center justify-center shrink-0',
            isVip ? 'bg-gold border-gold' : 'border-border-gray bg-white',
          )}
        >
          {isVip && <span className="material-symbols-outlined text-white text-[15px]">check</span>}
        </span>
        <span className="flex-1">
          <span className="block text-[14px] font-medium text-navy">Xe cá nhân (biển trắng)</span>
          <span className="block text-[11px] text-neutral-gray">
            Nhận thêm cuốc VIP. Admin sẽ kiểm tra khi duyệt hồ sơ.
          </span>
        </span>
      </button>
```

> Nếu file chưa import `clsx`, thêm `import clsx from 'clsx'` ở đầu file.

- [ ] **Step 4: Gửi cờ lên API**

Trong hàm submit, thêm `is_vip: isVip,` vào object gửi đi.

- [ ] **Step 5: Kiểm tra kiểu và lint**

```bash
cd frontend && npx tsc -b --noEmit && npx eslint src/pages/DriverRegisterPage.tsx src/api/auth.ts
```

Expected: không có output.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/auth.ts frontend/src/pages/DriverRegisterPage.tsx
git commit -m "feat(vip): tài xế khai xe cá nhân khi đăng ký"
```

---

### Task 12: Admin — bảng giá VIP và cờ VIP của tài xế

**Files:**
- Modify: `frontend/src/pages/admin/PriceConfigPage.tsx`
- Modify: `frontend/src/pages/admin/DriversPage.tsx`

**Interfaces:**
- Consumes: `PriceConfig.is_vip` (Task 10 types), `POST/PATCH /api/admin/price-configs` nhận `is_vip` (Task 8), `PUT /api/admin/drivers/{id}` nhận `is_vip` + response có `is_vip` (Task 9)

- [ ] **Step 1: Thêm is_vip vào schema form bảng giá**

Trong `frontend/src/pages/admin/PriceConfigPage.tsx`, thêm vào object zod schema (cạnh `vehicle_type: z.enum([...])`):

```ts
  is_vip: z.boolean().default(false),
```

và thêm `is_vip: false` vào `defaultValues`.

- [ ] **Step 2: Thêm ô chọn VIP vào form**

Ngay sau `<select>` chọn loại xe, thêm:

```tsx
            <label className="flex items-center gap-2 text-sm text-navy">
              <input type="checkbox" {...register('is_vip')} className="w-4 h-4 accent-gold" />
              Xe VIP (cá nhân, biển trắng)
            </label>
```

- [ ] **Step 3: Hiện cột VIP trong bảng**

Thêm một `<th>` "VIP" vào hàng tiêu đề và `<td>` tương ứng vào mỗi hàng dữ liệu:

```tsx
                <td className="px-3 py-2">
                  {c.is_vip
                    ? <span className="text-[11px] font-semibold text-gold">VIP</span>
                    : <span className="text-[11px] text-neutral-gray">—</span>}
                </td>
```

- [ ] **Step 4: Hiện nhãn VIP ở danh sách tài xế**

Trong `frontend/src/pages/admin/DriversPage.tsx`, cạnh chỗ hiện tên hoặc biển số tài xế, thêm:

```tsx
                {d.is_vip && (
                  <span className="ml-1.5 text-[10px] font-bold text-gold border border-gold rounded-pill px-1.5 py-0.5">
                    VIP
                  </span>
                )}
```

> Đọc file trước để lấy đúng tên biến của phần tử tài xế trong `.map()` (có thể là `d`, `driver`, hay `u`) và dùng đúng tên đó. Nếu kiểu tài xế trong `types.d.ts` chưa có `is_vip`, thêm `is_vip?: boolean` vào interface đó.

- [ ] **Step 5: Kiểm tra kiểu và lint**

```bash
cd frontend && npx tsc -b --noEmit && npx eslint src/pages/admin
```

Expected: không có output.

- [ ] **Step 6: Kiểm tra bằng mắt**

Mở `http://localhost:5175` (app admin), đăng nhập admin, vào **Bảng giá**: phải thấy 12 dòng, 6 dòng có nhãn VIP. Tạo thử một dòng VIP mới cho tổ hợp đã có dòng thường — phải tạo được, không báo trùng.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/admin/PriceConfigPage.tsx frontend/src/pages/admin/DriversPage.tsx frontend/src/types.d.ts
git commit -m "feat(vip): admin quản lý bảng giá VIP và cờ VIP của tài xế"
```

---

### Task 13: Nhãn VIP trên cuốc

**Files:**
- Modify: `frontend/src/pages/customer/BookingStatusPage.tsx`
- Modify: `frontend/src/pages/driver/TripDetailPage.tsx`
- Modify: `frontend/src/pages/driver/TripListPage.tsx` (danh sách cuốc chờ nhận)
- Modify: `backend/app/Http/Controllers/Driver/TripController.php` (`formatTrip()` trả `is_vip`)
- Modify: `frontend/src/types.d.ts` (`Trip`)
- Test: `backend/tests/Feature/DriverTripDetailTest.php` (bổ sung)

**Interfaces:**
- Produces: mọi payload cuốc của tài xế (`/api/driver/trips`, `/mine`, `/history`, `/{id}`) có `is_vip: boolean`; `App.Trip.is_vip?: boolean`

- [ ] **Step 1: Viết test thất bại**

Thêm vào `backend/tests/Feature/DriverTripDetailTest.php`:

```php
    public function test_trip_payload_exposes_vip_flag(): void
    {
        $driver = $this->makeActiveDriver();
        $driver->driverProfile->update(['is_vip' => true]);

        $booking = $this->makeBookingForDriver($driver);
        $booking->update(['is_vip' => true]);

        $this->actingAs($driver, 'sanctum')
            ->getJson("/api/driver/trips/{$booking->id}")
            ->assertOk()
            ->assertJsonPath('is_vip', true);
    }
```

> Đọc đầu file để lấy đúng tên helper tạo tài xế / tạo cuốc đang có; dùng lại chúng thay vì viết mới.

- [ ] **Step 2: Chạy test để xác nhận thất bại**

```bash
docker compose exec app php artisan test --filter=DriverTripDetailTest
```

Expected: FAIL — response không có khoá `is_vip`.

- [ ] **Step 3: Thêm is_vip vào formatTrip()**

Trong `backend/app/Http/Controllers/Driver/TripController.php`, thêm vào mảng trả về của `formatTrip()` ngay sau dòng `'distance_km' => ...` (mảng này KHÔNG có trường `vehicle_type` nên đừng tìm nó):

```php
            'is_vip' => (bool) $b->is_vip,
```

- [ ] **Step 4: Chạy test**

```bash
docker compose exec app php artisan test --filter=DriverTripDetailTest
docker compose exec app php artisan test --filter=AvailableTripsListTest
```

Expected: PASS cả hai.

> `AvailableTripsListTest` chạy lại vì `formatTrip()` là thứ được cache — đổi hình dạng payload mà cache cũ còn sống sẽ trả thiếu trường. Trong test thì `RefreshDatabase` lo việc đó; **trên production phải flush cache sau deploy**, đã ghi ở Task 14.

- [ ] **Step 5: Thêm trường vào kiểu Trip**

Trong `frontend/src/types.d.ts`, thêm vào `interface Trip`:

```ts
    is_vip?: boolean
```

- [ ] **Step 6: Thêm nhãn dùng chung**

Tạo `frontend/src/components/common/VipBadge.tsx`:

```tsx
/** Nhãn cuốc VIP — xe cá nhân, biển trắng. Dùng ở cả app khách và app tài xế. */
export default function VipBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-gold border border-gold rounded-pill px-1.5 py-0.5">
      <span className="material-symbols-outlined text-[12px]"
            style={{ fontVariationSettings: "'FILL' 1" }}>workspace_premium</span>
      VIP
    </span>
  )
}
```

- [ ] **Step 7: Dùng nhãn ở ba màn hình**

Ở mỗi file dưới đây, `import VipBadge from '@/components/common/VipBadge'` rồi chèn `{trip.is_vip && <VipBadge />}` (hoặc `{b.is_vip && <VipBadge />}` tuỳ tên biến trong file) ngay cạnh `<StatusBadge .../>`:

- `frontend/src/pages/customer/BookingStatusPage.tsx`
- `frontend/src/pages/driver/TripDetailPage.tsx` — cạnh `<StatusBadge status={trip.status} />` ở đầu trang
- `frontend/src/pages/driver/TripListPage.tsx` — trên thẻ mỗi cuốc trong danh sách chờ nhận

- [ ] **Step 8: Kiểm tra kiểu và lint**

```bash
cd frontend && npx tsc -b --noEmit && npx eslint src
```

Expected: không có output.

- [ ] **Step 9: Kiểm tra bằng mắt**

Đặt một cuốc VIP ở app khách (`localhost:5173`), rồi mở app tài xế (`localhost:5174`) bằng tài khoản tài xế đã bật `is_vip`:
1. Cuốc hiện trong danh sách, có nhãn VIP.
2. Đăng nhập bằng tài xế **không** VIP: cuốc đó **không** xuất hiện.
3. Mở lại trang trạng thái đơn ở app khách: có nhãn VIP.

- [ ] **Step 10: Commit**

```bash
git add backend/app/Http/Controllers/Driver/TripController.php \
        backend/tests/Feature/DriverTripDetailTest.php \
        frontend/src/components/common/VipBadge.tsx \
        frontend/src/types.d.ts \
        frontend/src/pages/customer/BookingStatusPage.tsx \
        frontend/src/pages/driver/TripDetailPage.tsx \
        frontend/src/pages/driver/TripListPage.tsx
git commit -m "feat(vip): nhãn VIP trên cuốc ở app khách và app tài xế"
```

---

### Task 14: Deploy production

**Files:** không sửa code. Đây là quy trình phát hành.

**Interfaces:**
- Consumes: toàn bộ Task 1–13 đã merge vào `main`

- [ ] **Step 1: Chạy toàn bộ test và build sạch**

```bash
docker compose exec app php artisan test
cd frontend && npx tsc -b --noEmit && npx eslint src
```

Expected: toàn bộ PASS.

- [ ] **Step 2: Deploy backend**

```bash
K=~/.ssh/ssh-17-37-18-6-8-2026-private.pem
ssh -i $K root@45.124.95.47 'cd /var/www/green-car-airport && git pull && \
  php artisan migrate --force && \
  php artisan config:cache && php artisan route:cache && \
  php artisan queue:restart'
```

`queue:restart` là **bắt buộc**: worker đang giữ code cũ trong bộ nhớ, không restart thì `SendNewBookingBroadcastJob` vẫn chạy bản chưa có bộ lọc VIP cho tới khi worker tự hết `--max-time`.

- [ ] **Step 3: Xoá cache danh sách cuốc**

```bash
ssh -i $K root@45.124.95.47 'cd /var/www/green-car-airport && php artisan cache:clear'
```

`formatTrip()` đổi hình dạng payload (thêm `is_vip`) mà entry cache cũ còn sống tối đa 5 giây sẽ trả về thiếu trường — nhãn VIP không hiện. Xoá cho chắc.

- [ ] **Step 4: Build và rsync frontend**

```bash
docker compose exec -T frontend npm run build:customer -- --mode production
docker compose exec -T frontend npm run build:driver   -- --mode production
docker compose exec -T frontend npm run build:admin    -- --mode production

grep -c "e2e-test-placeholder" frontend/dist/assets/*.js    # phải ra 0
grep -o "8116c288a0e864f758b94322b1898c94" frontend/dist/assets/*.js | head -1   # phải có

for d in dist dist-driver dist-admin; do
  rsync -az --delete -e "ssh -i $K" frontend/$d/ root@45.124.95.47:/var/www/green-car-airport/frontend/$d/
done
```

- [ ] **Step 5: Nhập 6 dòng giá VIP trên production**

> **Không bỏ qua bước này.** `price_configs` trên production đã có dữ liệu thật; migration chỉ đặt `is_vip = false` cho dòng cũ và **không sinh dòng VIP nào** (seeder chỉ chạy ở dev). Thiếu bước này thì khách bật công tắc VIP sẽ thấy "Mức giá tham khảo: 0đ – 0đ" và ô giá tự điền 0 — **không có lỗi nào hiện ra**.

Đăng nhập `https://admin.greenca.vn` → **Bảng giá** → tạo 6 dòng, tất cả tích ô "Xe VIP":

| service_type | vehicle_type | price_type | min_price | max_price |
|---|---|---|---|---|
| airport | sedan_4 | range | 350000 | 500000 |
| airport | suv_5 | range | 350000 | 500000 |
| airport | mpv_7 | range | 450000 | 600000 |
| provincial | sedan_4 | per_km | 16000 | 16000 |
| provincial | suv_5 | per_km | 16000 | 16000 |
| provincial | mpv_7 | per_km | 18000 | 18000 |

(Chủ app chốt lại con số trước khi nhập.)

- [ ] **Step 6: Xác minh sau deploy**

```bash
curl -s https://greenca.vn/api/price-configs | python3 -c "import sys,json; d=json.load(sys.stdin); print('VIP rows:', sum(1 for c in d if c.get('is_vip')))"
```

Expected: `VIP rows: 6`.

Mở `https://greenca.vn`, bật công tắc **Xe VIP**, xác nhận dải giá tham khảo hiện đúng số vừa nhập chứ không phải `0đ - 0đ`.

- [ ] **Step 7: Duyệt cờ VIP cho tài xế đầu tiên**

Vào `https://admin.greenca.vn` → **Tài xế** → chọn một tài xế có xe biển trắng đã xác minh → bật VIP. Không có tài xế VIP nào thì mọi cuốc VIP sẽ nằm chờ vô thời hạn.

- [ ] **Step 8: Cập nhật tài liệu**

Thêm vào `CLAUDE.md`, mục **Business rules**:

```markdown
- **VIP = xe cá nhân (biển trắng)**, là cột `is_vip` riêng trên `bookings` /
  `driver_profiles` / `price_configs` — KHÔNG phải giá trị thứ tư của
  `vehicle_type` (cột đó là thang sức chứa 4 < 5 < 7). Cuốc VIP chỉ tới tài xế
  `is_vip`; tài xế VIP vẫn nhận được cuốc thường. Quy tắc ghép cuốc nằm trọn
  trong `App\Support\VehicleCapacity::fits()`.
```

```bash
git add CLAUDE.md
git commit -m "docs: ghi quy tắc VIP vào CLAUDE.md"
git push origin main
```

---

## Thứ tự phụ thuộc

```
Task 1 (dọn bản sao)
  └─ Task 2 (cột is_vip)
       ├─ Task 3 (VehicleCapacity)      ─┐
       ├─ Task 4 (cache)                 ├─ Task 5 (TripController)
       ├─ Task 6 (push noti)             │
       ├─ Task 7 (BookingController)     │
       ├─ Task 8 (bảng giá)              │
       └─ Task 9 (đăng ký + admin)       │
                                          ↓
       Task 10 (FE đặt xe) ← cần Task 7 + Task 8
       Task 11 (FE đăng ký tài xế) ← cần Task 9
       Task 12 (FE admin) ← cần Task 8 + Task 9
       Task 13 (nhãn VIP) ← cần Task 2
                                          ↓
                                    Task 14 (deploy)
```

Task 3, 4, 6, 7, 8, 9 độc lập với nhau — làm song song được sau khi Task 2 xong.
Task 5 phải sau cả Task 3 và Task 4.
