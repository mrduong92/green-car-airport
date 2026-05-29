# Chính sách Xác thực (Auth)

## Tổng quan

Hệ thống dùng **OTP một lần duy nhất khi đăng ký** để xác minh số điện thoại thật. Sau đó mọi lần đăng nhập dùng **mật khẩu 6 chữ số** — không tốn OTP. Quên mật khẩu vẫn cần OTP để xác minh danh tính trước khi đặt lại.

> **Nguyên tắc:** Số điện thoại = identity. OTP chỉ dùng để xác nhận "số điện thoại này là thật" — chỉ cần làm một lần khi đăng ký và khi reset. Đăng nhập hàng ngày dùng mật khẩu để tiết kiệm chi phí SMS.

---

## Các flow xác thực

### Flow 1 — Đăng nhập (existing user)
```
Nhập số điện thoại
    ↓
Nhập mật khẩu 6 chữ số
    ↓
POST /api/auth/login → { user, token }
    ↓
Vào app
```

### Flow 2 — Đăng ký (new user)
```
Nhập số điện thoại → bấm "Đăng ký tài khoản mới"
    ↓
POST /api/auth/otp/send → gửi OTP đến SĐT
    ↓
Nhập OTP 6 chữ số
    ↓
Đặt mật khẩu 6 chữ số
    ↓
POST /api/auth/register → tạo tài khoản + { user, token }
    ↓
Vào app
```

### Flow 3 — Quên mật khẩu
```
Bấm "Quên mật khẩu?" trên màn hình mật khẩu
    ↓
POST /api/auth/otp/send → gửi OTP đến SĐT
    ↓
Nhập OTP 6 chữ số
    ↓
Đặt mật khẩu mới 6 chữ số
    ↓
POST /api/auth/reset-password → { user, token }
    ↓
Vào app
```

### Edge case — Tài khoản cũ chưa có mật khẩu
```
Login → POST /api/auth/login trả 422 { code: 'no_password' }
    ↓
Frontend tự động chuyển sang Flow 3 (reset)
    ↓
Toast: "Tài khoản chưa có mật khẩu. Vui lòng đặt lại mật khẩu."
```

---

## API Endpoints

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| POST | `/api/auth/otp/send` | public | Gửi OTP đến số điện thoại |
| POST | `/api/auth/login` | public | Đăng nhập bằng mật khẩu |
| POST | `/api/auth/register` | public | Đăng ký: OTP + đặt mật khẩu |
| POST | `/api/auth/reset-password` | public | Đặt lại mật khẩu: OTP + mật khẩu mới |
| GET | `/api/auth/me` | sanctum | Lấy thông tin user hiện tại |
| POST | `/api/auth/logout` | sanctum | Thu hồi token |

### Request / Response

**POST /api/auth/login**
```json
Request:  { "phone": "0912345678", "password": "123456" }
Response: { "user": { "id", "name", "phone", "role" }, "token": "..." }
Error:    { "message": "Mật khẩu không đúng." }           // 422
          { "message": "...", "code": "no_password" }      // 422 — chưa có mật khẩu
          { "message": "Số điện thoại chưa đăng ký." }    // 422
```

**POST /api/auth/register**
```json
Request:  { "phone": "0912345678", "otp": "123456", "password": "654321" }
Response: { "user": {...}, "token": "..." }
Error:    { "message": "Mã OTP không hợp lệ hoặc đã hết hạn." }  // 422
          { "message": "Số điện thoại đã được đăng ký." }          // 422
```

**POST /api/auth/reset-password**
```json
Request:  { "phone": "0912345678", "otp": "123456", "password": "999999" }
Response: { "user": {...}, "token": "..." }
```

---

## Quy tắc mật khẩu

- **Định dạng:** đúng 6 chữ số (`/^\d{6}$/`)
- **Lưu trữ:** `bcrypt` qua `Hash::make()` — không lưu plaintext
- **Validation backend:** `'size:6', 'regex:/^\d{6}$/'`
- **UX:** input type="password" + inputMode="numeric" + show/hide toggle

---

## OTP

- **Hiệu lực:** 5 phút kể từ khi gửi
- **Dùng 1 lần:** sau khi verify thành công, cột `used_at` được ghi lại
- **Trước khi gửi mới:** xóa OTP cũ của cùng số điện thoại
- **Cooldown UI:** 45 giây trước khi cho phép "Gửi lại mã"

---

## Dev bypass

Môi trường `APP_ENV=local` hoặc khi dùng giá trị `000000`:
- Password `000000` → login thành công không cần check DB
- OTP `000000` → register/reset thành công không cần OTP thật trong DB

Seed data (từ `UserSeeder`) set `password = Hash::make('000000')` cho tất cả tài khoản demo.

---

## Roles

Tài khoản mới đăng ký qua `/api/auth/register` luôn có `role = 'customer'`. Driver và Admin chỉ được tạo bởi seeder hoặc admin thủ công — không có self-registration cho 2 role này.

---

## Session / Token

- Token: Laravel Sanctum personal access token, không có expiry (thu hồi khi logout)
- Lưu phía client: Zustand `useAuthStore` với `persist` middleware (localStorage)
- Axios interceptor: đính kèm `Authorization: Bearer <token>` vào mọi request; redirect `/login` khi nhận 401

---

## Files liên quan

| File | Vai trò |
|---|---|
| `backend/app/Http/Controllers/Auth/AuthController.php` | login, register, resetPassword, me, logout |
| `backend/app/Http/Controllers/Auth/OtpController.php` | send OTP |
| `backend/app/Models/User.php` | fillable password, hidden password |
| `backend/database/migrations/…add_password_to_users.php` | cột password nullable |
| `backend/database/seeders/UserSeeder.php` | seed với password mặc định 000000 |
| `frontend/src/api/auth.ts` | loginApi, registerApi, resetPasswordApi, sendOtp |
| `frontend/src/pages/LoginPage.tsx` | UI 4 bước: phone → password → otp → set-password |
