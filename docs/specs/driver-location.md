# Spec: Tài xế bật định vị + Sort khoảng cách

**Trạng thái:** Phase 1 (sort khoảng cách) đã triển khai. Phase 2 (bản đồ tương tác Goong) chưa làm.

---

## Mục tiêu

Khi tài xế bật online, hệ thống lấy vị trí GPS và lưu vào DB. Danh sách cuốc có thể sort theo khoảng cách Haversine từ tài xế đến điểm đón, thay vì chỉ sort theo thời gian.

---

## DB Schema — Thay đổi

### `driver_profiles`
```sql
latitude   DECIMAL(10,7) NULL   -- vị trí tài xế (cập nhật khi bật online)
longitude  DECIMAL(10,7) NULL
```

### `bookings`
```sql
pickup_lat       DECIMAL(10,7) NULL   -- tọa độ điểm đón
pickup_lng       DECIMAL(10,7) NULL
destination_lat  DECIMAL(10,7) NULL   -- tọa độ điểm đến
destination_lng  DECIMAL(10,7) NULL
```

---

## API

### `PATCH /api/driver/status`
**Payload mới:**
```json
{
  "is_online": true,
  "latitude": 21.028511,
  "longitude": 105.804817
}
```
- `latitude` / `longitude` là nullable — nếu browser từ chối quyền vị trí, chỉ gửi `is_online`.
- Backend lưu vào `driver_profiles.latitude/longitude`.

### `GET /api/driver/trips?sort=nearest`
- Khi `sort=nearest` và driver có `latitude/longitude`: sort Haversine (gần → xa).
- Response thêm trường `distance_to_driver` (km, làm tròn 1 chữ số thập phân).
- Nếu booking không có `pickup_lat/lng`: distance = `PHP_FLOAT_MAX` → xuất hiện cuối danh sách.

### `POST /api/bookings`
**Payload mới (nullable):**
```json
{
  "pickup_lat": 21.033,
  "pickup_lng": 105.849,
  "destination_lat": 21.221,
  "destination_lng": 105.806
}
```
- FE đã có lat/lng từ `goongPlaceDetail()` → truyền lên khi tạo booking.

---

## Frontend

### TripListPage
- Bật online → `navigator.geolocation.getCurrentPosition()` → gửi lat/lng lên `PATCH /status`.
- Nếu browser từ chối quyền: vẫn bật online, không có vị trí, hiển thị note nhỏ.
- Sort "Gần nhất" → truyền `?sort=nearest` vào query.
- Badge `~X.X km tới điểm đón` hiển thị trên card khi `trip.distance_to_driver` có giá trị.

### BookingFormPage
- `createBooking()` payload thêm `pickup_lat`, `pickup_lng`, `destination_lat`, `destination_lng`.
- Giá trị lấy từ `goongPlaceDetail()` khi user chọn địa điểm.

---

## Phase 2: Bản đồ tương tác Goong (chưa làm)

### Use cases

| Use case | Mô tả |
|---|---|
| Xem cuốc quanh mình | Tài xế thấy vị trí mình (xanh lá) + pin từng cuốc trên bản đồ. Dễ chọn cuốc theo hướng di chuyển thực tế. |
| Hướng quan trọng hơn khoảng cách | Cuốc 2km ngược chiều giờ cao điểm có thể mất 20 phút thêm. Map cho tài xế thấy ngay hướng. |
| Tap pin → nhận cuốc nhanh | Bottom sheet: điểm đón → đến, khoảng cách, giá, nút "NHẬN CUỐC". |
| Khu vực sân bay | Nhiều cuốc cùng Nội Bài nhưng khác terminal. Map phân biệt pin gần hơn. |
| Giờ thấp điểm / zoom ra | Ít cuốc → zoom out thấy cuốc xa hơn. |
| Toggle List / Map | Tài xế tự chọn chế độ tuỳ thời điểm. |

### Files cần làm (Phase 2)
- Install `@goongmaps/goong-js`
- `src/components/driver/TripMap.tsx`: map container, driver marker, trip pins, bottom sheet
- `src/pages/driver/TripListPage.tsx`: toggle List/Map, truyền `driverPosition` + `trips` vào TripMap
