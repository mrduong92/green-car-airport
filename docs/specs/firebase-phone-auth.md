# Spec: Firebase Phone Auth — OTP qua SMS

> Tài liệu tham khảo chính thức:
> - Frontend SDK: https://firebase.google.com/docs/auth/web/phone-auth
> - Backend verify: https://firebase.google.com/docs/auth/admin/verify-id-tokens

---

## Tổng quan

Firebase Phone Auth gửi SMS OTP đến số điện thoại người dùng. Frontend dùng Firebase JS SDK để xử lý toàn bộ luồng OTP; backend chỉ nhận Firebase ID Token và verify để đổi lấy Sanctum token.

**Không nhầm với Firebase Phone Number Verification (PNV)** — đó là sản phẩm khác, đọc SIM trực tiếp, chỉ dành cho native mobile app (Android/iOS), không dùng được cho web/PWA.

---

## Luồng xác thực

```
1. FE: new RecaptchaVerifier(auth, elementId, {size:'invisible'})
2. FE: signInWithPhoneNumber(auth, '+84912345678', verifier) → ConfirmationResult
        └─ Firebase gửi SMS OTP đến user
3. User: nhập 6 chữ số OTP
4. FE: confirmationResult.confirm(otp) → UserCredential
5. FE: userCredential.user.getIdToken() → Firebase ID Token (JWT, ~1h)
6. FE: POST /api/auth/firebase/verify { firebase_token, password? }
7. BE: kreait/firebase-php verifyIdToken(token) → decode claims
        └─ claims.phone_number = "+84912345678"
8. BE: upsert User(phone="0912345678") → Sanctum token
9. FE: lưu Sanctum token → redirect theo role
```

---

## Frontend — Các API chính thức

### Khởi tạo (`src/firebase.ts`)
```ts
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

export const firebaseAuth = getAuth(initializeApp({
  apiKey:     import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:  import.meta.env.VITE_FIREBASE_PROJECT_ID,
}))
```

### Gửi OTP
```ts
import { RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth'

const verifier = new RecaptchaVerifier(firebaseAuth, 'recaptcha-div', {
  size: 'invisible',         // không hiện widget cho user
})
const confirmationResult = await signInWithPhoneNumber(firebaseAuth, '+84912345678', verifier)
// Nếu lỗi → verifier.clear() trước khi tạo lại
```

### Xác nhận OTP + lấy ID Token
```ts
const credential = await confirmationResult.confirm('123456')
const idToken = await credential.user.getIdToken()
// Gửi idToken lên backend
```

### Gửi lại OTP
Gọi lại `signInWithPhoneNumber()` — `ConfirmationResult` không có method `resend()`.

---

## Backend — Verify ID Token

### Package
```bash
composer require kreait/firebase-php:^7.0
```

### Service (`app/Services/FirebaseService.php`)
```php
use Kreait\Firebase\Factory;
use Kreait\Firebase\Exception\Auth\FailedToVerifyToken;

$auth    = (new Factory)->withServiceAccount('/path/to/credentials.json')->createAuth();
$decoded = $auth->verifyIdToken($idToken);    // throws FailedToVerifyToken nếu invalid

$uid   = $decoded->claims()->get('sub');          // Firebase UID
$phone = $decoded->claims()->get('phone_number'); // "+84912345678"
```

### Endpoint (`POST /api/auth/firebase/verify`)
```
Request:  { firebase_token: "eyJ...", password?: "123456" }
Response: { user: { id, name, phone, role }, token: "sanctum..." }
```

- Convert phone: `+84912345678` → `0912345678` (`'0' . ltrim(str_replace('+84', '', $phone))`)
- `User::firstOrCreate(['phone' => $phone], ['role' => 'customer'])`
- Nếu `password` có → `Hash::make($password)` và update user

---

## Env vars

### Backend (`backend/.env`)
```
FIREBASE_CREDENTIALS=/var/www/html/storage/firebase-credentials.json
```
File JSON service account đặt tại `backend/storage/firebase-credentials.json` — đã thêm vào `.gitignore`.

### Frontend (`frontend/.env`)
```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
```

---

## Lưu ý quan trọng

### Localhost bị chặn mặc định
Firebase Console → Authentication → Settings → **Authorized Domains** → thêm `localhost` hoặc domain staging.

### Test phone numbers (khuyến nghị cho dev/staging)
Firebase Console → Authentication → Sign-in method → Phone → **Test phone numbers**:
```
+84901234567  →  OTP: 123456   (customer)
+84912345678  →  OTP: 123456   (driver)
+84923456789  →  OTP: 123456   (admin)
```
Không gửi SMS thật, không tốn phí, không bị throttle. Tối đa 10 test numbers/project.

### DEV_MOCK (VITE_MOCK=true)
Quick-login buttons gọi `POST /api/auth/dev/mock-login { phone }` → backend trả Sanctum token trực tiếp, bỏ qua Firebase hoàn toàn. Endpoint chỉ hoạt động khi `APP_ENV=local`.

### phone_number claim
Không được liệt kê trong bảng standard claims của Firebase docs, nhưng được Firebase thêm tự động vào ID Token cho Phone Auth users. Verify sau khi có Firebase project thật bằng cách decode token.

### Throttling
Firebase giới hạn số OTP gửi đến cùng một số điện thoại trong khoảng thời gian ngắn. Dùng test phone numbers để tránh.

---

## Checklist setup Firebase project

- [ ] Tạo Firebase project tại console.firebase.google.com
- [ ] Bật **Phone** sign-in method (Authentication → Sign-in method)
- [ ] Thêm authorized domains (localhost, staging, production)
- [ ] Thêm test phone numbers (dev/staging)
- [ ] Tạo Service Account → download JSON → đặt vào `backend/storage/firebase-credentials.json`
- [ ] Lấy web app config → điền vào `frontend/.env`
