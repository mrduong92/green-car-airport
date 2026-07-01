# Driver Registration Refactor — Design Spec

**Date:** 2026-07-01
**Scope:** Thêm bước nộp giấy tờ pháp lý vào luồng đăng ký tài xế và yêu cầu admin duyệt trước khi tài xế hoạt động.

---

## Tóm tắt

Hiện tại tài xế đăng ký xong là active ngay (`is_verified: true` hardcode). Refactor này:
1. Thêm bước 5 vào form đăng ký: nhập số 5 loại giấy tờ pháp lý
2. Sau đăng ký tài xế ở trạng thái `pending`, không thể vào app
3. Admin xem giấy tờ và bấm "Duyệt" → tài xế active

---

## Giấy tờ yêu cầu

| Giấy tờ | Trường | Bắt buộc |
|---|---|---|
| CCCD | Số CCCD | Số ✓ |
| GPLX | Số GPLX | Số ✓ |
| Đăng ký xe | Số đăng ký | Số ✓ |
| Đăng kiểm xe | Số đăng kiểm + Ngày hết hạn | Cả hai ✓ |
| Bảo hiểm TNDS | Số bảo hiểm + Ngày hết hạn | Cả hai ✓ |

Tổng: 7 trường. Ngày hết hạn phải là ngày tương lai. Không upload ảnh.

---

## Database

**Migration mới:** thêm 7 cột vào bảng `driver_profiles`:

```php
$table->string('cccd_number')->nullable();
$table->string('gplx_number')->nullable();
$table->string('vehicle_reg_number')->nullable();
$table->string('vehicle_inspection_number')->nullable();
$table->date('vehicle_inspection_expiry')->nullable();
$table->string('insurance_number')->nullable();
$table->date('insurance_expiry')->nullable();
```

Nullable để không breaking existing rows. Validation bắt buộc ở tầng controller khi đăng ký.

---

## Backend

### `AuthController::registerDriver()`

**Validation bổ sung:**
```php
'cccd_number'               => 'required|string|max:20',
'gplx_number'               => 'required|string|max:20',
'vehicle_reg_number'        => 'required|string|max:30',
'vehicle_inspection_number' => 'required|string|max:30',
'vehicle_inspection_expiry' => 'required|date|after:today',
'insurance_number'          => 'required|string|max:30',
'insurance_expiry'          => 'required|date|after:today',
```

**Thay đổi khi tạo driver profile:**
- Bỏ `'is_verified' => true` — để mặc định `false`
- Bỏ `'is_online' => false` (giữ default)
- Thêm 7 trường giấy tờ vào `driverProfile()->create()`
- Status mặc định của bảng là `pending` — không cần set thêm

**Response:** trả `201` với user + token như hiện tại (tài xế đã login nhưng pending).

### `AuthController::userPayload()`

Thêm cho role `driver`:
```php
$payload['approval_status'] = $user->driverProfile?->status ?? 'pending';
```

Các giá trị: `'pending'` | `'active'` | `'blocked'`

### `Admin/DriverController::formatDriver()`

Thêm vào array trả về:
```php
'cccd_number'               => $p?->cccd_number,
'gplx_number'               => $p?->gplx_number,
'vehicle_reg_number'        => $p?->vehicle_reg_number,
'vehicle_inspection_number' => $p?->vehicle_inspection_number,
'vehicle_inspection_expiry' => $p?->vehicle_inspection_expiry,
'insurance_number'          => $p?->insurance_number,
'insurance_expiry'          => $p?->insurance_expiry,
```

---

## Frontend

### `DriverRegisterPage.tsx`

**Step indicator:** đổi từ 5 bước lên 6 bước. `type RegStep = 1 | 2 | 3 | 4 | 5 | 6`

**Bước 5 mới — Giấy tờ pháp lý:**

State mới:
```ts
const [cccdNumber, setCccd]         = useState('')
const [gplxNumber, setGplx]         = useState('')
const [vehicleRegNumber, setVehReg] = useState('')
const [inspectionNumber, setInsp]   = useState('')
const [inspectionExpiry, setInspEx] = useState('')
const [insuranceNumber, setInsur]   = useState('')
const [insuranceExpiry, setInsurEx] = useState('')
```

Validation bước 5:
```ts
const step5Valid =
  cccdNumber.trim() && gplxNumber.trim() && vehicleRegNumber.trim() &&
  inspectionNumber.trim() && inspectionExpiry &&
  insuranceNumber.trim() && insuranceExpiry
```

UI: form với 5 card nhỏ, mỗi card 1 loại giấy tờ. Ngày hết hạn dùng `<input type="date">`.

**Bước cũ 5 (Điều khoản) → Bước 6.**

**`driverRegisterApi` payload:** bổ sung 7 trường mới.

**Sau submit thành công:** `navigate('/driver/pending')` thay vì `navigate('/driver/trips')`.

### `DriverPendingPage.tsx` (file mới)

Route: `/driver/pending`

UI:
- Icon đồng hồ / pending lớn
- Tiêu đề: "Hồ sơ đang chờ xét duyệt"
- Mô tả: "Chúng tôi sẽ xem xét và phản hồi trong vòng 24–48 giờ làm việc."
- Nút "Đăng xuất" → `clearAuth()` → `navigate('/login')`
- Không có layout/nav bar — standalone page

### `src/types.d.ts`

Thêm vào `App.User`:
```ts
approval_status?: 'pending' | 'active' | 'blocked'
```

Thêm vào `App.AdminDriver` (hoặc tương đương):
```ts
cccd_number?: string | null
gplx_number?: string | null
vehicle_reg_number?: string | null
vehicle_inspection_number?: string | null
vehicle_inspection_expiry?: string | null
insurance_number?: string | null
insurance_expiry?: string | null
```

### `router/index.tsx`

Thêm route `/driver/pending` → `DriverPendingPage` (không cần guard, chỉ cần authenticated).

Guard cho các route driver khác: nếu `user.approval_status === 'pending'` → redirect `/driver/pending`.

Ngược lại: nếu `user.approval_status !== 'pending'` và vào `/driver/pending` → redirect `/driver/trips`.

### `admin/DriversPage.tsx`

Trong sheet chi tiết tài xế, thêm block "Giấy tờ pháp lý" phía trên nút Duyệt/Chặn:

```tsx
{/* Giấy tờ pháp lý */}
<div className="px-4 py-3 border-b border-border-soft">
  <p className="text-[11px] font-semibold text-neutral-gray uppercase tracking-wide mb-2">
    Giấy tờ pháp lý
  </p>
  <div className="flex flex-col gap-1.5">
    {[
      { label: 'CCCD',          value: driver.cccd_number },
      { label: 'GPLX',          value: driver.gplx_number },
      { label: 'Đăng ký xe',    value: driver.vehicle_reg_number },
      { label: 'Đăng kiểm',     value: driver.vehicle_inspection_number,
        expiry: driver.vehicle_inspection_expiry },
      { label: 'Bảo hiểm TNDS', value: driver.insurance_number,
        expiry: driver.insurance_expiry },
    ].map(({ label, value, expiry }) => (
      <div key={label} className="flex justify-between text-[13px]">
        <span className="text-neutral-gray">{label}</span>
        <span className="text-navy font-medium">
          {value ?? '—'}{expiry ? ` · HH: ${expiry}` : ''}
        </span>
      </div>
    ))}
  </div>
</div>
```

### `api/auth.ts`

Thêm 7 trường vào type/payload của `driverRegisterApi`.

---

## File map tổng hợp

| File | Loại | Thay đổi |
|---|---|---|
| `backend/database/migrations/YYYY_MM_DD_add_documents_to_driver_profiles.php` | Tạo mới | 7 cột mới |
| `backend/app/Http/Controllers/Auth/AuthController.php` | Sửa | validation + lưu giấy tờ, bỏ is_verified=true, thêm approval_status |
| `backend/app/Http/Controllers/Admin/DriverController.php` | Sửa | formatDriver() thêm 7 trường |
| `frontend/src/pages/DriverRegisterPage.tsx` | Sửa | 6 bước, thêm step 5 giấy tờ |
| `frontend/src/pages/driver/DriverPendingPage.tsx` | Tạo mới | Màn hình chờ duyệt |
| `frontend/src/router/index.tsx` | Sửa | route + guard pending |
| `frontend/src/types.d.ts` | Sửa | approval_status, document fields |
| `frontend/src/api/auth.ts` | Sửa | payload driverRegisterApi |
| `frontend/src/pages/admin/DriversPage.tsx` | Sửa | block giấy tờ trong detail sheet |

---

## Không nằm trong scope

- Upload ảnh giấy tờ
- Tài xế sửa lại hồ sơ sau khi nộp
- Admin reject với lý do
- Thông báo push/email khi được duyệt
- Kiểm tra trùng số CCCD/GPLX

---

## Test cases

1. Tài xế đăng ký đủ 7 trường → `status=pending`, vào app thấy màn hình chờ duyệt
2. Tài xế đăng ký thiếu trường giấy tờ → backend trả 422
3. Tài xế đăng ký ngày hết hạn đã qua → backend trả 422
4. Admin vào DriversPage → thấy driver pending + đầy đủ giấy tờ
5. Admin bấm Duyệt → driver `status=active`, `is_verified=true`
6. Driver active truy cập `/driver/pending` → redirect `/driver/trips`
7. Driver pending truy cập `/driver/trips` → redirect `/driver/pending`
