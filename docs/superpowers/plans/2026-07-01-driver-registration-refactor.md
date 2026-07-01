# Driver Registration Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm bước nộp 5 giấy tờ pháp lý vào luồng đăng ký tài xế và yêu cầu admin duyệt trước khi tài xế có thể nhận cuốc.

**Architecture:** DB thêm 7 cột vào `driver_profiles` lưu số giấy tờ và ngày hết hạn. Backend không còn hardcode `is_verified: true` khi đăng ký — tài xế ở trạng thái `pending` cho đến khi admin bấm Duyệt. Frontend thêm bước 5 (giấy tờ) vào form 6 bước, sau submit điều hướng đến màn hình chờ duyệt. Router guard chặn tài xế `pending` khỏi các trang hoạt động.

**Tech Stack:** Laravel 13 / PHP 8.4, React 19 + TypeScript, TanStack Query v5, Zustand, react-router-dom v6

## Global Constraints

- Tất cả text UI là tiếng Việt — không dịch sang tiếng Anh
- Không upload ảnh — chỉ nhập số giấy tờ và ngày hết hạn (text/date)
- Không có bước reject — admin chỉ duyệt hoặc không làm gì
- Backend: Laravel patterns — plain array response (không dùng API Resource classes)
- Frontend: Tailwind design tokens từ `frontend/tailwind.config.ts` — dùng `primary`, `danger-red`, `neutral-gray`, `border-gray`, v.v.
- Ngày hết hạn format: `Y-m-d` (backend), `<input type="date">` (frontend)

---

## File Map

| File | Loại | Task |
|---|---|---|
| `backend/database/migrations/2026_07_01_100000_add_documents_to_driver_profiles.php` | Tạo | 1 |
| `backend/app/Http/Controllers/Auth/AuthController.php` | Sửa | 1 |
| `backend/tests/Feature/DriverRegisterTest.php` | Sửa | 1 |
| `backend/app/Http/Controllers/Admin/DriverController.php` | Sửa | 2 |
| `backend/tests/Feature/AdminDriverDocumentsTest.php` | Tạo | 2 |
| `frontend/src/types.d.ts` | Sửa | 3 |
| `frontend/src/api/auth.ts` | Sửa | 3 |
| `frontend/src/pages/DriverRegisterPage.tsx` | Sửa | 4 |
| `frontend/src/pages/driver/DriverPendingPage.tsx` | Tạo | 5 |
| `frontend/src/router/index.tsx` | Sửa | 5 |
| `frontend/src/pages/admin/DriversPage.tsx` | Sửa | 6 |

---

## Task 1: Backend — Migration + `registerDriver()` + `userPayload()`

**Files:**
- Create: `backend/database/migrations/2026_07_01_100000_add_documents_to_driver_profiles.php`
- Modify: `backend/app/Http/Controllers/Auth/AuthController.php`
- Modify: `backend/tests/Feature/DriverRegisterTest.php`

**Interfaces:**
- Produces:
  - `POST /api/auth/register/driver` nhận thêm 7 trường: `cccd_number`, `gplx_number`, `vehicle_reg_number`, `vehicle_inspection_number`, `vehicle_inspection_expiry`, `insurance_number`, `insurance_expiry`
  - Response `user` có thêm field `approval_status: 'pending'`
  - `driver_profiles` có 7 cột mới, `is_verified` mặc định `false` sau đăng ký

- [ ] **Step 1: Viết test thất bại — thiếu giấy tờ trả 422**

Mở `backend/tests/Feature/DriverRegisterTest.php`. Thêm helper `docPayload()` và 3 test mới vào cuối class:

```php
private function docPayload(array $overrides = []): array
{
    return array_merge([
        'cccd_number'               => '079123456789',
        'gplx_number'               => '012345678910',
        'vehicle_reg_number'        => '29A-11111',
        'vehicle_inspection_number' => 'DK123456',
        'vehicle_inspection_expiry' => now()->addYear()->format('Y-m-d'),
        'insurance_number'          => 'BH789012',
        'insurance_expiry'          => now()->addYear()->format('Y-m-d'),
    ], $overrides);
}

public function test_driver_register_without_documents_returns_422(): void
{
    $this->postJson('/api/auth/register/driver', $this->payload())
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['cccd_number']);
}

public function test_driver_register_with_expired_date_returns_422(): void
{
    $data = array_merge($this->payload(), $this->docPayload([
        'vehicle_inspection_expiry' => now()->subDay()->format('Y-m-d'),
    ]));

    $this->postJson('/api/auth/register/driver', $data)
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['vehicle_inspection_expiry']);
}

public function test_driver_register_with_documents_creates_pending_profile(): void
{
    $data = array_merge($this->payload(), $this->docPayload());

    $this->postJson('/api/auth/register/driver', $data)
        ->assertCreated()
        ->assertJsonPath('user.approval_status', 'pending');

    $this->assertDatabaseHas('driver_profiles', [
        'vehicle_plate'  => '51G-11111',
        'is_verified'    => 0,
        'cccd_number'    => '079123456789',
        'gplx_number'    => '012345678910',
        'insurance_number' => 'BH789012',
    ]);
}
```

- [ ] **Step 2: Cập nhật test cũ bị ảnh hưởng**

Test `test_driver_register_creates_driver_profile_with_vehicle_type` assert `is_verified => 1` — phải sửa thành `0` vì sau refactor driver bắt đầu là pending:

```php
public function test_driver_register_creates_driver_profile_with_vehicle_type(): void
{
    $data = array_merge($this->payload(), $this->docPayload());

    $this->postJson('/api/auth/register/driver', $data)
        ->assertCreated();

    $this->assertDatabaseHas('driver_profiles', [
        'vehicle_plate' => '51G-11111',
        'vehicle_type'  => 'sedan_4',
        'is_verified'   => 0,
    ]);
}
```

Tương tự, `test_driver_register_creates_user_with_driver_role` cần thêm doc fields vào payload:

```php
public function test_driver_register_creates_user_with_driver_role(): void
{
    $data = array_merge($this->payload(), $this->docPayload());

    $this->postJson('/api/auth/register/driver', $data)
        ->assertCreated()
        ->assertJsonPath('user.role', 'driver')
        ->assertJsonStructure(['token', 'user']);

    $this->assertDatabaseHas('users', ['phone' => '0911111111', 'role' => 'driver']);
}
```

Cập nhật tương tự cho **tất cả** test khác trong file sử dụng `$this->payload()` — thay bằng `array_merge($this->payload(), $this->docPayload())`.

- [ ] **Step 3: Chạy test để xác nhận fail**

```bash
docker compose exec app php artisan test --filter=DriverRegisterTest
```

Expected: test mới fail vì chưa có validation và cột DB chưa tồn tại.

- [ ] **Step 4: Tạo migration**

Tạo file `backend/database/migrations/2026_07_01_100000_add_documents_to_driver_profiles.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('driver_profiles', function (Blueprint $table) {
            $table->string('cccd_number', 20)->nullable()->after('blocked_reason');
            $table->string('gplx_number', 20)->nullable()->after('cccd_number');
            $table->string('vehicle_reg_number', 30)->nullable()->after('gplx_number');
            $table->string('vehicle_inspection_number', 30)->nullable()->after('vehicle_reg_number');
            $table->date('vehicle_inspection_expiry')->nullable()->after('vehicle_inspection_number');
            $table->string('insurance_number', 30)->nullable()->after('vehicle_inspection_expiry');
            $table->date('insurance_expiry')->nullable()->after('insurance_number');
        });
    }

    public function down(): void
    {
        Schema::table('driver_profiles', function (Blueprint $table) {
            $table->dropColumn([
                'cccd_number', 'gplx_number', 'vehicle_reg_number',
                'vehicle_inspection_number', 'vehicle_inspection_expiry',
                'insurance_number', 'insurance_expiry',
            ]);
        });
    }
};
```

- [ ] **Step 5: Chạy migration**

```bash
docker compose exec app php artisan migrate
```

Expected: `Migrating: 2026_07_01_100000_add_documents_to_driver_profiles` → `Migrated`.

- [ ] **Step 6: Cập nhật `DriverProfile` model**

Mở `backend/app/Models/DriverProfile.php`. Thêm 7 cột mới vào `$fillable`:

```php
protected $fillable = [
    'user_id','vehicle_make','vehicle_model','vehicle_plate','vehicle_year',
    'vehicle_color','vehicle_type','status','blocked_reason','is_verified','is_online',
    'latitude','longitude','payment_code','rating','trips_count',
    'cccd_number','gplx_number','vehicle_reg_number',
    'vehicle_inspection_number','vehicle_inspection_expiry',
    'insurance_number','insurance_expiry',
];
```

Thêm cast cho date fields:

```php
protected $casts = [
    'is_verified'              => 'boolean',
    'is_online'                => 'boolean',
    'vehicle_inspection_expiry' => 'date',
    'insurance_expiry'         => 'date',
];
```

- [ ] **Step 7: Cập nhật `AuthController::registerDriver()`**

Mở `backend/app/Http/Controllers/Auth/AuthController.php`. Tìm method `registerDriver()`.

**Thêm validation** cho 7 trường mới (sau validation `vehicle_type`):

```php
'cccd_number'               => 'required|string|max:20',
'gplx_number'               => 'required|string|max:20',
'vehicle_reg_number'        => 'required|string|max:30',
'vehicle_inspection_number' => 'required|string|max:30',
'vehicle_inspection_expiry' => 'required|date|after:today',
'insurance_number'          => 'required|string|max:30',
'insurance_expiry'          => 'required|date|after:today',
```

**Trong `driverProfile()->create([...])`**, xóa `'is_verified' => true` và thêm 7 trường mới:

```php
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
```

- [ ] **Step 8: Cập nhật `AuthController::userPayload()`**

Tìm block `if ($user->role === 'driver')`, thêm `approval_status`:

```php
if ($user->role === 'driver') {
    $payload['needs_onboarding'] = ! $user->driverProfile?->vehicle_plate;
    $payload['approval_status']  = $user->driverProfile?->status ?? 'pending';
}
```

- [ ] **Step 9: Chạy test để xác nhận pass**

```bash
docker compose exec app php artisan test --filter=DriverRegisterTest
```

Expected: tất cả tests PASS.

- [ ] **Step 10: Chạy toàn bộ test suite**

```bash
docker compose exec app php artisan test
```

Expected: tất cả tests PASS (không có regression).

- [ ] **Step 11: Commit**

```bash
git add backend/database/migrations/2026_07_01_100000_add_documents_to_driver_profiles.php \
        backend/app/Models/DriverProfile.php \
        backend/app/Http/Controllers/Auth/AuthController.php \
        backend/tests/Feature/DriverRegisterTest.php
git commit -m "feat: add document fields to driver registration, require admin approval"
```

---

## Task 2: Backend — `formatDriver()` trả document fields

**Files:**
- Modify: `backend/app/Http/Controllers/Admin/DriverController.php`
- Create: `backend/tests/Feature/AdminDriverDocumentsTest.php`

**Interfaces:**
- Consumes: 7 cột mới trên `driver_profiles` (từ Task 1)
- Produces: `GET /api/admin/drivers` response mỗi driver có thêm 7 document fields

- [ ] **Step 1: Viết test thất bại**

Tạo `backend/tests/Feature/AdminDriverDocumentsTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\DriverProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminDriverDocumentsTest extends TestCase
{
    use RefreshDatabase;

    private function makeAdmin(): User
    {
        return User::factory()->create(['role' => 'admin']);
    }

    private function makeDriverWithDocs(): User
    {
        $driver = User::factory()->create(['role' => 'driver']);
        DriverProfile::create([
            'user_id'                   => $driver->id,
            'vehicle_make'              => 'Toyota',
            'vehicle_model'             => 'Camry',
            'vehicle_plate'             => '51G-99999',
            'vehicle_year'              => 2022,
            'vehicle_color'             => 'Trắng',
            'vehicle_type'              => 'sedan_4',
            'status'                    => 'pending',
            'is_verified'               => false,
            'cccd_number'               => '079123456789',
            'gplx_number'               => '012345678910',
            'vehicle_reg_number'        => '29A-99999',
            'vehicle_inspection_number' => 'DK999999',
            'vehicle_inspection_expiry' => now()->addYear()->format('Y-m-d'),
            'insurance_number'          => 'BH999999',
            'insurance_expiry'          => now()->addYear()->format('Y-m-d'),
        ]);
        return $driver;
    }

    public function test_admin_driver_list_includes_document_fields(): void
    {
        $admin  = $this->makeAdmin();
        $driver = $this->makeDriverWithDocs();

        $response = $this->actingAs($admin)
            ->getJson('/api/admin/drivers')
            ->assertOk();

        $driverData = collect($response->json())->firstWhere('id', $driver->id);

        $this->assertNotNull($driverData);
        $this->assertEquals('079123456789', $driverData['cccd_number']);
        $this->assertEquals('012345678910', $driverData['gplx_number']);
        $this->assertEquals('29A-99999',    $driverData['vehicle_reg_number']);
        $this->assertEquals('DK999999',     $driverData['vehicle_inspection_number']);
        $this->assertNotNull($driverData['vehicle_inspection_expiry']);
        $this->assertEquals('BH999999',     $driverData['insurance_number']);
        $this->assertNotNull($driverData['insurance_expiry']);
    }
}
```

- [ ] **Step 2: Chạy test để xác nhận fail**

```bash
docker compose exec app php artisan test --filter=AdminDriverDocumentsTest
```

Expected: FAIL — `cccd_number` key không tồn tại trong response.

- [ ] **Step 3: Cập nhật `formatDriver()`**

Mở `backend/app/Http/Controllers/Admin/DriverController.php`. Tìm `private function formatDriver(User $u)`. Thêm 7 trường vào cuối array return (trước dấu `]`):

```php
'cccd_number'               => $p?->cccd_number,
'gplx_number'               => $p?->gplx_number,
'vehicle_reg_number'        => $p?->vehicle_reg_number,
'vehicle_inspection_number' => $p?->vehicle_inspection_number,
'vehicle_inspection_expiry' => $p?->vehicle_inspection_expiry?->format('Y-m-d'),
'insurance_number'          => $p?->insurance_number,
'insurance_expiry'          => $p?->insurance_expiry?->format('Y-m-d'),
```

- [ ] **Step 4: Chạy test để xác nhận pass**

```bash
docker compose exec app php artisan test --filter=AdminDriverDocumentsTest
```

Expected: PASS.

- [ ] **Step 5: Chạy toàn bộ test suite**

```bash
docker compose exec app php artisan test
```

Expected: tất cả PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/Http/Controllers/Admin/DriverController.php \
        backend/tests/Feature/AdminDriverDocumentsTest.php
git commit -m "feat: expose driver document fields in admin API response"
```

---

## Task 3: Frontend — Types + API

**Files:**
- Modify: `frontend/src/types.d.ts`
- Modify: `frontend/src/api/auth.ts`

**Interfaces:**
- Produces:
  - `App.User` có `approval_status?: 'pending' | 'active' | 'blocked'`
  - `App.DriverProfile` có 7 document fields (optional/nullable)
  - `driverRegisterApi` nhận thêm 7 trường

- [ ] **Step 1: Cập nhật `types.d.ts`**

Mở `frontend/src/types.d.ts`.

Thêm `approval_status` vào `interface User` (sau `referral_code`):

```ts
approval_status?: 'pending' | 'active' | 'blocked'
```

Thêm 7 document fields vào `interface DriverProfile` (sau `is_online`):

```ts
cccd_number?: string | null
gplx_number?: string | null
vehicle_reg_number?: string | null
vehicle_inspection_number?: string | null
vehicle_inspection_expiry?: string | null
insurance_number?: string | null
insurance_expiry?: string | null
```

- [ ] **Step 2: Cập nhật `driverRegisterApi` trong `api/auth.ts`**

Mở `frontend/src/api/auth.ts`. Thêm 7 trường vào type của `driverRegisterApi`:

```ts
export const driverRegisterApi = (data: {
  phone: string
  otp: string
  password: string
  name: string
  vehicle_make: string
  vehicle_model: string
  vehicle_plate: string
  vehicle_year: number
  vehicle_color: string
  vehicle_type: 'sedan_4' | 'suv_5' | 'mpv_7'
  cccd_number: string
  gplx_number: string
  vehicle_reg_number: string
  vehicle_inspection_number: string
  vehicle_inspection_expiry: string
  insurance_number: string
  insurance_expiry: string
}) =>
  api.post<{ token: string; user: App.User }>('/auth/register/driver', data)
```

- [ ] **Step 3: Kiểm tra TypeScript compile không có lỗi**

```bash
docker compose exec green_car_frontend npx tsc --noEmit
```

Expected: không có lỗi type.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types.d.ts frontend/src/api/auth.ts
git commit -m "feat: add approval_status and document fields to frontend types and API"
```

---

## Task 4: Frontend — `DriverRegisterPage` 6 bước

**Files:**
- Modify: `frontend/src/pages/DriverRegisterPage.tsx`

**Interfaces:**
- Consumes: `driverRegisterApi` với 7 trường mới (Task 3)
- Produces: sau submit thành công → `navigate('/driver/pending')` (Task 5 tạo page này)

- [ ] **Step 1: Thêm state cho giấy tờ và đổi RegStep**

Mở `frontend/src/pages/DriverRegisterPage.tsx`. Đổi type và thêm state:

```ts
type RegStep = 1 | 2 | 3 | 4 | 5 | 6

// Thêm sau state vehicleType:
const [cccdNumber,       setCccd]    = useState('')
const [gplxNumber,       setGplx]    = useState('')
const [vehicleRegNumber, setVehReg]  = useState('')
const [inspectionNumber, setInspNum] = useState('')
const [inspectionExpiry, setInspExp] = useState('')
const [insuranceNumber,  setInsurNum]= useState('')
const [insuranceExpiry,  setInsurExp]= useState('')
```

- [ ] **Step 2: Thêm validation bước 5 và cập nhật step indicator**

Thêm validation bước 5 (sau `step4Valid`):

```ts
const today = new Date().toISOString().split('T')[0]
const step5Valid =
  cccdNumber.trim() !== '' &&
  gplxNumber.trim() !== '' &&
  vehicleRegNumber.trim() !== '' &&
  inspectionNumber.trim() !== '' &&
  inspectionExpiry > today &&
  insuranceNumber.trim() !== '' &&
  insuranceExpiry > today
```

Cập nhật step indicator — đổi `[1, 2, 3, 4, 5]` thành `[1, 2, 3, 4, 5, 6]`:

```tsx
{([1, 2, 3, 4, 5, 6] as RegStep[]).map((n, i) => (
  <div key={n} className={`flex items-center ${i < 5 ? 'flex-1' : ''}`}>
    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
      step > n ? 'bg-primary text-white' : step === n ? 'bg-navy text-white' : 'bg-border-gray text-neutral-gray'
    }`}>
      {step > n ? <span className="material-symbols-outlined text-[14px]">check</span> : n}
    </div>
    {i < 5 && <div className={`flex-1 h-px mx-1 ${step > n ? 'bg-primary' : 'bg-border-gray'}`} />}
  </div>
))}
```

- [ ] **Step 3: Cập nhật `registerMutation` payload và navigate**

Thêm 7 trường mới vào `mutationFn`:

```ts
const registerMutation = useMutation({
  mutationFn: () => driverRegisterApi({
    phone,
    otp: otp.join(''),
    password,
    name,
    vehicle_make:              vehicleMake,
    vehicle_model:             vehicleModel,
    vehicle_plate:             vehiclePlate,
    vehicle_year:              Number(vehicleYear),
    vehicle_color:             vehicleColor,
    vehicle_type:              vehicleType,
    cccd_number:               cccdNumber,
    gplx_number:               gplxNumber,
    vehicle_reg_number:        vehicleRegNumber,
    vehicle_inspection_number: inspectionNumber,
    vehicle_inspection_expiry: inspectionExpiry,
    insurance_number:          insuranceNumber,
    insurance_expiry:          insuranceExpiry,
  }),
  onSuccess: ({ data }) => {
    setAuth(data.user, data.token)
    registerPushSubscription()
    navigate('/driver/pending')   // đổi từ '/driver/trips'
  },
  onError: (err: { response?: { data?: { message?: string } } }) => {
    showToast(err.response?.data?.message ?? 'Đăng ký thất bại. Vui lòng thử lại.', 'error')
  },
})
```

- [ ] **Step 4: Thêm bước 5 JSX (giấy tờ) và đổi bước 5 cũ → bước 6**

Tìm `{/* ── Bước 5: Điều khoản ── */}` trong JSX, đổi thành `{step === 6 && (...)` và thêm bước 5 mới TRƯỚC nó:

```tsx
{/* ── Bước 5: Giấy tờ pháp lý ── */}
{step === 5 && (
  <>
    <h2 className="text-navy font-semibold text-[17px] -mt-2">Giấy tờ pháp lý</h2>

    {/* CCCD */}
    <div>
      <p className="text-[11px] font-semibold text-neutral-gray uppercase tracking-wider mb-2">Số CCCD *</p>
      <input type="text" value={cccdNumber} onChange={(e) => setCccd(e.target.value)} maxLength={20}
        placeholder="079123456789"
        className="w-full h-[52px] border-[1.5px] border-border-gray rounded-input px-4 text-navy outline-none focus:border-primary focus:shadow-[0_0_0_4px_rgba(0,106,54,0.18)] transition-shadow"
      />
    </div>

    {/* GPLX */}
    <div>
      <p className="text-[11px] font-semibold text-neutral-gray uppercase tracking-wider mb-2">Số GPLX *</p>
      <input type="text" value={gplxNumber} onChange={(e) => setGplx(e.target.value)} maxLength={20}
        placeholder="012345678910"
        className="w-full h-[52px] border-[1.5px] border-border-gray rounded-input px-4 text-navy outline-none focus:border-primary focus:shadow-[0_0_0_4px_rgba(0,106,54,0.18)] transition-shadow"
      />
    </div>

    {/* Đăng ký xe */}
    <div>
      <p className="text-[11px] font-semibold text-neutral-gray uppercase tracking-wider mb-2">Số đăng ký xe *</p>
      <input type="text" value={vehicleRegNumber} onChange={(e) => setVehReg(e.target.value)} maxLength={30}
        placeholder="29A-12345"
        className="w-full h-[52px] border-[1.5px] border-border-gray rounded-input px-4 text-navy outline-none focus:border-primary focus:shadow-[0_0_0_4px_rgba(0,106,54,0.18)] transition-shadow"
      />
    </div>

    {/* Đăng kiểm xe */}
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-semibold text-neutral-gray uppercase tracking-wider">Đăng kiểm xe *</p>
      <input type="text" value={inspectionNumber} onChange={(e) => setInspNum(e.target.value)} maxLength={30}
        placeholder="Số đăng kiểm"
        className="w-full h-[52px] border-[1.5px] border-border-gray rounded-input px-4 text-navy outline-none focus:border-primary focus:shadow-[0_0_0_4px_rgba(0,106,54,0.18)] transition-shadow"
      />
      <div>
        <p className="text-[11px] text-neutral-gray mb-1">Ngày hết hạn *</p>
        <input type="date" value={inspectionExpiry} onChange={(e) => setInspExp(e.target.value)}
          min={new Date().toISOString().split('T')[0]}
          className="w-full h-[52px] border-[1.5px] border-border-gray rounded-input px-4 text-navy outline-none focus:border-primary focus:shadow-[0_0_0_4px_rgba(0,106,54,0.18)] transition-shadow"
        />
      </div>
    </div>

    {/* Bảo hiểm TNDS */}
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-semibold text-neutral-gray uppercase tracking-wider">Bảo hiểm TNDS *</p>
      <input type="text" value={insuranceNumber} onChange={(e) => setInsurNum(e.target.value)} maxLength={30}
        placeholder="Số bảo hiểm"
        className="w-full h-[52px] border-[1.5px] border-border-gray rounded-input px-4 text-navy outline-none focus:border-primary focus:shadow-[0_0_0_4px_rgba(0,106,54,0.18)] transition-shadow"
      />
      <div>
        <p className="text-[11px] text-neutral-gray mb-1">Ngày hết hạn *</p>
        <input type="date" value={insuranceExpiry} onChange={(e) => setInsurExp(e.target.value)}
          min={new Date().toISOString().split('T')[0]}
          className="w-full h-[52px] border-[1.5px] border-border-gray rounded-input px-4 text-navy outline-none focus:border-primary focus:shadow-[0_0_0_4px_rgba(0,106,54,0.18)] transition-shadow"
        />
      </div>
    </div>

    <Button fullWidth size="lg" disabled={!step5Valid} onClick={() => setStep(6)}>Tiếp theo</Button>
  </>
)}

{/* ── Bước 6: Điều khoản ── */}
{step === 6 && (
  <>
    <h2 className="text-navy font-semibold text-[17px] -mt-2">Xem lại tài liệu pháp lý</h2>
    <div className="flex flex-col gap-4">
      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" checked={agreedPrivacy} onChange={(e) => setPrivacy(e.target.checked)} className="w-5 h-5 mt-0.5 accent-primary shrink-0" />
        <span className="text-sm text-navy leading-snug">
          Tôi đồng ý với{' '}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary font-semibold underline">Chính sách bảo mật</a>
        </span>
      </label>
      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" checked={agreedTerms} onChange={(e) => setTerms(e.target.checked)} className="w-5 h-5 mt-0.5 accent-primary shrink-0" />
        <span className="text-sm text-navy leading-snug">
          Tôi đồng ý với{' '}
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary font-semibold underline">Điều khoản sử dụng</a>
        </span>
      </label>
    </div>
    <Button fullWidth size="lg" loading={registerMutation.isPending} disabled={!step5Valid} onClick={() => registerMutation.mutate()}>
      Đăng ký tài xế
    </Button>
  </>
)}
```

Lưu ý: `step5Valid` ở bước 6 button vẫn dùng biến `agreedPrivacy && agreedTerms` — đổi tên biến validation điều khoản thành `step6Valid`:

```ts
const step6Valid = agreedPrivacy && agreedTerms
```

Và đổi trong bước 6 button: `disabled={!step6Valid}`.

Cũng cần cập nhật `handleBack` để bước 6 quay lại bước 5:

```ts
const handleBack = () => {
  if (step === 1) navigate('/')
  else { if (step === 2) setOtp(['', '', '', '', '', '']); setStep((s) => (s - 1) as RegStep) }
}
```

(Logic này đã đúng — `s - 1` từ 6 về 5, từ 5 về 4, v.v.)

- [ ] **Step 5: Kiểm tra thủ công form đăng ký**

Mở http://localhost:5173/register/driver, đi qua 6 bước, xác nhận:
- Step indicator hiển thị 6 bước
- Bước 5 hiện đúng 5 loại giấy tờ
- Nút "Tiếp theo" bước 5 bị disabled khi chưa điền đủ
- Bước 6 vẫn hiện điều khoản, nút "Đăng ký tài xế"

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/DriverRegisterPage.tsx
git commit -m "feat: add document step to driver registration (6-step flow)"
```

---

## Task 5: Frontend — `DriverPendingPage` + Router guards

**Files:**
- Create: `frontend/src/pages/driver/DriverPendingPage.tsx`
- Modify: `frontend/src/router/index.tsx`

**Interfaces:**
- Consumes: `App.User.approval_status` (Task 3), `/driver/pending` route (Task này)
- Produces: tài xế `pending` bị redirect đến `/driver/pending` khi vào bất kỳ route driver nào khác

- [ ] **Step 1: Tạo `DriverPendingPage.tsx`**

Tạo `frontend/src/pages/driver/DriverPendingPage.tsx`:

```tsx
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { logout } from '@/api/auth'
import ToastContainer from '@/components/common/Toast'
import Button from '@/components/common/Button'
import { useMutation } from '@tanstack/react-query'

export default function DriverPendingPage() {
  const navigate  = useNavigate()
  const clearAuth = useAuthStore((s) => s.clearAuth)

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSettled: () => { clearAuth(); navigate('/login', { replace: true }) },
  })

  return (
    <div className="min-h-svh bg-warm-white flex flex-col items-center justify-center px-6 text-center gap-6">
      <ToastContainer />

      <div className="w-20 h-20 rounded-full bg-primary-tint flex items-center justify-center">
        <span className="material-symbols-outlined text-primary text-[40px]"
              style={{ fontVariationSettings: "'FILL' 1" }}>
          pending
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="text-[22px] font-bold text-navy leading-tight">
          Hồ sơ đang chờ xét duyệt
        </h1>
        <p className="text-sm text-neutral-gray leading-relaxed max-w-xs mx-auto">
          Chúng tôi sẽ xem xét hồ sơ và giấy tờ của bạn trong vòng
          <strong className="text-navy"> 24–48 giờ</strong> làm việc.
        </p>
      </div>

      <div className="w-full max-w-xs flex flex-col gap-3">
        <div className="bg-white rounded-card shadow-card p-4 flex flex-col gap-2 text-left">
          {[
            'Giấy tờ đã nộp sẽ được kiểm tra',
            'Admin sẽ kích hoạt tài khoản sau khi duyệt',
            'Bạn sẽ nhận được thông báo khi được duyệt',
          ].map((text) => (
            <div key={text} className="flex items-start gap-2">
              <span className="material-symbols-outlined text-primary text-[16px] mt-0.5 shrink-0"
                    style={{ fontVariationSettings: "'FILL' 1" }}>
                check_circle
              </span>
              <p className="text-[13px] text-navy">{text}</p>
            </div>
          ))}
        </div>

        <Button
          fullWidth
          variant="outline"
          loading={logoutMutation.isPending}
          onClick={() => logoutMutation.mutate()}
        >
          Đăng xuất
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Cập nhật `router/index.tsx`**

Mở `frontend/src/router/index.tsx`.

**Thêm import:**

```tsx
import DriverPendingPage from '@/pages/driver/DriverPendingPage'
```

**Thêm 2 guard component mới** (thay thế `RequireRole role="driver"` hiện tại):

```tsx
// Thay RequireRole role="driver" — chỉ cho driver đã active vào
function RequireDriverActive() {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'driver') return <Navigate to="/" replace />
  if (user.approval_status === 'pending') return <Navigate to="/driver/pending" replace />
  return <Outlet />
}

// Chỉ cho driver pending vào /driver/pending
function RequireDriverPending() {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'driver') return <Navigate to="/" replace />
  if (user.approval_status !== 'pending') return <Navigate to="/driver/trips" replace />
  return <Outlet />
}
```

**Cập nhật `GuestOnly`** — driver pending phải đi đến `/driver/pending`:

```tsx
function GuestOnly() {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Outlet />
  if (user.role === 'customer') return <Navigate to="/customer/booking" replace />
  if (user.role === 'driver') {
    if (user.approval_status === 'pending') return <Navigate to="/driver/pending" replace />
    return <Navigate to="/driver/trips" replace />
  }
  return <Navigate to="/admin/dashboard" replace />
}
```

**Cập nhật router config** — đổi `RequireRole role="driver"` thành `RequireDriverActive` và thêm route pending:

```tsx
{
  element: <RequireDriverPending />,
  children: [
    { path: '/driver/pending', element: <DriverPendingPage /> },
  ],
},
{
  element: <RequireDriverActive />,
  children: [
    {
      element: <DriverLayout />,
      children: [
        { path: '/driver/trips',         element: <TripListPage /> },
        { path: '/driver/trips/history', element: <TripHistoryPage /> },
        { path: '/driver/trips/:id',     element: <TripDetailPage /> },
        { path: '/driver/wallet',        element: <WalletPage /> },
        { path: '/driver/wallet/topup',  element: <TopUpPage /> },
        { path: '/driver/stats',         element: <DriverStatsPage /> },
        { path: '/driver/notifications', element: <DriverNotificationsPage /> },
        { path: '/driver/profile',       element: <DriverProfilePage /> },
      ],
    },
  ],
},
```

- [ ] **Step 3: Kiểm tra thủ công**

1. Đăng ký tài xế mới qua 6 bước → sau submit thấy màn hình `/driver/pending`
2. Thử truy cập http://localhost:5173/driver/trips → bị redirect về `/driver/pending`
3. Bấm "Đăng xuất" → về `/login`
4. Login lại bằng tài khoản driver đã active (0912345678 / 000000) → vào `/driver/trips` bình thường
5. Thử truy cập http://localhost:5173/driver/pending khi đã active → redirect về `/driver/trips`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/driver/DriverPendingPage.tsx \
        frontend/src/router/index.tsx
git commit -m "feat: add driver pending page and router guards for approval flow"
```

---

## Task 6: Frontend — Admin DriversPage hiển thị giấy tờ

**Files:**
- Modify: `frontend/src/pages/admin/DriversPage.tsx`

**Interfaces:**
- Consumes: `App.DriverProfile` với 7 document fields (Task 3) + `GET /api/admin/drivers` trả document fields (Task 2)

- [ ] **Step 1: Thêm document section vào driver card**

Mở `frontend/src/pages/admin/DriversPage.tsx`. Tìm đoạn `{/* Vehicle info row */}` (khoảng line 201). Thêm block giấy tờ ngay SAU vehicle info row:

```tsx
{/* Vehicle info row */}
{(d.vehicle_make || d.vehicle_plate) && (
  <div className="mt-3 pt-3 border-t border-border-soft flex items-center gap-2 text-[12px] text-neutral-gray">
    <span className="material-symbols-outlined text-[14px]">directions_car</span>
    <span>{d.vehicle_make} {d.vehicle_model}</span>
    {d.vehicle_plate && <span className="font-semibold text-navy">· {d.vehicle_plate}</span>}
    {d.vehicle_color && <span>· {d.vehicle_color}</span>}
  </div>
)}

{/* Document info — hiển thị khi driver có giấy tờ (thường là pending) */}
{d.cccd_number && (
  <div className="mt-3 pt-3 border-t border-border-soft">
    <p className="text-[11px] font-semibold text-neutral-gray uppercase tracking-wide mb-2">
      Giấy tờ pháp lý
    </p>
    <div className="flex flex-col gap-1.5">
      {([
        { label: 'CCCD',           value: d.cccd_number,               expiry: undefined },
        { label: 'GPLX',           value: d.gplx_number,               expiry: undefined },
        { label: 'Đăng ký xe',     value: d.vehicle_reg_number,        expiry: undefined },
        { label: 'Đăng kiểm',      value: d.vehicle_inspection_number, expiry: d.vehicle_inspection_expiry },
        { label: 'Bảo hiểm TNDS', value: d.insurance_number,          expiry: d.insurance_expiry },
      ] as { label: string; value?: string | null; expiry?: string | null }[]).map(({ label, value, expiry }) => (
        <div key={label} className="flex justify-between text-[12px]">
          <span className="text-neutral-gray">{label}</span>
          <span className="text-navy font-medium">
            {value ?? '—'}{expiry ? ` · HH: ${expiry}` : ''}
          </span>
        </div>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 2: Kiểm tra thủ công**

1. Login admin (0923456789 / 000000) → vào `/admin/drivers`
2. Filter "Chờ duyệt" → thấy driver mới đăng ký
3. Card hiển thị block "Giấy tờ pháp lý" với đủ 5 dòng
4. Bấm "Duyệt" → driver chuyển sang active, block giấy tờ ẩn đi (vì `d.status` không còn `pending`)

Lưu ý: block giấy tờ hiển thị dựa vào `d.cccd_number` (không phải `d.status`), nên driver active cũ không có docs sẽ không bị ảnh hưởng.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/admin/DriversPage.tsx
git commit -m "feat: show driver documents in admin drivers list for review"
```

---

## Checklist tự review sau khi hoàn thành

- [ ] Đăng ký tài xế mới → phải submit đủ 7 trường giấy tờ → `status=pending`
- [ ] Thiếu giấy tờ → backend trả 422
- [ ] Ngày hết hạn quá khứ → backend trả 422
- [ ] Response `user.approval_status === 'pending'` sau đăng ký
- [ ] Driver pending truy cập `/driver/trips` → redirect `/driver/pending`
- [ ] Driver pending bấm Đăng xuất → về `/login`
- [ ] Admin thấy giấy tờ trong card driver pending
- [ ] Admin bấm Duyệt → driver active, có thể nhận cuốc
- [ ] Driver active không thể vào `/driver/pending`
- [ ] Driver cũ (seeded) vẫn hoạt động bình thường (not affected)
