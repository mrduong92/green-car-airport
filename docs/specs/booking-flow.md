# Đặc tả luồng đặt xe — Green Car Airport

> Phiên bản: 1.0 · Cập nhật: 2026-05-25

---

## 1. Tổng quan

Hệ thống gồm 3 actor:

| Actor | Vai trò |
|---|---|
| **Khách hàng** | Tạo booking, theo dõi trạng thái, huỷ chuyến |
| **Tài xế** | Nhận cuốc, cập nhật trạng thái chuyến thủ công |
| **Admin** | Quản lý tài xế, doanh thu, voucher |

---

## 2. Vòng đời booking — State Machine

```
[Khách đặt]
     │
     ▼
finding_driver ──── (tự huỷ sau 24h nếu không có tài xế)
     │
     │  Tài xế bấm "Nhận cuốc"
     ▼
  accepted       ← "Đang đón"     (tài xế đang đến điểm đón)
     │
     │  Tài xế bấm "Đã đón khách"
     ▼
 in_progress     ← "Đang di chuyển"  (khách đã lên xe)
     │
     │  Tài xế bấm "Hoàn thành chuyến"
     ▼
  completed      ← Terminal (tính điểm ví tài xế)

     Bất kỳ lúc nào (chỉ khi finding_driver):
     ─────────────────────────────────────────
  cancelled      ← Terminal (khách huỷ)
```

### Bảng trạng thái chi tiết

| Status DB | Nhãn khách hàng | Nhãn tài xế | Actor chuyển |
|---|---|---|---|
| `finding_driver` | Đang tìm tài xế | Cuốc đang chờ nhận | — |
| `accepted` | Tài xế đang đón | Đang đón | Tài xế |
| `in_progress` | Đang di chuyển | Đang di chuyển | Tài xế |
| `completed` | Hoàn thành | Hoàn thành | Tài xế |
| `cancelled` | Đã huỷ | — | Khách hàng |

> **Lưu ý:** Enum DB còn chứa `pending` và `picking_up` (legacy), không dùng trong flow hiện tại.

---

## 3. Luồng khách hàng

### 3.1 Tạo booking

**Endpoint:** `POST /api/bookings`

**Payload:**

```json
{
  "pickup":          "Số 1 Hàng Bài, Hoàn Kiếm, Hà Nội",
  "pickup_lat":      21.0285,
  "pickup_lng":      105.8542,
  "destination":     "Sân bay Nội Bài",
  "destination_lat": 21.2187,
  "destination_lng": 105.8037,
  "date":            "2026-06-01",
  "time":            "06:30",
  "vehicle_type":    "sedan_4",
  "distance_km":     35.2,
  "price":           250000,
  "voucher_code":    "AIRPORT50K"
}
```

**Validation:**
- `pickup`, `destination`: bắt buộc, string
- `pickup_lat/lng`, `destination_lat/lng`: tuỳ chọn, numeric
- `date`: `Y-m-d`
- `time`: `H:i`
- `vehicle_type`: một trong `sedan_4 | suv_5 | mpv_7`
- `distance_km`: số thực ≥ 0
- `price`: integer ≥ 0 (frontend tính sẵn dựa theo bảng giá)
- `voucher_code`: tuỳ chọn

**Xử lý voucher (trong store):**
1. Tìm voucher theo code: `is_active = true`, `expires_at >= today`, `usage_count < usage_limit`
2. Tính discount:
   - `fixed`: `discount = voucher.value`
   - `percent`: `discount = round(price * value / 100)`
3. Tăng `usage_count` của voucher
4. Lưu `voucher_id` và `discount` vào booking

**Response:** Booking object (201)

---

### 3.2 Theo dõi trạng thái

**Endpoint:** `GET /api/bookings/{id}`

- Frontend poll mỗi **5 giây** khi đang ở màn hình `/customer/booking/:id`
- Trả về booking kèm thông tin tài xế (nếu đã được nhận)

**Màn hình theo status:**

| Status | View hiển thị |
|---|---|
| `finding_driver` | Stepper progress (bước 2 active, spinning) |
| `accepted` | Active view — gradient indigo, progress bar 50%, icon directions_car |
| `in_progress` | Active view — gradient emerald, progress bar 100%, icon route |
| `completed` | Stepper (tất cả bước done ✓) + nút "Đặt xe mới" |
| `cancelled` | Stepper (trạng thái cancelled) |

**Stepper 5 bước (hiển thị cho khách):**
1. Đã đặt xe
2. Đang tìm tài xế
3. Tài xế đang đón
4. Đang di chuyển
5. Hoàn thành

---

### 3.3 Cuốc đang hoạt động (banner)

**Endpoint:** `GET /api/bookings/active`

- Trả về booking đầu tiên có status trong `[finding_driver, accepted, picking_up, in_progress]`
- Hiển thị banner trên màn hình đặt xe, poll mỗi **15 giây**
- Màu banner:
  - `finding_driver` → amber `#F59E0B`
  - `accepted` → indigo `#1E3A8A`
  - `in_progress` → emerald `#059669`

---

### 3.4 Huỷ chuyến

**Endpoint:** `PATCH /api/bookings/{id}/cancel`

**Điều kiện cho phép huỷ:**
- Status phải là `pending` hoặc `finding_driver`
- Giao diện cho phép huỷ trong vòng **60 phút** kể từ lúc đặt

**Chính sách phí huỷ (hiển thị trong Quy định):**
- Miễn phí nếu huỷ trong vòng **1 giờ** sau khi đặt
- Phạt **50.000 đ** nếu huỷ sau 1 giờ (áp dụng cho chuyến tiếp theo)
- Chuyến tự động huỷ sau **24 giờ** nếu không có tài xế nhận

> **Lưu ý implementation:** Logic phạt và tự động huỷ chưa được enforce ở backend — chỉ hiển thị trong Quy định đặt xe.

---

## 4. Luồng tài xế

### 4.1 Xem danh sách cuốc

**Endpoint:** `GET /api/driver/trips?sort=newest|nearest`

- Trả về tất cả booking có `status = finding_driver`
- `sort=nearest`: sắp xếp theo khoảng cách từ vị trí tài xế (Haversine)
- Frontend poll mỗi **15 giây** (chỉ khi online và chưa đạt tối đa 3 cuốc)
- Mỗi cuốc hiển thị: `is_new` (tạo trong 30 phút qua), `distance_to_driver`, phân tích giá

### 4.2 Nhận cuốc

**Endpoint:** `POST /api/driver/trips/{id}/accept`

**Guard:**
1. Booking phải có `status = finding_driver`
2. Tài xế không được có quá **3 cuốc đang thực hiện** (`accepted` + `in_progress`)

**Khi nhận thành công:**
- Booking: `status → accepted`, `driver_id = driver.id`
- Frontend: dùng `setQueryData` để cập nhật cache `['my-trips']` ngay lập tức trước khi navigate → không bị spinner khi vào màn chi tiết

**Response:** Trip object

---

### 4.3 Cập nhật trạng thái (thủ công)

**Endpoint:** `PATCH /api/driver/trips/{id}/status`

**Payload:** `{ "status": "in_progress" | "completed" }`

**Bảng chuyển trạng thái hợp lệ:**

| Trạng thái hiện tại | Trạng thái tiếp theo | Nút tài xế bấm |
|---|---|---|
| `accepted` | `in_progress` | "Đã đón khách" |
| `in_progress` | `completed` | "Hoàn thành chuyến" |

**Validation:** Backend kiểm tra cả chiều đi (current → expected next) lẫn giá trị requested. Chuyển sai chiều trả về `422`.

**Khi hoàn thành (`completed`):**
1. Gọi `creditEarning()` → tính điểm và tạo `WalletTransaction`
2. Tăng `driver_profiles.trips_count` thêm 1

---

### 4.4 Cuốc đang thực hiện

**Endpoint:** `GET /api/driver/trips/mine`

- Trả về tất cả booking của tài xế có status `accepted` hoặc `in_progress`
- Frontend poll mỗi **10 giây**
- Hiển thị tối đa 3 card trên màn hình danh sách cuốc (mỗi card có badge trạng thái và nút "Hoàn thành →")

---

### 4.5 Lịch sử chuyến

**Endpoint:** `GET /api/driver/trips/history`

- Trả về tất cả booking `status = completed` của tài xế
- Hiển thị theo nhóm ngày, có tổng thu nhập mỗi ngày

---

## 5. Bảng giá

Giá được admin cấu hình qua `price_configs`, frontend lấy qua `GET /api/price-configs`.

### 5.1 Xe sân bay (`service_type = airport`)

Detect tự động bằng keyword: `sân bay`, `nội bài`, `noi bai`, `airport`, `terminal`

| Loại xe | Giá khoảng |
|---|---|
| 4 chỗ (`sedan_4`) | 200.000 – 300.000 đ |
| 5 chỗ (`suv_5`) | 200.000 – 300.000 đ |
| 7 chỗ (`mpv_7`) | 250.000 – 350.000 đ |

- `price_type = range`: frontend hiển thị khoảng giá, khách chọn giá cụ thể hoặc hệ thống lấy `min_price`

### 5.2 Xe đi tỉnh (`service_type = provincial`)

| Loại xe | Đơn giá |
|---|---|
| 4 chỗ (`sedan_4`) | 10.000 đ/km |
| 5 chỗ (`suv_5`) | 10.000 đ/km |
| 7 chỗ (`mpv_7`) | 12.000 đ/km |

- `price_type = per_km`: `price = distance_km × min_price`
- Khoảng cách tính bằng Goong Distance Matrix API

---

## 6. Voucher

### 6.1 Loại voucher

| Trường `type` | Cách tính discount |
|---|---|
| `fixed` | `discount = voucher.value` (VND cố định) |
| `percent` | `discount = round(price × value / 100)` |

### 6.2 Điều kiện áp dụng

Voucher hợp lệ khi thoả **đồng thời** tất cả:
- `is_active = true`
- `expires_at >= ngày hôm nay`
- `usage_count < usage_limit` (hoặc `usage_limit = null` = không giới hạn)

### 6.3 Ví dụ seed

| Code | Loại | Giá trị | Giới hạn |
|---|---|---|---|
| `AIRPORT50K` | fixed | 50.000 đ | 100 lần |
| `NEWUSER10` | percent | 10% | 50 lần |

---

## 7. Tính phí & ví điểm tài xế

Khi booking chuyển sang `completed`:

```
app_fee   = round(price × 20%)
net_earn  = price - app_fee
net_pts   = round(net_earn / 1_000)   ← 1 điểm = 1.000 đ
```

**Ví dụ:** `price = 250.000 đ`
- App fee = 50.000 đ (20%)
- Tài xế nhận = 200.000 đ (80%) → **200 điểm**

**Giao dịch được ghi nhận:**
```
wallet_transactions.type        = 'credit'
wallet_transactions.description = "Hoàn thành chuyến #<id>"
wallet_transactions.points      = net_pts
```

---

## 8. API Endpoints

### Khách hàng (`role:customer`)

| Method | Path | Mô tả |
|---|---|---|
| `POST` | `/api/bookings` | Tạo booking mới |
| `GET` | `/api/bookings` | Lịch sử booking |
| `GET` | `/api/bookings/active` | Cuốc đang hoạt động |
| `GET` | `/api/bookings/{id}` | Chi tiết booking |
| `PATCH` | `/api/bookings/{id}/cancel` | Huỷ booking |
| `POST` | `/api/vouchers/apply` | Kiểm tra & áp dụng voucher |
| `GET` | `/api/price-configs` | Lấy bảng giá (public) |

### Tài xế (`role:driver`)

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/api/driver/trips` | Danh sách cuốc đang chờ |
| `GET` | `/api/driver/trips/mine` | Cuốc đang thực hiện |
| `GET` | `/api/driver/trips/history` | Lịch sử cuốc đã hoàn thành |
| `POST` | `/api/driver/trips/{id}/accept` | Nhận cuốc |
| `PATCH` | `/api/driver/trips/{id}/status` | Cập nhật trạng thái |

---

## 9. Ràng buộc nghiệp vụ

| # | Ràng buộc | Enforce tại |
|---|---|---|
| B1 | Mỗi tài xế tối đa **3 cuốc** đồng thời (`accepted + in_progress`) | Backend `accept()` |
| B2 | Chỉ huỷ được khi status là `finding_driver` hoặc `pending` | Backend `cancel()` |
| B3 | Chuyển trạng thái chỉ theo chiều: `accepted → in_progress → completed` | Backend `updateStatus()` |
| B4 | Tài xế chỉ cập nhật được cuốc của chính mình | Backend — kiểm tra `driver_id` |
| B5 | Tài xế phải ở trạng thái `active` (đã duyệt) mới nhận cuốc | Middleware `role:driver` + admin approve |
| B6 | Giá `price` được tính ở frontend, backend chỉ lưu và không tính lại | `BookingController::store()` |
| B7 | Voucher chỉ áp dụng 1 lần mỗi booking, tăng `usage_count` ngay khi tạo | `BookingController::store()` |
| B8 | Điểm ví chỉ được credit sau khi booking `completed` | `TripController::creditEarning()` |

---

## 10. Polling & Đồng bộ trạng thái

| Frontend | Endpoint | Tần suất | Điều kiện |
|---|---|---|---|
| `BookingStatusPage` | `GET /bookings/{id}` | **5s** | Luôn luôn (khi đang xem) |
| `BookingFormPage` (banner) | `GET /bookings/active` | **15s** | Luôn luôn |
| `TripListPage` (available) | `GET /driver/trips` | **15s** | Online và chưa đủ 3 cuốc |
| `TripListPage` (mine) | `GET /driver/trips/mine` | **10s** | Luôn luôn |

Khi tài xế nhận cuốc thành công: frontend dùng `queryClient.setQueryData(['my-trips'], ...)` để cập nhật cache đồng bộ ngay — không phụ thuộc vào vòng poll tiếp theo.
