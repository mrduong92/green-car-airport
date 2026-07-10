# Refactor CollaboratorWalletController filter — Design Spec

**Date:** 2026-07-10
**Scope:** Thay cách `CollaboratorWalletController` xác định giao dịch của cộng tác viên (CTV), từ so khớp chuỗi `description` sang dùng quan hệ FK có sẵn.

---

## Vấn đề

`backend/app/Http/Controllers/Customer/CollaboratorWalletController.php` (`show()`, `transactions()`) lọc giao dịch ví của CTV bằng:

```php
->where('type', 'credit')->where('description', 'like', 'Thu hộ cuốc%')   // thu nhập CTV
->where('type', 'debit')->where('description', 'like', 'Admin %')         // admin điều chỉnh
```

`wallet_transactions` chỉ có cột `type` (enum credit/debit/topup/referral) và `description` (chuỗi tự do hiển thị cho người dùng) — không có cột phân loại nghiệp vụ. Vì một `Wallet` gắn với 1 `user_id`, và user đó có thể vừa là tài xế vừa là CTV, cùng 1 ví có thể chứa giao dịch của cả 2 vai trò. Việc dùng `description LIKE` để tách "giao dịch của CTV" ra khỏi "giao dịch của tài xế" là fragile: chỉ cần đổi câu chữ mô tả (dịch lại, thêm chi tiết, đổi định dạng) là filter sai âm thầm, không có lỗi nào báo.

## Dữ liệu đã có, không cần schema mới

Khảo sát toàn bộ nơi tạo `WalletTransaction::create()` (10 điểm, gồm `TripController`, `AdminWalletController`, `ReferralService`, `SepayWebhookService`, `BookingController`) cho thấy:

- Giao dịch "Thu hộ cuốc" (credit vào ví CTV) luôn được tạo với `booking_id` trỏ tới 1 `Booking` có `collaborator_id === wallet.user_id` (xem `TripController::updateStatus()`, đoạn xử lý `collection_fee > 0 && collaborator_id`).
- 2 endpoint admin điều chỉnh điểm CTV (`AdminWalletController::deductPoints()`, `::resetPoints()`) luôn tạo giao dịch với `'booking_id' => null` một cách tường minh.
- Mọi giao dịch debit khác (phí app 20%, phụ phí huỷ, thu hộ) đều gắn với 1 booking cụ thể → luôn có `booking_id` khác null.

Tức là quan hệ FK đã sẵn có đủ thông tin để thay thế hoàn toàn việc so khớp chuỗi, không cần thêm cột hay migration.

## Giải pháp

### 1. Thêm relationship `booking()` vào `WalletTransaction`

`backend/app/Models/WalletTransaction.php` hiện chỉ có `wallet()`. Thêm:

```php
public function booking() { return $this->belongsTo(Booking::class); }
```

### 2. Lọc thu nhập CTV (credit) bằng quan hệ collaborator

Thay:
```php
->where('type', 'credit')->where('description', 'like', 'Thu hộ cuốc%')
```
bằng:
```php
->where('type', 'credit')->whereHas('booking', fn ($q) => $q->where('collaborator_id', $user->id))
```

Đúng bản chất nghiệp vụ: giao dịch credit này luôn phát sinh từ 1 booking mà `collaborator_id` chính là user đang xem ví — không phụ thuộc vào câu chữ mô tả.

### 3. Lọc admin điều chỉnh (debit) bằng `booking_id IS NULL`

Thay:
```php
->where('type', 'debit')->where('description', 'like', 'Admin %')
```
bằng:
```php
->where('type', 'debit')->whereNull('booking_id')
```

Mọi giao dịch debit gắn với hoạt động cuốc xe (phí app, phụ phí, thu hộ) đều có `booking_id`; chỉ có debit do admin thao tác thủ công mới `booking_id = null`. Đây là tín hiệu đã tồn tại sẵn trong dữ liệu, không cần thêm gì.

### 4. Áp dụng cho cả 2 method

- `show()`: `total_earned` = sum theo điều kiện #2.
- `transactions()`: giữ nguyên cấu trúc `where(fn ($q) => $q->where(...)->orWhere(...))`, chỉ thay 2 điều kiện con theo #2 và #3.

## Ngoài phạm vi

- Không đổi schema/migration của `wallet_transactions`.
- Không đổi các nơi tạo `WalletTransaction` (`TripController`, `AdminWalletController`, `ReferralService`, `SepayWebhookService`, `BookingController`) — chỉ đổi cách `CollaboratorWalletController` đọc lại dữ liệu đã có.
- Không đổi response shape của `show()`/`transactions()` — cùng field, cùng ý nghĩa, chỉ đổi cách truy vấn.

## Ảnh hưởng tới test hiện có

`backend/tests/Feature/CollaboratorWalletTest.php` hiện tạo `WalletTransaction::create([...])` trực tiếp bằng tay, không thông qua một `Booking` thật:

- Case dương (`'Thu hộ cuốc #1'`, type credit) cần sửa để tạo kèm 1 `Booking` thật có `collaborator_id` = user đang test, và set `booking_id` của `WalletTransaction` trỏ đúng tới booking đó — nếu không, `whereHas('booking', ...)` sẽ không match và test đỏ.
- 2 case admin (`'Admin trừ điểm: ...'`, `'Admin xóa toàn bộ điểm: ...'`) vẫn đúng vì đã tạo với `booking_id: null` sẵn (không cần đổi, chỉ cần xác nhận fixture giữ `booking_id` null).
- Case âm (`'Unrelated system debit'`, type debit, kỳ vọng KHÔNG xuất hiện) phải sửa để có `booking_id` khác null (ví dụ gắn với 1 booking không liên quan) — nếu không, dưới logic mới nó sẽ bị tính nhầm là "admin điều chỉnh" (vì `booking_id null` giờ nghĩa là admin) và test sẽ fail vì xuất hiện nhầm.

Việc sửa các fixture này sẽ được liệt kê thành task cụ thể trong implementation plan.
