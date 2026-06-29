# Registration UX Redesign — Tách `/register` + Wizard 4 bước

**Ngày:** 2026-06-29  
**Phạm vi:** Frontend (RegisterPage mới) + Backend (thêm `name` vào register API)

---

## Bối cảnh & Vấn đề

Hiện tại cả "Đăng nhập" lẫn "Đăng ký" trên SplashPage đều điều hướng đến cùng một route `/login`. Flow đăng ký được xử lý như một state machine trong LoginPage với các bước `phone → otp → set-password`. Điều này dẫn đến:

- URL không thay đổi khi đăng ký — link mời `?ref=xxx` không rõ ràng là để đăng ký
- Không có step indicator — user không biết còn bao nhiêu bước
- Warning về Zalo OTP chỉ là text nhỏ ở dưới, không nổi bật
- Mã giới thiệu lấy từ URL nhưng không hiển thị cho user xem
- Không thu thập tên và không có màn hình T&C

---

## Quyết định thiết kế

**Phương án chọn:** Single component, multi-step state (Phương án A)

`RegisterPage.tsx` là 1 component duy nhất dùng `step: 1 | 2 | 3 | 4`. Nhất quán với pattern của LoginPage, không thêm phức tạp không cần thiết.

---

## Kiến trúc

### Route & Navigation

| Trước | Sau |
|---|---|
| SplashPage "Đăng ký" → `/login` | SplashPage "Đăng ký" → `/register` |
| LoginPage có button "Đăng ký tài khoản mới" | LoginPage bỏ button đó, thêm link "Chưa có tài khoản? Đăng ký" → `/register` |
| `/login` xử lý cả register lẫn login | `/login` chỉ xử lý login + reset password |
| — | `/register` route mới, bọc trong `<GuestOnly>` |

**URL mời:** `/register?ref=XXXXX` → RegisterPage đọc param, pre-fill mã giới thiệu tự động.

### State RegisterPage

```ts
type RegStep = 1 | 2 | 3 | 4

const [step, setStep]             = useState<RegStep>(1)
const [phone, setPhone]           = useState('')
const [referralCode, setReferral] = useState<string>('')   // từ ?ref= hoặc nhập tay
const [otp, setOtp]               = useState(['','','','','',''])
const [name, setName]             = useState('')
const [password, setPassword]     = useState('')
const [agreedPrivacy, setPrivacy] = useState(false)
const [agreedTerms, setTerms]     = useState(false)
```

---

## 4 Bước đăng ký

### Bước 1 — Số điện thoại & Mã giới thiệu

- Step indicator: `1●—2—3—4`
- **Warning box (luôn hiển thị):** background `#FFFBEB` (amber-50), border `amber-300`, icon `warning` Material Symbols màu `alert-orange` (#F59E0B)  
  Nội dung: *"Vui lòng sử dụng số điện thoại đã đăng ký Zalo để nhận mã OTP"*
- Field: Số điện thoại (flag 🇻🇳 +84 prefix, required)
- Field: Mã giới thiệu (optional, pre-fill từ `?ref=`, placeholder "Nhập mã nếu có")
- Button "Tiếp theo": disabled nếu SĐT < 9 ký tự; khi nhấn → gọi `sendOtp(phone, 'register')` → chuyển bước 2

### Bước 2 — Xác minh OTP

- Step indicator: `✓—2●—3—4`
- Sub-heading: "Nhập mã OTP gửi đến `{phone}`"
- 6 ô input OTP (giống LoginPage hiện tại, auto-focus, auto-advance)
- Countdown 45s + nút "Gửi lại mã OTP"
- Auto-advance sang bước 3 khi nhập đủ 6 số

### Bước 3 — Thông tin cá nhân & Mật khẩu

- Step indicator: `✓—✓—3●—4`
- Field: Họ và tên (required, maxLength 100)
- Field: Mật khẩu 6 chữ số (required, inputMode numeric, toggle show/hide)
- Button "Tiếp theo": disabled nếu tên rỗng hoặc mật khẩu chưa đủ 6 số

### Bước 4 — Điều khoản sử dụng

- Step indicator: `✓—✓—✓—4●`
- Heading: "Xem lại tài liệu pháp lý"
- Checkbox: "Tôi đồng ý với **Chính sách bảo mật**" (link `<a href="/privacy" target="_blank">` — trang này là placeholder, cần tạo riêng)
- Checkbox: "Tôi đồng ý với **Điều khoản sử dụng**" (link `<a href="/terms" target="_blank">` — trang này là placeholder, cần tạo riêng)
- Button "Tạo tài khoản": disabled nếu chưa tick cả 2 checkbox
- Khi nhấn: gọi `registerApi(phone, otp.join(''), password, name, referralCode || undefined)` → `onAuthSuccess`

---

## Step Indicator Component

Inline trong RegisterPage (~20 dòng JSX), không tách file riêng:

```
Bước đã qua  : circle bg-primary  + icon check trắng
Bước hiện tại: circle bg-navy     + số trắng
Bước chưa tới: circle bg-border-gray + số xám
Connector    : flex-1 h-px, màu primary nếu bước sau đã qua, border-gray nếu chưa
```

---

## Warning Box

```jsx
<div className="flex gap-2 items-start p-3 rounded-card border border-amber-300 bg-amber-50">
  <span className="material-symbols-outlined text-alert-orange text-[18px] mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>
    warning
  </span>
  <p className="text-sm text-amber-800 leading-snug">
    Vui lòng sử dụng số điện thoại đã đăng ký Zalo để nhận mã OTP
  </p>
</div>
```

---

## Thay đổi Backend

### `registerApi` — thêm param `name`

**`src/api/auth.ts`:**
```ts
export const registerApi = (
  phone: string, otp: string, password: string,
  name: string, referralCode?: string
) => axios.post('/auth/otp/verify', { phone, otp, password, name, referral_code: referralCode })
```

**`app/Http/Controllers/Auth/OtpController.php` — method `verify`:**
```php
$request->validate([
  'phone'    => 'required|string',
  'otp'      => 'required|string|size:6',
  'password' => 'required|digits:6',
  'name'     => 'nullable|string|max:100',
]);
// Sau khi xác thực OTP thành công, lưu name nếu được gửi lên:
if ($request->filled('name')) {
    $user->name = $request->input('name');
    $user->save();
}
```

> `name` để `nullable` thay vì `required_if` để tránh phụ thuộc vào field `purpose` (endpoint verify hiện không nhận `purpose`). Frontend RegisterPage luôn gửi `name` vì bước 3 bắt buộc nhập tên.

`users.name` đã tồn tại từ Laravel default migration — không cần migration mới.

---

## LoginPage Cleanup

Xóa khỏi `LoginPage.tsx`:
- `Purpose` type → chỉ còn `'reset'` (bỏ `'register'`)
- Button "Đăng ký tài khoản mới" và logic `doSendOtp('register')`
- Import `registerApi`
- Heading entry cho step `register`

Thêm vào `LoginPage.tsx`:
```jsx
// Cuối form, dưới button "Đăng nhập"
<p className="text-center text-sm text-neutral-gray">
  Chưa có tài khoản?{' '}
  <Link to="/register" className="text-primary font-semibold">Đăng ký</Link>
</p>
```

---

## File thay đổi

| File | Thay đổi |
|---|---|
| `frontend/src/pages/RegisterPage.tsx` | Tạo mới |
| `frontend/src/pages/LoginPage.tsx` | Xóa register logic, thêm link đến /register |
| `frontend/src/pages/SplashPage.tsx` | Nút "Đăng ký" → `/register` |
| `frontend/src/router/index.tsx` | Thêm route `/register` |
| `frontend/src/api/auth.ts` | Thêm param `name` vào `registerApi` |
| `backend/app/Http/Controllers/Auth/OtpController.php` | Validate & lưu `name` |

---

## Không nằm trong phạm vi

- SSO (Google/Apple) — không có trong hệ thống hiện tại
- Email field — app dùng SĐT + OTP, không có email
- Địa chỉ — không cần thiết cho nghiệp vụ chuyên chở
- Deep-link từng bước — không cần URL thay đổi theo step
