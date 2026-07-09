# Quy tắc nhận cuốc theo loại xe — Design Spec

**Date:** 2026-07-09
**Scope:** Tài xế chỉ được thấy và nhận các cuốc có `vehicle_type` yêu cầu ≤ dung tích xe của mình.

---

## Vấn đề

`bookings.vehicle_type` (enum `sedan_4`/`suv_5`/`mpv_7`, xem `2026_05_22_065913_add_vehicle_type_to_bookings_table.php`) ghi nhận loại xe khách yêu cầu khi đặt. `driver_profiles.vehicle_type` (cùng enum, bắt buộc chọn khi đăng ký — `AuthController::register`) ghi nhận loại xe tài xế đang chạy. Hiện `TripController::index()`/`accept()` không đối chiếu 2 giá trị này — tài xế xe `sedan_4` vẫn thấy và có thể nhận cuốc yêu cầu `mpv_7`, dẫn đến sai loại xe khi đón khách.

## Mục tiêu

- Xếp hạng dung tích: `sedan_4` (4 chỗ) < `suv_5` (5 chỗ) < `mpv_7` (7 chỗ).
- Tài xế chỉ thấy trong danh sách chờ nhận (`TripController::index()`) các cuốc có rank `vehicle_type` ≤ rank xe của mình. Cuốc không phù hợp bị **ẩn hoàn toàn**, không hiển thị mờ/disable.
- `TripController::accept()` chặn thêm 1 lớp nữa (422) nếu vì lý do nào đó tài xế vẫn gọi accept một booking không phù hợp (danh sách phía client cũ, gọi API trực tiếp) — theo đúng pattern trả lỗi đã có (check số dư ví, check giới hạn 3 cuốc).
- Tài xế chưa có `vehicle_type` (dữ liệu cũ/thiếu) hoặc giá trị không nằm trong enum: **không lọc** — vẫn thấy tất cả cuốc (permissive), tránh chặn nhầm dữ liệu cũ.

## Ngoài phạm vi

- Không đổi migration — cả 2 cột `vehicle_type` đã tồn tại.
- Không lọc `TripController::history()` — cuốc đã hoàn thành đã gắn `driver_id`, không cần đối chiếu lại.
- Không đổi frontend (`TripListPage.tsx`, `types.d.ts`) — vì cuốc không phù hợp bị lọc ở tầng API, danh sách trả về cho client vốn đã chỉ chứa cuốc phù hợp, không cần hiển thị thêm badge/lý do.
- Không đổi luồng đặt xe / chọn loại xe của khách hàng.

---

## 1. Bảng xếp hạng dung tích

Thêm 1 helper `private` trong `TripController` (hoặc constant nếu tái dùng nơi khác):

```php
private const VEHICLE_CAPACITY_RANK = [
    'sedan_4' => 4,
    'suv_5'   => 5,
    'mpv_7'   => 7,
];

private function fitsDriverVehicle(?string $bookingType, ?string $driverType): bool
{
    if (! $driverType || ! isset(self::VEHICLE_CAPACITY_RANK[$driverType])) {
        return true; // tài xế chưa rõ loại xe → không chặn
    }

    $bookingRank = self::VEHICLE_CAPACITY_RANK[$bookingType] ?? 0;
    $driverRank  = self::VEHICLE_CAPACITY_RANK[$driverType];

    return $bookingRank <= $driverRank;
}
```

## 2. Lọc trong `index()`

Sau khi lấy `$trips` (status=`finding_driver`), trước khi sort/format:

```php
$trips = $trips->filter(fn ($b) => $this->fitsDriverVehicle($b->vehicle_type, $profile?->vehicle_type))->values();
```

Đặt trước đoạn `if ($request->sort === 'nearest' ...)` hiện có (dòng ~31) để không ảnh hưởng logic sort.

## 3. Chặn thêm ở `accept()`

Thêm guard ngay sau check `status !== 'finding_driver'` (trước đoạn tính phí ví), theo đúng convention `response()->json(['message' => '...'], 422)` đã dùng cho check ví/giới hạn 3 cuốc:

```php
if (! $this->fitsDriverVehicle($booking->vehicle_type, $request->user()->driverProfile?->vehicle_type)) {
    return response()->json(['message' => 'Cuốc này cần xe lớn hơn, không phù hợp với xe của bạn.'], 422);
}
```

## 4. Kiểm thử

- Tài xế `vehicle_type=sedan_4`: danh sách chờ nhận không chứa cuốc `suv_5`/`mpv_7`, chỉ chứa `sedan_4`.
- Tài xế `vehicle_type=mpv_7`: thấy cả 3 loại.
- Tài xế `vehicle_type=null` (3 tài khoản seed cũ): thấy tất cả cuốc như hiện tại (không đổi hành vi).
- Gọi thẳng `POST /api/driver/trips/{id}/accept` cho 1 booking không phù hợp (bypass danh sách) → trả 422 với message rõ ràng, không trừ ví, không đổi trạng thái booking.
- `php artisan test` (nếu có test cho `TripController`) vẫn pass; viết thêm test cho 2 case trên nếu thư mục test đã có coverage cho controller này.
