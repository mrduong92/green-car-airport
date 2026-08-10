# Thiết kế: Hiển thị #ID và loại xe của tài xế ở trang Admin

## Vấn đề

Trang Admin > Danh sách tài xế (`DriversPage.tsx`) không hiển thị:
1. **ID của tài xế** — nên khi tài xế nạp tiền/liên hệ báo ID, admin không biết đối chiếu với ai để cộng điểm thủ công.
2. **Loại xe đã đăng ký** (4/5/7 chỗ) — admin không biết xe tài xế thuộc loại nào để quản lý điều phối.

Dữ liệu loại xe (`vehicle_type`: `sedan_4`/`suv_5`/`mpv_7`) đã được thu thập lúc tài xế đăng ký (`DriverRegisterPage.tsx`) và lưu ở `driver_profiles.vehicle_type`, nhưng API admin (`DriverController::formatDriver()`) chưa trả field này về frontend.

## Phạm vi

Chỉ hiển thị (read-only). Không cho admin sửa loại xe qua edit form trong lần này.

## Thay đổi

### Backend
- `app/Http/Controllers/Admin/DriverController.php` — thêm `'vehicle_type' => $u->driverProfile->vehicle_type` vào mảng trả về của `formatDriver()`.

### Frontend
- `src/types.d.ts` — thêm `vehicle_type?: App.VehicleType` vào `App.DriverProfile`.
- `src/pages/admin/DriversPage.tsx`:
  - Hiển thị `#{d.id}` cạnh tên/số điện thoại tài xế trong card.
  - Hiển thị nhãn loại xe (map `sedan_4` → "Sedan 4 chỗ", `suv_5` → "SUV 5 chỗ", `mpv_7` → "MPV 7 chỗ" — dùng chung cách label như `DriverRegisterPage.tsx`/`RevenueController.php`) trong dòng thông tin xe, cạnh biển số/màu xe. Nếu `vehicle_type` là `null` (tài xế cũ đăng ký trước khi có field này) thì không hiển thị badge loại xe.

## Ngoài phạm vi
- Không thêm field `vehicle_type` vào edit form của admin.
- Không thay đổi logic điều phối chuyến (`TripController`/`VehicleCapacity`).
