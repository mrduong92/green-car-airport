# Spec: Bảng giá tham khảo

**Trạng thái:** Phase 1 (1 chiều) đã triển khai. Phase 2 (2 chiều) chưa làm.

---

## Mục tiêu

Admin quản lý bảng giá tham khảo để hệ thống auto-suggest giá cho khách hàng khi đặt xe, thay vì dùng rate hardcode trong FE.

---

## DB Schema — Bảng `price_configs`

| Column       | Type                                      | Ghi chú |
|---|---|---|
| id           | bigint PK                                 | |
| service_type | enum('airport', 'provincial')             | xe sân bay \| xe đi tỉnh |
| trip_type    | enum('one_way', 'round_trip')             | mặc định 'one_way' — giữ để mở rộng sau |
| vehicle_type | enum('sedan_4', 'suv_5', 'mpv_7')        | |
| price_type   | enum('range', 'per_km')                   | range = số tiền tuyệt đối; per_km = VND/km |
| min_price    | unsignedInteger                           | VND hoặc VND/km |
| max_price    | unsignedInteger                           | VND hoặc VND/km (≥ min_price) |
| is_active    | boolean default true                      | |
| sort_order   | unsignedSmallInteger default 0            | |

---

## Seed Data mặc định (Phase 1)

| service_type | vehicle_type | price_type | min_price | max_price |
|---|---|---|---|---|
| airport    | sedan_4      | range      | 200,000   | 300,000   |
| airport    | suv_5        | range      | 200,000   | 300,000   |
| airport    | mpv_7        | range      | 250,000   | 350,000   |
| provincial | sedan_4      | per_km     | 10,000    | 10,000    |
| provincial | suv_5        | per_km     | 10,000    | 10,000    |
| provincial | mpv_7        | per_km     | 12,000    | 12,000    |

---

## API Endpoints

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| GET | `/api/price-configs` | Public | Lấy danh sách active (dùng cho booking form) |
| GET | `/api/admin/price-configs` | Admin | Lấy tất cả (kể cả inactive) |
| POST | `/api/admin/price-configs` | Admin | Tạo mới |
| PUT | `/api/admin/price-configs/{id}` | Admin | Cập nhật |
| DELETE | `/api/admin/price-configs/{id}` | Admin | Ẩn (set is_active=false) |

---

## Logic tính giá trong BookingFormPage

**Detect service_type từ địa điểm:**
- Keywords: "sân bay", "nội bài", "noi bai", "airport", "terminal"
- Nếu pickup hoặc destination chứa keyword → `airport`, còn lại → `provincial`

**Tìm config:**
```
config = price_configs.find(c =>
  c.trip_type === 'one_way' &&
  c.vehicle_type === vehicleType &&
  c.service_type === detectedService &&
  c.is_active
)
```

**Tính khoảng giá:**
- `price_type = 'range'`: suggestedMin = min_price, suggestedMax = max_price
- `price_type = 'per_km'`: suggestedMin = min_price × distance, suggestedMax = max_price × distance
- Auto-fill giá = round((suggestedMin + suggestedMax) / 2, 1000)

---

## Files thay đổi (Phase 1)

**Backend:**
- `database/migrations/2026_05_23_100000_create_price_configs_table.php`
- `app/Models/PriceConfig.php`
- `app/Http/Controllers/Admin/PriceConfigController.php`
- `app/Http/Controllers/PriceConfigController.php` (public)
- `database/seeders/PriceConfigSeeder.php`
- `routes/api.php` — thêm public + admin routes

**Frontend:**
- `src/types.d.ts` — thêm `App.PriceConfig`
- `src/api/priceConfig.ts` — API client
- `src/pages/admin/PriceConfigPage.tsx` — CRUD admin UI
- `src/pages/customer/BookingFormPage.tsx` — fetch API, detect service_type, thay hardcode
- `src/router/index.tsx` — route `/admin/prices`
- `src/layouts/AdminLayout.tsx` — nav "Bảng giá"

---

## Phase 2 — Booking 2 chiều (chưa làm)

### Spec giá 2 chiều

| service_type | vehicle_type | price_type | min_price | max_price |
|---|---|---|---|---|
| airport    | sedan_4      | range      | 450,000   | 450,000   |
| airport    | suv_5        | range      | 450,000   | 450,000   |
| airport    | mpv_7        | range      | 500,000   | 500,000   |
| provincial | sedan_4      | per_km     | 8,000     | 8,000     |
| provincial | suv_5        | per_km     | 8,000     | 8,000     |
| provincial | mpv_7        | per_km     | 10,000    | 10,000    |

### Rule 2 chiều

- **Free wait:** 2 giờ chờ giữa 2 chiều trong ngày
- **Khung giờ:** 6h–23h
- **Điểm thưởng tài xế:** +30 điểm khi hoàn thành chuyến 2 chiều

### Các trường cần thêm vào `price_configs` cho Phase 2

```sql
free_wait_hours  TINYINT UNSIGNED DEFAULT 0   -- giờ chờ miễn phí
apply_from       TIME NULL                    -- 06:00
apply_until      TIME NULL                    -- 23:00
bonus_points     INT UNSIGNED DEFAULT 0       -- điểm thưởng tài xế
```

### Các trường cần thêm vào `bookings` cho Phase 2

```sql
trip_type    ENUM('one_way', 'round_trip') DEFAULT 'one_way'
return_date  DATE NULL
return_time  TIME NULL
```

### Thiết kế UX 2 chiều (đề xuất)

- **Model:** 1 booking = 1 chuyến 2 chiều (single booking model)
  - Đơn giản hơn 2 booking riêng
  - Tài xế nhận 1 booking, thấy luôn cả chiều về
  - Dễ enforce rule 2h chờ
- **BookingFormPage:** Toggle "1 chiều / 2 chiều" sau vehicle selector
- **Khi chọn 2 chiều:** hiện thêm date/time picker cho chiều về
- **TripDetailPage:** badge "2 chiều" + thông tin chiều về + "Chờ tối đa 2 giờ miễn phí"
