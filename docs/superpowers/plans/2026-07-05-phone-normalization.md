# Phone Number Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuẩn hóa số điện thoại về dạng nội địa có số 0 đầu (`0xxxxxxxxx`) ngay tại backend trước khi query/tạo/so sánh, để một số điện thoại nhập ở các dạng khác nhau (`0868968312`, `868968312`, `84868968312`, `+84 86 896 8312`) luôn được nhận diện là cùng một tài khoản.

**Architecture:** Một helper thuần PHP `App\Support\PhoneNumber::normalize()` không phụ thuộc framework, được gọi ngay sau `$request->validate()` ở đầu mỗi controller method có dùng số điện thoại để query/tạo/so sánh trong `OtpController` và `AuthController`.

**Tech Stack:** Laravel 13 / PHP 8.4, PHPUnit (feature tests dùng `RefreshDatabase`).

## Global Constraints

- Định dạng chuẩn lưu DB: nội địa, có số 0 đầu, 10 chữ số (vd `0868968312`).
- Không thêm validation chặt định dạng số di động VN (giữ nguyên `required|string|max:20`).
- Không migrate dữ liệu cũ trong DB.
- Không sửa frontend.
- Không sửa tìm kiếm admin (`where('phone', 'like', $s)` trong `Admin\CustomerController`/`Admin\DriverController`) — đây là ô tìm kiếm tự do, giữ nguyên.
- Tất cả UI text tiếng Việt giữ nguyên tiếng Việt (không áp dụng ở đây vì không đổi UI, chỉ để nhắc).

---

## File Structure

- Create: `backend/app/Support/PhoneNumber.php` — helper `normalize()` thuần PHP.
- Create: `backend/tests/Unit/Support/PhoneNumberTest.php` — unit test cho helper.
- Modify: `backend/app/Http/Controllers/Auth/OtpController.php` — gọi `PhoneNumber::normalize()` trong `send()` và `verify()`.
- Modify: `backend/app/Http/Controllers/Auth/AuthController.php` — gọi `PhoneNumber::normalize()` trong `checkPhone()`, `login()`, `register()`, `registerDriver()`, `resetPassword()`.
- Modify: `backend/tests/Feature/OtpSendTest.php` — thêm test số không có số 0 đầu.
- Create: `backend/tests/Feature/PhoneNormalizationTest.php` — feature test tích hợp xuyên suốt luồng register → checkPhone/login với 2 dạng số khác nhau.

---

## Task 1: Tạo helper `PhoneNumber::normalize()`

**Files:**
- Create: `backend/app/Support/PhoneNumber.php`
- Test: `backend/tests/Unit/Support/PhoneNumberTest.php`

**Interfaces:**
- Produces: `App\Support\PhoneNumber::normalize(?string $phone): string` — dùng bởi Task 2 và Task 3.

- [ ] **Step 1: Viết failing test**

Tạo thư mục `backend/tests/Unit/Support/` và file `backend/tests/Unit/Support/PhoneNumberTest.php`:

```php
<?php

namespace Tests\Unit\Support;

use App\Support\PhoneNumber;
use Tests\TestCase;

class PhoneNumberTest extends TestCase
{
    public function test_already_normalized_number_is_unchanged(): void
    {
        $this->assertSame('0868968312', PhoneNumber::normalize('0868968312'));
    }

    public function test_missing_leading_zero_gets_prefixed(): void
    {
        $this->assertSame('0868968312', PhoneNumber::normalize('868968312'));
    }

    public function test_84_country_code_without_plus_is_converted(): void
    {
        $this->assertSame('0868968312', PhoneNumber::normalize('84868968312'));
    }

    public function test_plus_84_country_code_with_spaces_is_converted(): void
    {
        $this->assertSame('0868968312', PhoneNumber::normalize('+84 86 896 8312'));
    }

    public function test_number_starting_with_08_is_not_mistaken_for_country_code(): void
    {
        $this->assertSame('0846123456', PhoneNumber::normalize('0846123456'));
    }

    public function test_nine_digit_number_starting_with_84_gets_leading_zero_prefixed(): void
    {
        // 9 digits total, not the 11-digit country-code pattern -> just prefix with 0.
        $this->assertSame('0846123456', PhoneNumber::normalize('846123456'));
    }

    public function test_null_input_returns_empty_string(): void
    {
        $this->assertSame('', PhoneNumber::normalize(null));
    }
}
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `docker compose exec app php artisan test --filter=PhoneNumberTest`
Expected: FAIL — `Class "App\Support\PhoneNumber" not found`

- [ ] **Step 3: Viết implementation tối thiểu**

Tạo `backend/app/Support/PhoneNumber.php`:

```php
<?php

namespace App\Support;

class PhoneNumber
{
    public static function normalize(?string $phone): string
    {
        $digits = preg_replace('/\D/', '', (string) $phone);

        if (strlen($digits) === 11 && str_starts_with($digits, '84')) {
            $digits = '0' . substr($digits, 2);
        } elseif (! str_starts_with($digits, '0')) {
            $digits = '0' . $digits;
        }

        return $digits;
    }
}
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `docker compose exec app php artisan test --filter=PhoneNumberTest`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/Support/PhoneNumber.php backend/tests/Unit/Support/PhoneNumberTest.php
git commit -m "feat: add PhoneNumber::normalize() helper for phone format consistency"
```

---

## Task 2: Áp dụng normalize trong `OtpController`

**Files:**
- Modify: `backend/app/Http/Controllers/Auth/OtpController.php`
- Modify: `backend/tests/Feature/OtpSendTest.php`

**Interfaces:**
- Consumes: `App\Support\PhoneNumber::normalize(?string $phone): string` (từ Task 1).

- [ ] **Step 1: Viết failing test**

Thêm vào cuối class `OtpSendTest` (trước dấu `}` cuối file `backend/tests/Feature/OtpSendTest.php`):

```php
    public function test_send_normalizes_phone_without_leading_zero(): void
    {
        $fake = $this->fakeSender(success: true);

        $this->postJson('/api/auth/otp/send', ['phone' => '901234567'])
            ->assertOk();

        $this->assertSame(1, $fake->calls);
        $this->assertDatabaseHas('otps', ['phone' => '0901234567']);
        $this->assertDatabaseMissing('otps', ['phone' => '901234567']);
    }

    public function test_send_register_purpose_rejects_existing_phone_in_different_format(): void
    {
        User::create(['phone' => '0901234567', 'role' => 'customer']);

        $fake = $this->fakeSender();

        $this->postJson('/api/auth/otp/send', [
            'phone'   => '901234567',
            'purpose' => 'register',
        ])
            ->assertStatus(422)
            ->assertJson(['message' => 'Số điện thoại đã được đăng ký.']);

        $this->assertSame(0, $fake->calls);
    }
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `docker compose exec app php artisan test --filter=OtpSendTest`
Expected: FAIL — `test_send_normalizes_phone_without_leading_zero` fails vì `otps` table có `phone = '901234567'` chứ không phải `'0901234567'`.

- [ ] **Step 3: Sửa `OtpController`**

Mở `backend/app/Http/Controllers/Auth/OtpController.php`. Thêm import và normalize ngay sau mỗi `$request->validate()`, thay mọi `$request->phone` bằng biến `$phone` đã normalize trong phần thân method (giữ nguyên toàn bộ logic khác):

```php
use App\Support\PhoneNumber;
```

Trong `send()`, ngay sau khối `$request->validate([...]);`:

```php
        $phone = PhoneNumber::normalize($request->phone);

        $exists = User::where('phone', $phone)->exists();

        if ($request->purpose === 'register' && $exists) {
            return response()->json(['message' => 'Số điện thoại đã được đăng ký.'], 422);
        }

        if ($request->purpose === 'driver_register'
            && User::where('phone', $phone)->where('role', 'driver')->exists()
        ) {
            return response()->json(['message' => 'Số điện thoại đã được đăng ký là tài xế.'], 422);
        }

        if ($request->purpose === 'reset' && ! $exists) {
            return response()->json(['message' => 'Số điện thoại chưa đăng ký.'], 422);
        }

        $code = str_pad(random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        Otp::where('phone', $phone)->delete();

        $otp = Otp::create([
            'phone'      => $phone,
            'code'       => $code,
            'expires_at' => now()->addMinutes(5),
        ]);

        if (app()->environment('local') && ! config('services.zns.force_send')) {
            Log::info('[OTP] Local bypass — không gọi ZNS', [
                'phone' => $phone,
                'code'  => $code,
            ]);
            return response()->json(['message' => 'OTP đã được gửi.']);
        }

        Log::info('[OTP] Gửi qua ZNS', [
            'phone'    => $phone,
            'provider' => config('services.zns.provider'),
        ]);

        $result = $this->zns->send($phone, $code);

        Log::info('[OTP] Kết quả ZNS', [
            'phone'         => $phone,
            'success'       => $result->success,
            'client_req_id' => $result->clientReqId,
            'tracking_id'   => $result->trackingId,
            'error'         => $result->error,
        ]);

        if (! $result->success) {
            return response()->json(['message' => 'Không thể gửi OTP. Vui lòng thử lại.'], 503);
        }

        $otp->update([
            'client_req_id'   => $result->clientReqId,
            'tracking_id'     => $result->trackingId,
            'delivery_status' => 'pending',
        ]);

        return response()->json(['message' => 'OTP đã được gửi.']);
```

Trong `verify()`, ngay sau khối `$request->validate([...]);`:

```php
        $phone = PhoneNumber::normalize($request->phone);

        $bypass = app()->environment('local') || $request->otp === '000000';

        if (! $bypass) {
            $otp = Otp::where('phone', $phone)
                ->where('code', $request->otp)
                ->whereNull('used_at')
                ->where('expires_at', '>', now())
                ->first();

            if (! $otp) {
                return response()->json(['message' => 'Mã OTP không hợp lệ hoặc đã hết hạn.'], 422);
            }

            $otp->update(['used_at' => now()]);
        }

        $user = User::firstOrCreate(
            ['phone' => $phone],
            ['name' => null, 'role' => 'customer'],
        );

        $token = $user->createToken('api')->plainTextToken;

        return response()->json([
            'user'  => [
                'id'    => $user->id,
                'name'  => $user->name,
                'phone' => $user->phone,
                'role'  => $user->role,
            ],
            'token' => $token,
        ]);
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `docker compose exec app php artisan test --filter=OtpSendTest`
Expected: PASS (toàn bộ 10 test trong file, bao gồm 2 test mới)

- [ ] **Step 5: Commit**

```bash
git add backend/app/Http/Controllers/Auth/OtpController.php backend/tests/Feature/OtpSendTest.php
git commit -m "fix: normalize phone number in OtpController before query/store"
```

---

## Task 3: Áp dụng normalize trong `AuthController`

**Files:**
- Modify: `backend/app/Http/Controllers/Auth/AuthController.php`
- Create: `backend/tests/Feature/PhoneNormalizationTest.php`

**Interfaces:**
- Consumes: `App\Support\PhoneNumber::normalize(?string $phone): string` (từ Task 1).

- [ ] **Step 1: Viết failing test**

Tạo `backend/tests/Feature/PhoneNormalizationTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PhoneNormalizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_check_phone_recognizes_account_registered_with_leading_zero(): void
    {
        User::create(['phone' => '0901234599', 'role' => 'customer']);

        $this->postJson('/api/auth/check-phone', ['phone' => '901234599'])
            ->assertOk()
            ->assertJson(['exists' => true, 'roles' => ['customer']]);
    }

    public function test_login_with_missing_leading_zero_finds_account_stored_with_it(): void
    {
        User::create([
            'phone'    => '0901234599',
            'role'     => 'customer',
            'password' => bcrypt('000000'),
        ]);

        $this->postJson('/api/auth/login', [
            'phone'    => '901234599',
            'password' => '000000',
        ])
            ->assertOk()
            ->assertJsonPath('user.phone', '0901234599');
    }

    public function test_register_stores_phone_in_normalized_format(): void
    {
        $this->postJson('/api/auth/register', [
            'phone'    => '901234599',
            'otp'      => '000000',
            'password' => '111111',
            'name'     => 'Test User',
        ])->assertOk();

        $this->assertDatabaseHas('users', ['phone' => '0901234599', 'role' => 'customer']);
        $this->assertDatabaseMissing('users', ['phone' => '901234599']);
    }

    public function test_register_rejects_duplicate_phone_in_different_format(): void
    {
        User::create(['phone' => '0901234599', 'role' => 'customer']);

        $this->postJson('/api/auth/register', [
            'phone'    => '901234599',
            'otp'      => '000000',
            'password' => '111111',
            'name'     => 'Test User',
        ])
            ->assertStatus(422)
            ->assertJson(['message' => 'Số điện thoại đã được đăng ký.']);
    }

    public function test_register_driver_stores_phone_in_normalized_format(): void
    {
        $this->postJson('/api/auth/register/driver', [
            'phone'                     => '84901234599',
            'password'                  => '111111',
            'name'                      => 'Driver Test',
            'vehicle_make'              => 'Toyota',
            'vehicle_model'             => 'Vios',
            'vehicle_plate'             => '51G-99999',
            'vehicle_year'              => 2022,
            'vehicle_color'             => 'Trắng',
            'vehicle_type'              => 'sedan_4',
            'cccd_number'               => '079123456789',
            'gplx_number'               => 'GPLX999999',
            'vehicle_reg_number'        => 'REG999999',
            'vehicle_inspection_number' => 'INSP999999',
            'vehicle_inspection_expiry' => now()->addYear()->toDateString(),
            'insurance_number'          => 'INS999999',
            'insurance_expiry'          => now()->addYear()->toDateString(),
        ])->assertCreated();

        $this->assertDatabaseHas('users', ['phone' => '0901234599', 'role' => 'driver']);
    }

    public function test_reset_password_finds_account_regardless_of_input_format(): void
    {
        User::create(['phone' => '0901234599', 'role' => 'customer']);

        $this->postJson('/api/auth/reset-password', [
            'phone'    => '+84 90 123 4599',
            'otp'      => '000000',
            'password' => '222222',
        ])->assertOk();
    }
}
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `docker compose exec app php artisan test --filter=PhoneNormalizationTest`
Expected: FAIL — các test dùng số không có số 0 đầu / có `84`/`+84` không tìm thấy tài khoản đã tạo bằng số có số 0 đầu (vd `test_check_phone_recognizes_account_registered_with_leading_zero` trả về 422 thay vì `exists: true`).

- [ ] **Step 3: Sửa `AuthController`**

Mở `backend/app/Http/Controllers/Auth/AuthController.php`. Thêm import:

```php
use App\Support\PhoneNumber;
```

Sửa `checkPhone()`:

```php
    public function checkPhone(Request $request): JsonResponse
    {
        $request->validate(['phone' => 'required|string|max:20']);

        $phone = PhoneNumber::normalize($request->phone);

        $roles = User::where('phone', $phone)->pluck('role');

        if ($roles->isEmpty()) {
            return response()->json(['message' => 'Số điện thoại chưa đăng ký.'], 422);
        }

        return response()->json(['exists' => true, 'roles' => $roles->values()]);
    }
```

Sửa `login()` — thêm `$phone = PhoneNumber::normalize($request->phone);` ngay sau `$request->validate([...]);`, và thay `$request->phone` bằng `$phone` trong `User::where('phone', $phone)`:

```php
    public function login(Request $request): JsonResponse
    {
        $request->validate([
            'phone'    => 'required|string|max:20',
            'password' => 'required|string',
            'role'     => 'nullable|string|in:customer,driver,admin',
        ]);

        $phone = PhoneNumber::normalize($request->phone);

        $query = User::where('phone', $phone);
        if ($request->role) {
            $query->where('role', $request->role);
        }
        $user = $query->first();

        if (! $user) {
            return response()->json(['message' => 'Số điện thoại chưa đăng ký.'], 422);
        }

        if ($user->role === 'customer' && $user->is_blocked) {
            return response()->json(['message' => 'Tài khoản đã bị khoá bởi admin.', 'code' => 'blocked'], 403);
        }

        if ($user->role === 'driver') {
            $user->loadMissing('driverProfile');
            if ($user->driverProfile?->status === 'blocked') {
                $reason = $user->driverProfile->blocked_reason;
                $msg    = $reason
                    ? "Tài khoản bị khoá: {$reason}"
                    : 'Tài khoản đã bị khoá bởi admin.';
                return response()->json(['message' => $msg, 'code' => 'blocked'], 403);
            }
        }

        $bypass = app()->environment('local') || $request->password === '000000';

        if (! $bypass) {
            if (! $user->password) {
                return response()->json([
                    'message' => 'Tài khoản chưa có mật khẩu. Vui lòng đặt lại mật khẩu.',
                    'code'    => 'no_password',
                ], 422);
            }

            if (! Hash::check($request->password, $user->password)) {
                return response()->json(['message' => 'Mật khẩu không đúng.'], 422);
            }
        }

        if ($user->role === 'driver') {
            $user->loadMissing('driverProfile');
        }

        $token = $user->createToken('api')->plainTextToken;

        return response()->json([
            'user'  => $this->userPayload($user),
            'token' => $token,
        ]);
    }
```

Sửa `register()`:

```php
    public function register(Request $request): JsonResponse
    {
        $request->validate([
            'phone'         => 'required|string|max:20',
            'otp'           => 'required|string|size:6',
            'password'      => ['required', 'string', 'size:6', 'regex:/^\d{6}$/'],
            'name'          => 'nullable|string|max:100',
            'referral_code' => 'nullable|string|max:10',
        ]);

        $phone = PhoneNumber::normalize($request->phone);

        if (User::where('phone', $phone)->where('role', 'customer')->exists()) {
            return response()->json(['message' => 'Số điện thoại đã được đăng ký.'], 422);
        }

        $this->consumeOtp($phone, $request->otp);

        $referredById = null;
        if ($request->referral_code) {
            $referrer = User::where('referral_code', $request->referral_code)->first();
            if ($referrer) {
                $referredById = $referrer->id;
            }
        }

        $user = User::create([
            'phone'               => $phone,
            'name'                => $request->input('name'),
            'password'            => Hash::make($request->password),
            'role'                => 'customer',
            'referred_by_user_id' => $referredById,
        ]);

        $token = $user->createToken('api')->plainTextToken;

        return response()->json([
            'user'  => $this->userPayload($user),
            'token' => $token,
        ]);
    }
```

Sửa `registerDriver()` — thêm `$phone = PhoneNumber::normalize($request->phone);` ngay sau khối `$request->validate([...]);`, dùng `$phone` thay cho `$request->phone` ở check tồn tại và `User::create()`:

```php
    public function registerDriver(Request $request): JsonResponse
    {
        $request->validate([
            'phone'                     => 'required|string|max:20',
            'password'                  => ['required', 'string', 'size:6', 'regex:/^\d{6}$/'],
            'name'                      => 'required|string|max:100',
            'vehicle_make'              => 'required|string|max:50',
            'vehicle_model'             => 'required|string|max:50',
            'vehicle_plate'             => 'required|string|max:20',
            'vehicle_year'              => 'required|integer|min:2000|max:' . now()->year,
            'vehicle_color'             => 'required|string|max:30',
            'vehicle_type'              => 'required|in:sedan_4,suv_5,mpv_7',
            'cccd_number'               => 'required|string|max:20',
            'gplx_number'               => 'required|string|max:20',
            'vehicle_reg_number'        => 'required|string|max:30',
            'vehicle_inspection_number' => 'required|string|max:30',
            'vehicle_inspection_expiry' => 'required|date|after:today',
            'insurance_number'          => 'required|string|max:30',
            'insurance_expiry'          => 'required|date|after:today',
        ]);

        $phone = PhoneNumber::normalize($request->phone);

        if (User::where('phone', $phone)->where('role', 'driver')->exists()) {
            return response()->json(['message' => 'Số điện thoại đã được đăng ký là tài xế.'], 422);
        }

        $user = User::create([
            'phone'    => $phone,
            'name'     => $request->name,
            'password' => Hash::make($request->password),
            'role'     => 'driver',
        ]);

        $user->driverProfile()->create([
            'vehicle_make'              => $request->vehicle_make,
            'vehicle_model'             => $request->vehicle_model,
            'vehicle_plate'             => $request->vehicle_plate,
            'vehicle_year'              => $request->vehicle_year,
            'vehicle_color'             => $request->vehicle_color,
            'vehicle_type'              => $request->vehicle_type,
            'is_online'                 => false,
            'cccd_number'               => $request->cccd_number,
            'gplx_number'               => $request->gplx_number,
            'vehicle_reg_number'        => $request->vehicle_reg_number,
            'vehicle_inspection_number' => $request->vehicle_inspection_number,
            'vehicle_inspection_expiry' => $request->vehicle_inspection_expiry,
            'insurance_number'          => $request->insurance_number,
            'insurance_expiry'          => $request->insurance_expiry,
        ]);

        $user->wallet()->create(['points' => 0]);

        $user->loadMissing('driverProfile');

        $token = $user->createToken('api')->plainTextToken;

        return response()->json([
            'user'  => $this->userPayload($user),
            'token' => $token,
        ], 201);
    }
```

Sửa `resetPassword()`:

```php
    public function resetPassword(Request $request): JsonResponse
    {
        $request->validate([
            'phone'    => 'required|string|max:20',
            'otp'      => 'required|string|size:6',
            'password' => ['required', 'string', 'size:6', 'regex:/^\d{6}$/'],
            'role'     => 'nullable|string|in:customer,driver,admin',
        ]);

        $phone = PhoneNumber::normalize($request->phone);

        $query = User::where('phone', $phone);
        if ($request->role) {
            $query->where('role', $request->role);
        }
        $user = $query->first();

        if (! $user) {
            return response()->json(['message' => 'Số điện thoại chưa đăng ký.'], 422);
        }

        $this->consumeOtp($phone, $request->otp);

        $user->update(['password' => Hash::make($request->password)]);

        $token = $user->createToken('api')->plainTextToken;

        return response()->json([
            'user'  => $this->userPayload($user),
            'token' => $token,
        ]);
    }
```

`consumeOtp()` giữ nguyên (đã nhận `string $phone` đã normalize từ caller, không cần đổi).

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `docker compose exec app php artisan test --filter=PhoneNormalizationTest`
Expected: PASS (6 test)

Run toàn bộ suite backend để đảm bảo không phá vỡ gì:

Run: `docker compose exec app php artisan test`
Expected: PASS (tất cả test, bao gồm `OtpSendTest`, `OtpZnsFieldsTest`, `PhoneNormalizationTest`, `Unit/Support/PhoneNumberTest`)

- [ ] **Step 5: Commit**

```bash
git add backend/app/Http/Controllers/Auth/AuthController.php backend/tests/Feature/PhoneNormalizationTest.php
git commit -m "fix: normalize phone number in AuthController before query/store"
```

---

## Self-Review Notes

- **Spec coverage:** helper + algorithm (Task 1), OtpController::send/verify (Task 2), AuthController::checkPhone/login/register/registerDriver/resetPassword (Task 3), unit test + feature test (Task 1 & 3) — tất cả section của spec đều có task tương ứng. Admin search và frontend explicitly out of scope, không có task — đúng theo spec.
- **Type consistency:** `PhoneNumber::normalize(?string $phone): string` dùng nhất quán ở Task 2 và Task 3, tên biến `$phone` nhất quán trong toàn bộ các method đã sửa.
- **No placeholders:** mọi step có code đầy đủ, không có "TBD"/"tương tự Task N".
