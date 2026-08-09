# Tuỳ chọn VIP (xe cá nhân) — Design

**Ngày:** 2026-08-10
**Trạng thái:** đã chốt, chờ implement

## Mục tiêu

Khách đặt xe được chọn **VIP** — cam kết xe cá nhân, biển trắng, không phải xe
dịch vụ. Cuốc VIP chỉ đến tay tài xế đã khai và được admin duyệt là xe cá nhân,
và có bảng giá riêng.

## VIP không phải là loại xe

`vehicle_type` hiện là **thang sức chứa**, không phải danh sách phẳng:
`VehicleCapacity::RANK` cho tài xế xe 7 chỗ nhận được cả cuốc 4/5/7 chỗ.

Xe biển trắng có thể là 4, 5 hay 7 chỗ, nên VIP **vuông góc** với số chỗ. Nếu
thêm `vip` thành giá trị thứ 4 của `vehicle_type` thì phải gán cho nó một bậc
trên thang, và bậc nào cũng sai:

| Gán bậc | Hậu quả |
|---|---|
| Cao nhất (> 7) | Tài xế VIP 4 chỗ bị đẩy cuốc 7 chỗ — chở không nổi |
| Thấp nhất (< 4) | Tài xế xe 7 chỗ biển vàng nhận được cuốc VIP — sai cam kết với khách |

Vì vậy VIP là **một cột boolean riêng**, song song với `vehicle_type`.

## 1. Lược đồ CSDL

Ba migration, mỗi bảng một cột `is_vip` boolean `NOT NULL DEFAULT false`:

| Bảng | Cột | Ý nghĩa |
|---|---|---|
| `bookings` | `is_vip` | Khách yêu cầu xe cá nhân |
| `driver_profiles` | `is_vip` | Xe của tài xế là xe cá nhân, biển trắng |
| `price_configs` | `is_vip` | Dòng bảng giá áp cho cuốc VIP |

Dùng **cùng một tên** `is_vip` ở cả ba bảng. Mỗi migration kèm docblock:

> VIP = xe cá nhân, biển trắng, KHÔNG phải xe dịch vụ. Không phải hạng xe sang —
> xe VIP vẫn là 4/5/7 chỗ bình thường, khác biệt nằm ở loại biển.

`down()` của cả ba migration bọc trong `Schema::hasColumn()` — cùng lý do đã ghi
ở migration `driver_profiles.vehicle_type`: rollback trên MySQL và sqlite hành xử
khác nhau.

`price_configs` không có unique index ở tầng DB (kiểm tra trùng nằm trong
controller), nên migration này không phải đụng index.

## 2. Quy tắc ghép cuốc

### 2.1 Dọn bản sao trước — bắt buộc

`TripController` đang giữ **bản sao** của quy tắc sức chứa:

- `TripController::VEHICLE_CAPACITY_RANK` — trùng `VehicleCapacity::RANK`
- `TripController::vehicleTypesFittingDriver()` — trùng `VehicleCapacity::bookingTypesFittingDriver()`
- `TripController::fitsDriverVehicle()` — trùng `VehicleCapacity::fits()`

`VehicleCapacity` có docblock tự nhận là "NGUỒN DUY NHẤT", nhưng thực tế không
phải. Thêm chiều VIP vào một bản mà quên bản kia thì **cuốc VIP lọt xuống tài xế
thường và không có lỗi nào báo** — danh sách vẫn trả về, `accept()` vẫn cho qua.

Task đầu tiên là xoá cả ba thành viên trên khỏi `TripController` và gọi
`VehicleCapacity`. Không thêm gì về VIP ở bước này, để nếu test vỡ thì biết ngay
là do việc dọn chứ không phải do tính năng mới.

### 2.2 Thêm chiều VIP

`VehicleCapacity` nhận thêm cờ VIP ở cả ba hàm:

```php
public static function fits(
    ?string $bookingType,
    ?string $driverType,
    bool $bookingIsVip = false,
    bool $driverIsVip = false,
): bool
```

Quy tắc:

| Cuốc | Tài xế | Nhận được? |
|---|---|---|
| VIP | VIP | ✅ (nếu đủ sức chứa) |
| VIP | thường | ❌ |
| thường | VIP | ✅ (nếu đủ sức chứa) |
| thường | thường | ✅ (nếu đủ sức chứa) |

Xe biển trắng chạy cuốc thường **được phép** — không có lý do chặn, và càng nhiều
nguồn cung cho cuốc thường càng tốt. Quy tắc rút gọn: `bookingIsVip` kéo theo
`driverIsVip`, chiều ngược lại thì không.

Điều kiện sức chứa theo `RANK` giữ nguyên, không đổi.

### 2.3 Ba chỗ lọc phải sửa đồng bộ

| Nơi | Sửa gì |
|---|---|
| `TripController::index` | Thêm `->where('is_vip', false)` khi tài xế không phải VIP |
| `TripController::accept` | Truyền cờ VIP vào `VehicleCapacity::fits()`, trả 422 như hiện tại |
| `SendNewBookingBroadcastJob` | Cuốc VIP chỉ query tài xế `is_vip = true` |

`AvailableTripsCache` khoá theo danh sách `vehicleTypes`. Cuốc VIP và cuốc thường
cùng loại xe phải **không** dùng chung entry cache, nên cờ VIP phải nằm trong
khoá cache — nếu không, tài xế VIP mở app trước sẽ nạp cache có cuốc VIP, rồi tài
xế thường đọc trúng cache đó và thấy cuốc VIP.

## 3. Bảng giá

Khoá tra bảng đổi từ 3 chiều thành 4:
`(service_type, trip_type, vehicle_type, is_vip)`.

- `PriceConfigSeeder`: thêm **6 dòng** VIP — 3 loại xe × {airport, provincial}:

  | service_type | vehicle_type | price_type | min | max |
  |---|---|---|---|---|
  | airport | sedan_4 | range | 350.000 | 500.000 |
  | airport | suv_5 | range | 350.000 | 500.000 |
  | airport | mpv_7 | range | 450.000 | 600.000 |
  | provincial | sedan_4 | per_km | 16.000 | 16.000 |
  | provincial | suv_5 | per_km | 16.000 | 16.000 |
  | provincial | mpv_7 | per_km | 18.000 | 18.000 |

  Đây là số seed cho môi trường dev, không phải giá kinh doanh — admin đổi được
  ở trang Bảng giá.
- `PriceConfigController::store`: thêm `->where('is_vip', $request->boolean('is_vip'))`
  vào `Rule::unique`. **Thiếu dòng này thì dòng giá VIP bị coi là trùng dòng
  thường và không tạo được** — lỗi trả về sẽ là thông báo "Đã có bảng giá..."
  gây hiểu nhầm hoàn toàn.
- `PriceConfigController::store`/`update`: thêm `'is_vip' => 'sometimes|boolean'`.
- FE `findPriceConfig()` trong `BookingFormPage`: thêm tham số `isVip` vào bộ lọc.
  Hàm này là bộ lọc DUY NHẤT cho cả dải giá tham khảo lẫn giá auto-fill, nên chỉ
  sửa một chỗ là cả hai khớp nhau.

## 4. UI khách

Giữ ba chip số chỗ, thêm một công tắc VIP ngay dưới:

```
LOẠI XE
[ 🚗 4 chỗ ]  [ 🚗 5 chỗ ]  [ 🚐 7 chỗ ]

[ ⭐ VIP · Xe cá nhân, biển trắng          ○ ]
```

Không dùng 4 chip ngang hàng: chọn VIP rồi thì không còn chỗ chọn 4/5/7 chỗ nữa.

Bật/tắt công tắc chạy qua cùng đường với `handleVehicleChange()`: cập nhật state,
rồi tính lại giá auto-fill nếu đã có khoảng cách. Dải "Mức giá tham khảo" đổi
theo ngay vì nó đọc `activeConfig`.

`is_vip` gửi kèm trong payload `createBooking`.

### Bẫy khi lên production

`price_configs` trên production **đã có dữ liệu thật**. Migration chỉ thêm cột
`is_vip = false` cho các dòng cũ, **không sinh dòng VIP nào** — seeder chỉ chạy ở
dev. Nếu deploy mà chưa nhập giá VIP thì `findPriceConfig()` trả `undefined`,
`configPrice()` trả 0, và khách bật VIP sẽ thấy "Mức giá tham khảo: 0đ - 0đ" với
ô giá tự điền 0 — không có lỗi nào hiện ra.

Xử lý: sau khi deploy, admin nhập 6 dòng giá VIP ở trang Bảng giá **trước** khi
thông báo tính năng. Bước này nằm trong checklist deploy của plan.

## 5. Phía tài xế và admin

| Nơi | Sửa gì |
|---|---|
| `DriverRegisterPage` | Checkbox "Xe cá nhân (biển trắng)" |
| `AuthController::registerDriver` | Validate `is_vip` boolean, lưu vào profile |
| Admin `DriverController::update` | Thêm `is_vip` vào `$data` để admin sửa lúc duyệt |
| Admin danh sách tài xế | Nhãn VIP cạnh tên |
| Admin `PriceConfigPage` | Cột/ô chọn VIP trong form và trong bảng |
| Danh sách cuốc của tài xế | Nhãn ⭐ VIP trên thẻ cuốc |
| Trang chi tiết cuốc (khách + tài xế) | Nhãn ⭐ VIP |

Admin duyệt hồ sơ tài xế **chính là** bước xác nhận biển trắng. Không thêm luồng
duyệt riêng.

## 6. Cố ý KHÔNG làm

- **Báo cáo doanh thu không tách VIP.** `RevenueController` group theo
  `vehicle_type`; thêm chiều VIP làm biểu đồ thành 6 cột trong khi chưa có số
  thật để đọc. Thêm sau.
- **Không tự kiểm tra màu biển số.** Hệ thống chỉ lưu chuỗi biển, phân biệt
  trắng/vàng phải nhìn ảnh. Tin vào khai báo + admin duyệt.
- **Cuốc VIP không có phí app riêng.** Vẫn 20% như mọi cuốc.

## 7. Kiểm thử

| Test | Khẳng định |
|---|---|
| `VehicleCapacity::fits` với 4 tổ hợp VIP × sức chứa | Đúng bảng ở mục 2.2 |
| `TripController::index` — tài xế thường | Không thấy cuốc VIP |
| `TripController::index` — tài xế VIP | Thấy cả cuốc VIP lẫn cuốc thường |
| `TripController::accept` — tài xế thường nhận cuốc VIP | 422 |
| Parity SQL ↔ PHP (mở rộng test đang có) | Bộ lọc trong query khớp `fits()` |
| `AvailableTripsCache` | Tài xế VIP và tài xế thường không dùng chung entry |
| `PriceConfigController::store` | Tạo được dòng VIP khi đã tồn tại dòng thường cùng tổ hợp |
| `BookingController::store` | Lưu đúng `is_vip` |

Test chạy trên sqlite (`phpunit.xml`), nên tránh `withCount()+having()` và
`DATE_FORMAT` — dùng `whereHas(..., '<', n)` và hàm portable, như các bài học đã
ghi trong `CLAUDE.md`.

## 8. Phạm vi

**Backend — 14 file:**
3 migration · 3 model (`Booking`, `DriverProfile`, `PriceConfig` — thêm `is_vip`
vào `$fillable`) · 5 controller (`Driver/TripController`,
`Customer/BookingController`, `Auth/AuthController`, `Admin/DriverController`,
`Admin/PriceConfigController`) · `Support/VehicleCapacity` ·
`Jobs/SendNewBookingBroadcastJob` · `PriceConfigSeeder`.

**Frontend — 8 file:**
`types.d.ts` · `api/auth.ts` · `api/bookings.ts` (kiểu payload) ·
`pages/customer/BookingFormPage.tsx` · `pages/customer/BookingStatusPage.tsx` ·
`pages/DriverRegisterPage.tsx` · `pages/admin/PriceConfigPage.tsx` ·
`pages/admin/DriversPage.tsx` (+ nhãn VIP ở danh sách cuốc của tài xế).

Không đụng luồng ví, thanh toán, realtime.
