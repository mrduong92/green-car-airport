# Chuẩn hóa số điện thoại — Design Spec

Ngày: 2026-07-05

## Vấn đề

Số điện thoại hiện đang bị coi là 2 tài khoản khác nhau nếu nhập ở 2 dạng khác nhau, ví dụ `0868968312` (có số 0 đầu) và `868968312` (không có số 0 đầu).

**Root cause:** không có bất kỳ bước chuẩn hóa nào đối với số điện thoại trước khi query/lưu DB. `OtpController` và `AuthController` dùng thẳng `$request->phone` cho mọi `where()`/`create()`. Tầng gửi OTP qua Zalo (`ZaloZnsService::toInternational()`, `SouthTelecomZnsService::toInternational()`) đã tự làm `'84' . ltrim($phone, '0')` — ngầm giả định số lưu trong DB luôn ở dạng nội địa có số 0 đầu, khớp với toàn bộ seed data hiện tại (`0901234567`, `0912345678`, ...), nhưng không có gì enforce điều đó ở input.

## Phạm vi

- Chỉ sửa backend (Laravel). Không sửa frontend — số nhập sai định dạng sẽ được chuẩn hóa ngay khi vào backend, đủ để giải quyết triệt để bug 2-số-thành-2-tài-khoản.
- Không cần migrate dữ liệu cũ — vấn đề mới chỉ là rủi ro trên môi trường dev/seed, chưa có data thật bị lưu sai.
- Không thêm validation chặt (regex đầu số di động VN). Chỉ chuẩn hóa định dạng, giữ nguyên mức validation hiện tại (`required|string|max:20`).

## Định dạng chuẩn

Số điện thoại nội địa Việt Nam có số 0 đầu, 10 chữ số. Ví dụ: `0868968312`. Đây là format khớp với toàn bộ seed data và giả định sẵn có trong `ZnsSender`.

## Thuật toán normalize

Hàm thuần PHP, không phụ thuộc framework:

1. Bỏ hết ký tự không phải chữ số (`preg_replace('/\D/', '', $phone)`).
2. Nếu chuỗi kết quả dài 11 ký tự và bắt đầu bằng `84` → thay `84` đầu bằng `0` (xử lý cả `+84` lẫn `84` không dấu `+`, vì dấu `+` đã bị bỏ ở bước 1).
3. Nếu chưa bắt đầu bằng `0` → thêm `0` vào đầu.
4. Nếu đã bắt đầu bằng `0` → giữ nguyên.

Ví dụ:

| Input | Output |
|---|---|
| `0868968312` | `0868968312` |
| `868968312` | `0868968312` |
| `84868968312` | `0868968312` |
| `+84 86 896 8312` | `0868968312` |
| `0846123456` (số thật bắt đầu `08`, không phải mã `84`) | `0846123456` (không đổi — điều kiện ở bước 2 chỉ khớp khi tổng độ dài là 11) |

## Vị trí implement

**Helper mới:** `backend/app/Support/PhoneNumber.php`

```php
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

**Gọi ngay sau `$request->validate()`, trước khi dùng số điện thoại để query/tạo/so sánh**, tại các method sau:

- `App\Http\Controllers\Auth\OtpController::send()` — dùng cho check tồn tại, `Otp::where(...)->delete()`, `Otp::create()`, `$this->zns->send()`, và các log.
- `OtpController::verify()` — dùng cho `Otp::where()` và `User::firstOrCreate()`.
- `App\Http\Controllers\Auth\AuthController::checkPhone()` — dùng cho `User::where()`.
- `AuthController::login()` — dùng cho `User::where()`.
- `AuthController::register()` — dùng cho check tồn tại, `consumeOtp()`, `User::create()`.
- `AuthController::registerDriver()` — dùng cho check tồn tại, `User::create()`.
- `AuthController::resetPassword()` — dùng cho `User::where()`, `consumeOtp()`.

**Không đổi:** tìm kiếm admin (`Admin\CustomerController`, `Admin\DriverController` dùng `where('phone', 'like', $s)`) — đây là ô tìm kiếm tự do (partial match), không phải so khớp chính xác, nên không cần normalize.

## Testing

1. **Unit test** cho `PhoneNumber::normalize()` — bao quát các case trong bảng ví dụ ở trên (có/không số 0 đầu, có/không `+84`/`84`, có khoảng trắng/ký tự lạ).
2. **Feature test** tích hợp: đăng ký bằng số không có số 0 đầu (vd `901234599`), sau đó `checkPhone`/`login` bằng số có số 0 đầu (`0901234599`) — phải nhận ra cùng một tài khoản (và ngược lại).

## Ngoài phạm vi (out of scope)

- Data migration cho số đã lưu sai định dạng trong DB thật.
- Sửa frontend (`PhoneInput`, `RegisterPage`, `DriverRegisterPage`, `api/auth.ts`).
- Validation chặt định dạng số di động VN (đầu số 03/05/07/08/09).
