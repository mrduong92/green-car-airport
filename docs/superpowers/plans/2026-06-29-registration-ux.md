# Registration UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tách flow đăng ký thành route `/register` riêng với wizard 4 bước, warning box Zalo, step indicator, thu thập tên và T&C.

**Architecture:** Single `RegisterPage.tsx` component dùng `step: 1|2|3|4` state machine, nhất quán với LoginPage hiện tại. Backend `AuthController::register` được mở rộng để nhận và lưu field `name`.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v3, TanStack Query v5, React Router v6, Laravel 13 / PHP 8.4

## Global Constraints

- Toàn bộ UI text bằng tiếng Việt — không dùng tiếng Anh trong copy
- Dùng design tokens đã có: `primary`, `navy`, `neutral-gray`, `border-gray`, `alert-orange`, `rounded-card`, `rounded-input`, `rounded-pill`
- `rounded-logo` cho logo brand (xem LoginPage hiện tại để tham khảo class)
- Material Symbols Outlined cho icon, `fontVariationSettings: "'FILL' 1"` khi cần filled
- Button component tại `@/components/common/Button`, props: `fullWidth`, `size="lg"`, `loading`, `disabled`
- `useAuthStore` từ `@/stores/auth`, `useUiStore` từ `@/stores/ui`
- `registerPushSubscription` từ `@/push`
- Không dùng `Date.now()` hay state không cần thiết

---

## File Structure

| File | Action | Mô tả |
|---|---|---|
| `backend/tests/Feature/RegisterTest.php` | Tạo mới | Feature tests cho `POST /api/auth/register` với field `name` |
| `backend/app/Http/Controllers/Auth/AuthController.php` | Sửa | Thêm validate + lưu `name` trong method `register` |
| `frontend/src/api/auth.ts` | Sửa | Thêm param `name: string` vào `registerApi` |
| `frontend/src/pages/RegisterPage.tsx` | Tạo mới | Wizard 4 bước hoàn chỉnh |
| `frontend/src/router/index.tsx` | Sửa | Thêm route `/register` bọc trong `GuestOnly` |
| `frontend/src/pages/LoginPage.tsx` | Sửa | Xóa register logic, thêm link "Chưa có tài khoản?" |
| `frontend/src/pages/SplashPage.tsx` | Sửa | Nút "Đăng ký" navigate đến `/register` |

---

## Task 1: Backend — thêm `name` vào register endpoint

**Files:**
- Tạo: `backend/tests/Feature/RegisterTest.php`
- Sửa: `backend/app/Http/Controllers/Auth/AuthController.php` (method `register`, dòng 69–105)

**Interfaces:**
- Produces: `POST /api/auth/register` nhận thêm field `name` (nullable string max:100), lưu vào `users.name`

- [ ] **Step 1: Viết failing test**

Tạo file `backend/tests/Feature/RegisterTest.php`:

```php
<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RegisterTest extends TestCase
{
    use RefreshDatabase;

    public function test_register_saves_name_when_provided(): void
    {
        $this->postJson('/api/auth/register', [
            'phone'    => '0901111111',
            'otp'      => '000000',
            'password' => '123456',
            'name'     => 'Nguyễn Văn A',
        ])
            ->assertOk()
            ->assertJsonPath('user.name', 'Nguyễn Văn A');

        $this->assertDatabaseHas('users', [
            'phone' => '0901111111',
            'name'  => 'Nguyễn Văn A',
        ]);
    }

    public function test_register_succeeds_without_name(): void
    {
        $this->postJson('/api/auth/register', [
            'phone'    => '0902222222',
            'otp'      => '000000',
            'password' => '123456',
        ])
            ->assertOk()
            ->assertJsonStructure(['token', 'user']);
    }

    public function test_register_rejects_name_longer_than_100_chars(): void
    {
        $this->postJson('/api/auth/register', [
            'phone'    => '0903333333',
            'otp'      => '000000',
            'password' => '123456',
            'name'     => str_repeat('A', 101),
        ])
            ->assertStatus(422);
    }

    public function test_register_rejects_duplicate_phone(): void
    {
        // Đăng ký lần 1
        $this->postJson('/api/auth/register', [
            'phone'    => '0904444444',
            'otp'      => '000000',
            'password' => '123456',
        ])->assertOk();

        // Đăng ký lần 2 với cùng SĐT
        $this->postJson('/api/auth/register', [
            'phone'    => '0904444444',
            'otp'      => '000000',
            'password' => '123456',
        ])->assertStatus(422)
          ->assertJsonPath('message', 'Số điện thoại đã được đăng ký.');
    }
}
```

- [ ] **Step 2: Chạy test để xác nhận nó fail**

```bash
docker compose exec app php artisan test --filter=RegisterTest
```

Expected: `test_register_saves_name_when_provided` FAIL (user.name sẽ là `null` vì chưa lưu).

- [ ] **Step 3: Implement — thêm `name` vào `AuthController::register`**

Mở `backend/app/Http/Controllers/Auth/AuthController.php`, sửa method `register` (dòng 69–105):

```php
public function register(Request $request): JsonResponse
{
    $request->validate([
        'phone'         => 'required|string|max:20',
        'otp'           => 'required|string|size:6',
        'password'      => ['required', 'string', 'size:6', 'regex:/^\d{6}$/'],
        'name'          => 'nullable|string|max:100',
        'referral_code' => 'nullable|string|max:10',
    ]);

    if (User::where('phone', $request->phone)->exists()) {
        return response()->json(['message' => 'Số điện thoại đã được đăng ký.'], 422);
    }

    $this->consumeOtp($request->phone, $request->otp);

    $referredById = null;
    if ($request->referral_code) {
        $referrer = User::where('referral_code', $request->referral_code)->first();
        if ($referrer) {
            $referredById = $referrer->id;
        }
    }

    $user = User::create([
        'phone'               => $request->phone,
        'name'                => $request->input('name'),
        'password'            => Hash::make($request->password),
        'role'                => 'customer',
        'referred_by_user_id' => $referredById,
    ]);

    $token = $user->createToken('api')->plainTextToken;

    return response()->json([
        'user'  => $this->userPayload($user),
        'token' => $token,
    ]);
}
```

- [ ] **Step 4: Chạy test để xác nhận pass**

```bash
docker compose exec app php artisan test --filter=RegisterTest
```

Expected: 4 tests PASS.

- [ ] **Step 5: Chạy toàn bộ test suite để không có regression**

```bash
make test
```

Expected: tất cả PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/tests/Feature/RegisterTest.php backend/app/Http/Controllers/Auth/AuthController.php
git commit -m "feat: accept and persist name field in register endpoint"
```

---

## Task 2: Frontend API — cập nhật `registerApi`

**Files:**
- Sửa: `frontend/src/api/auth.ts` (dòng 9–15)

**Interfaces:**
- Produces: `registerApi(phone, otp, password, name, referralCode?)` — RegisterPage gọi với signature này

- [ ] **Step 1: Sửa `registerApi` trong `frontend/src/api/auth.ts`**

Thay thế function `registerApi` hiện tại (dòng 9–15):

```ts
export const registerApi = (
  phone: string,
  otp: string,
  password: string,
  name: string,
  referralCode?: string,
) =>
  api.post<{ token: string; user: App.User }>('/auth/register', {
    phone,
    otp,
    password,
    name,
    ...(referralCode ? { referral_code: referralCode } : {}),
  })
```

- [ ] **Step 2: Kiểm tra TypeScript không lỗi**

```bash
docker compose exec green_car_frontend npx tsc --noEmit
```

Expected: không có lỗi liên quan đến `registerApi` (có thể xuất hiện lỗi "Expected 5 arguments" tại `LoginPage.tsx` — sẽ fix ở Task 5).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/auth.ts
git commit -m "feat: add name param to registerApi"
```

---

## Task 3: Tạo `RegisterPage.tsx`

**Files:**
- Tạo: `frontend/src/pages/RegisterPage.tsx`

**Interfaces:**
- Consumes: `sendOtp(phone, 'register')` từ `@/api/auth`, `registerApi(phone, otp, password, name, referralCode?)` từ Task 2
- Consumes: `useAuthStore((s) => s.setAuth)`, `useUiStore((s) => s.showToast)`
- Consumes: `Button` từ `@/components/common/Button`
- Consumes: `registerPushSubscription` từ `@/push`

- [ ] **Step 1: Tạo file `frontend/src/pages/RegisterPage.tsx`**

```tsx
import { useState, useRef, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { sendOtp, registerApi } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { registerPushSubscription } from '@/push'
import Button from '@/components/common/Button'

type RegStep = 1 | 2 | 3 | 4

export default function RegisterPage() {
  const navigate  = useNavigate()
  const setAuth   = useAuthStore((s) => s.setAuth)
  const showToast = useUiStore((s) => s.showToast)

  const [step, setStep]             = useState<RegStep>(1)
  const [phone, setPhone]           = useState('')
  const [referralCode, setReferral] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    const ref = params.get('ref')
    if (ref) localStorage.setItem('referral_code', ref)
    return ref ?? localStorage.getItem('referral_code') ?? ''
  })
  const [otp, setOtp]               = useState(['', '', '', '', '', ''])
  const [countdown, setCountdown]   = useState(0)
  const [name, setName]             = useState('')
  const [password, setPassword]     = useState('')
  const [showPwd, setShowPwd]       = useState(false)
  const [agreedPrivacy, setPrivacy] = useState(false)
  const [agreedTerms, setTerms]     = useState(false)

  const otpRefs = useRef<(HTMLInputElement | null)[]>([])
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  useEffect(() => {
    if (step === 2) setTimeout(() => otpRefs.current[0]?.focus(), 100)
    if (step === 3) setTimeout(() => nameRef.current?.focus(), 100)
  }, [step])

  const onAuthSuccess = ({ data }: { data: { user: App.User; token: string } }) => {
    setAuth(data.user, data.token)
    registerPushSubscription()
    localStorage.removeItem('referral_code')
    navigate('/customer/booking')
  }

  const sendMutation = useMutation({
    mutationFn: () => sendOtp(phone, 'register'),
    onSuccess: () => {
      setCountdown(45)
      setStep(2)
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      showToast(err.response?.data?.message ?? 'Gửi OTP thất bại. Vui lòng thử lại.', 'error')
    },
  })

  const registerMutation = useMutation({
    mutationFn: () =>
      registerApi(phone, otp.join(''), password, name, referralCode || undefined),
    onSuccess: onAuthSuccess,
    onError: (err: { response?: { data?: { message?: string } } }) => {
      showToast(err.response?.data?.message ?? 'Đăng ký thất bại. Vui lòng thử lại.', 'error')
    },
  })

  const handleOtpChange = (idx: number, val: string) => {
    if (!/^\d?$/.test(val)) return
    const next = [...otp]
    next[idx] = val
    setOtp(next)
    if (val && idx < 5) otpRefs.current[idx + 1]?.focus()
    if (next.every((d) => d !== '')) setStep(3)
  }

  const handleOtpKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) otpRefs.current[idx - 1]?.focus()
  }

  const handleBack = () => {
    if (step === 1) navigate('/')
    else setStep((s) => (s - 1) as RegStep)
  }

  const pwdValid    = /^\d{6}$/.test(password)
  const step3Valid  = name.trim().length > 0 && pwdValid
  const step4Valid  = agreedPrivacy && agreedTerms

  return (
    <div className="min-h-svh bg-white flex flex-col max-w-[430px] mx-auto">
      {/* Top bar */}
      <div className="px-4 pt-14 pb-2 safe-top flex items-center">
        <button onClick={handleBack} className="w-10 h-10 flex items-center justify-center text-navy">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
      </div>

      <div className="flex-1 px-6 pt-4 flex flex-col gap-6">
        {/* Brand */}
        <div>
          <div className="w-16 h-16 rounded-logo bg-primary-tint flex items-center justify-center mb-7">
            <span
              className="material-symbols-outlined text-primary"
              style={{ fontSize: 32, fontVariationSettings: "'FILL' 1" }}
            >
              directions_car
            </span>
          </div>
          <h1 className="text-navy font-bold text-[28px] leading-tight mb-2">Tạo tài khoản</h1>
          <p className="text-neutral-gray text-sm">Đăng ký để bắt đầu hành trình</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center">
          {([1, 2, 3, 4] as RegStep[]).map((n, i) => (
            <div key={n} className={`flex items-center ${i < 3 ? 'flex-1' : ''}`}>
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                  step > n
                    ? 'bg-primary text-white'
                    : step === n
                    ? 'bg-navy text-white'
                    : 'bg-border-gray text-neutral-gray'
                }`}
              >
                {step > n ? (
                  <span className="material-symbols-outlined text-[16px]">check</span>
                ) : (
                  n
                )}
              </div>
              {i < 3 && (
                <div className={`flex-1 h-px mx-1 ${step > n ? 'bg-primary' : 'bg-border-gray'}`} />
              )}
            </div>
          ))}
        </div>

        {/* ── Bước 1: SĐT + Mã giới thiệu ── */}
        {step === 1 && (
          <>
            <div className="flex gap-2 items-start p-3 rounded-card border border-amber-300 bg-amber-50">
              <span
                className="material-symbols-outlined text-alert-orange text-[18px] mt-0.5 shrink-0"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                warning
              </span>
              <p className="text-sm text-amber-800 leading-snug">
                Vui lòng sử dụng số điện thoại đã đăng ký Zalo để nhận mã OTP
              </p>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-neutral-gray uppercase tracking-wider mb-2">
                Số điện thoại *
              </p>
              <div
                className="flex items-center bg-white overflow-hidden h-[52px]"
                style={{ border: '1.5px solid #006a36', borderRadius: 8, boxShadow: '0 0 0 4px rgba(0,106,54,0.18)' }}
              >
                <span className="px-4 text-navy font-semibold text-sm border-r border-border-gray h-full flex items-center">
                  🇻🇳 +84
                </span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="9xx xxx xxx"
                  className="flex-1 px-4 outline-none text-navy text-[17px] font-semibold tracking-wider bg-transparent"
                />
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-neutral-gray uppercase tracking-wider mb-2">
                Mã giới thiệu
              </p>
              <input
                type="text"
                value={referralCode}
                onChange={(e) => setReferral(e.target.value.toUpperCase())}
                placeholder="Nhập mã nếu có"
                className="w-full h-[52px] border-[1.5px] border-border-gray rounded-input px-4 text-navy outline-none focus:border-primary focus:shadow-[0_0_0_4px_rgba(0,106,54,0.18)] transition-shadow uppercase tracking-wider"
              />
            </div>

            <Button
              fullWidth
              size="lg"
              loading={sendMutation.isPending}
              disabled={phone.length < 9}
              onClick={() => sendMutation.mutate()}
            >
              Tiếp theo
            </Button>

            <p className="text-center text-sm text-neutral-gray">
              Đã có tài khoản?{' '}
              <Link to="/login" className="text-primary font-semibold">
                Đăng nhập
              </Link>
            </p>
          </>
        )}

        {/* ── Bước 2: OTP ── */}
        {step === 2 && (
          <>
            <p className="text-neutral-gray text-sm -mt-2">
              Nhập mã OTP đã gửi đến{' '}
              <span className="font-semibold text-navy">{phone}</span>
            </p>

            <div className="flex gap-2 justify-center">
              {otp.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => { otpRefs.current[i] = el }}
                  type="tel"
                  maxLength={1}
                  value={d}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  className="w-12 h-14 text-center text-xl font-bold border-[1.5px] border-border-gray rounded-input outline-none focus:border-primary focus:shadow-[0_0_0_4px_rgba(0,106,54,0.18)] text-navy transition-shadow"
                />
              ))}
            </div>

            <p className="text-center text-sm text-neutral-gray">
              {countdown > 0 ? (
                `Gửi lại mã sau ${countdown}s`
              ) : (
                <button
                  onClick={() => {
                    setOtp(['', '', '', '', '', ''])
                    sendMutation.mutate()
                  }}
                  className="text-primary font-medium"
                >
                  Gửi lại mã OTP
                </button>
              )}
            </p>
          </>
        )}

        {/* ── Bước 3: Tên + Mật khẩu ── */}
        {step === 3 && (
          <>
            <div>
              <p className="text-[11px] font-semibold text-neutral-gray uppercase tracking-wider mb-2">
                Họ và tên *
              </p>
              <input
                ref={nameRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                placeholder="Nguyễn Văn A"
                className="w-full h-[52px] border-[1.5px] border-border-gray rounded-input px-4 text-navy outline-none focus:border-primary focus:shadow-[0_0_0_4px_rgba(0,106,54,0.18)] transition-shadow"
              />
            </div>

            <div>
              <p className="text-[11px] font-semibold text-neutral-gray uppercase tracking-wider mb-2">
                Mật khẩu *
              </p>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••••"
                  className="w-full h-[52px] border-[1.5px] border-border-gray rounded-input px-4 pr-12 text-navy text-2xl tracking-[0.4em] outline-none focus:border-primary focus:shadow-[0_0_0_4px_rgba(0,106,54,0.18)] transition-shadow"
                  style={{ fontFamily: 'monospace' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-gray"
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {showPwd ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
              <p className="text-[11px] text-neutral-gray mt-1.5">Nhập đúng 6 chữ số</p>
            </div>

            <Button
              fullWidth
              size="lg"
              disabled={!step3Valid}
              onClick={() => setStep(4)}
            >
              Tiếp theo
            </Button>
          </>
        )}

        {/* ── Bước 4: Điều khoản ── */}
        {step === 4 && (
          <>
            <h2 className="text-navy font-semibold text-[17px] -mt-2">
              Xem lại tài liệu pháp lý
            </h2>

            <div className="flex flex-col gap-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreedPrivacy}
                  onChange={(e) => setPrivacy(e.target.checked)}
                  className="w-5 h-5 mt-0.5 accent-primary shrink-0"
                />
                <span className="text-sm text-navy leading-snug">
                  Tôi đồng ý với{' '}
                  <a
                    href="/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary font-semibold underline"
                  >
                    Chính sách bảo mật
                  </a>
                </span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreedTerms}
                  onChange={(e) => setTerms(e.target.checked)}
                  className="w-5 h-5 mt-0.5 accent-primary shrink-0"
                />
                <span className="text-sm text-navy leading-snug">
                  Tôi đồng ý với{' '}
                  <a
                    href="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary font-semibold underline"
                  >
                    Điều khoản sử dụng
                  </a>
                </span>
              </label>
            </div>

            <Button
              fullWidth
              size="lg"
              loading={registerMutation.isPending}
              disabled={!step4Valid}
              onClick={() => registerMutation.mutate()}
            >
              Tạo tài khoản
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Kiểm tra TypeScript không lỗi**

```bash
docker compose exec green_car_frontend npx tsc --noEmit
```

Expected: lỗi có thể ở LoginPage (registerApi arity) — bỏ qua, sẽ fix ở Task 5. Không có lỗi trong file mới.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/RegisterPage.tsx
git commit -m "feat: add RegisterPage with 4-step registration wizard"
```

---

## Task 4: Router — thêm route `/register`

**Files:**
- Sửa: `frontend/src/router/index.tsx`

**Interfaces:**
- Consumes: `RegisterPage` từ Task 3

- [ ] **Step 1: Thêm import và route vào `frontend/src/router/index.tsx`**

Thêm import (sau dòng `import LoginPage`):

```ts
import RegisterPage from '@/pages/RegisterPage'
```

Thêm route `/register` vào block `GuestOnly` (sau `{ path: '/login', element: <LoginPage /> }`):

```ts
{ path: '/register', element: <RegisterPage /> },
```

Block `GuestOnly` đầy đủ sau khi sửa:

```ts
{
  element: <GuestOnly />,
  children: [
    { path: '/', element: <SplashPage /> },
    { path: '/login', element: <LoginPage /> },
    { path: '/register', element: <RegisterPage /> },
  ],
},
```

- [ ] **Step 2: Kiểm tra TypeScript**

```bash
docker compose exec green_car_frontend npx tsc --noEmit
```

- [ ] **Step 3: Kiểm tra thủ công**

Mở `http://localhost:5173/register` trên browser.
Expected: trang "Tạo tài khoản" hiển thị với bước 1, warning box vàng, field SĐT và mã giới thiệu.

Thử `http://localhost:5173/register?ref=TESTCODE` — mã giới thiệu phải tự điền "TESTCODE".

- [ ] **Step 4: Commit**

```bash
git add frontend/src/router/index.tsx
git commit -m "feat: add /register route with GuestOnly guard"
```

---

## Task 5: LoginPage — xóa register logic, thêm link

**Files:**
- Sửa: `frontend/src/pages/LoginPage.tsx`

**Interfaces:**
- Consumes: `resetPasswordApi` từ `@/api/auth` (giữ lại), xóa `registerApi`
- Produces: LoginPage chỉ handle login + reset password; có link "Chưa có tài khoản? Đăng ký"

- [ ] **Step 1: Sửa `frontend/src/pages/LoginPage.tsx`**

**a) Sửa imports** — xóa `registerApi`:

```ts
import { sendOtp, loginApi, resetPasswordApi } from '@/api/auth'
```

Thêm `Link` vào react-router-dom import:

```ts
import { useNavigate, Link } from 'react-router-dom'
```

**b) Sửa `Purpose` type** — chỉ còn `'reset'`:

```ts
type Purpose = 'reset'
```

**c) Xóa state `purpose`** và thay thế tất cả `purpose` bằng `'reset'`:

Xóa dòng:
```ts
const [purpose, setPurpose]   = useState<Purpose>('register')
```

**d) Xóa `referralCode` state** (đã chuyển sang RegisterPage):

Xóa toàn bộ block:
```ts
const [referralCode] = useState<string | null>(() => {
  const params = new URLSearchParams(window.location.search)
  const ref = params.get('ref')
  if (ref) {
    localStorage.setItem('referral_code', ref)
    return ref
  }
  return localStorage.getItem('referral_code')
})
```

**e) Xóa `finishMutation`** (register/reset combined) và thay bằng `resetMutation` đơn giản:

```ts
const resetMutation = useMutation({
  mutationFn: () => resetPasswordApi(phone, otp.join(''), password),
  onSuccess: onAuthSuccess,
  onError: (err: { response?: { data?: { message?: string } } }) => {
    showToast(err.response?.data?.message ?? 'Có lỗi xảy ra.', 'error')
  },
})
```

**f) Sửa `doSendOtp`** — xóa `setPurpose`, chỉ gọi `sendMutation.mutate('reset', ...)`:

```ts
const doSendOtp = () => {
  setOtp(['', '', '', '', '', ''])
  setPassword('')
  sendMutation.mutate('reset', {
    onSuccess: () => setStep('otp'),
  })
}
```

**g) Sửa `sendMutation`** — `Purpose` chỉ là `'reset'`:

```ts
const sendMutation = useMutation({
  mutationFn: (p: 'reset') => sendOtp(phone, p),
  onSuccess: () => setCountdown(45),
  onError: (err: { response?: { data?: { message?: string } } }) => {
    showToast(err.response?.data?.message ?? 'Gửi OTP thất bại. Vui lòng thử lại.', 'error')
  },
})
```

**h) Sửa `Step` type** — xóa `'set-password'` hoặc giữ lại cho reset flow. Giữ nguyên các steps `'phone' | 'password' | 'otp' | 'set-password'` vì reset password vẫn cần `'set-password'`.

**i) Sửa `heading` object** — xóa entry register, cập nhật `'otp'` và `'set-password'`:

```ts
const heading: Record<Step, { title: string; sub: string }> = {
  'phone':        { title: 'Chào mừng', sub: 'Nhập số điện thoại để tiếp tục' },
  'password':     { title: 'Nhập mật khẩu', sub: `Mật khẩu 6 chữ số của tài khoản ${phone}` },
  'otp':          { title: 'Xác minh để đặt lại', sub: `Nhập mã OTP được gửi đến ${phone}` },
  'set-password': { title: 'Mật khẩu mới', sub: 'Mật khẩu gồm 6 chữ số' },
}
```

**j) Sửa step `'set-password'` button** — đổi `finishMutation` thành `resetMutation`:

```tsx
<Button
  fullWidth size="lg"
  loading={resetMutation.isPending}
  disabled={!pwdValid}
  onClick={() => resetMutation.mutate()}
>
  Đặt lại mật khẩu
</Button>
```

**k) Xóa button "Đăng ký tài khoản mới"** trong step `'phone'` và thêm link:

Xóa:
```tsx
<button
  disabled={phone.length < 9 || sendMutation.isPending}
  onClick={() => doSendOtp('register')}
  ...
>
  Đăng ký tài khoản mới
</button>
```

Thêm vào cuối block `{step === 'phone' && (...)}`, dưới Button "Đăng nhập":

```tsx
<p className="text-center text-sm text-neutral-gray">
  Chưa có tài khoản?{' '}
  <Link to="/register" className="text-primary font-semibold">Đăng ký</Link>
</p>
```

**l) Xóa block `!DEV_MOCK` ở cuối step `'phone'`** (warning Zalo đã chuyển sang RegisterPage):

Xóa:
```tsx
{!DEV_MOCK && (
  <p className="text-center text-[13px] text-neutral-gray leading-relaxed">
    Vui lòng sử dụng số điện thoại đã đăng ký Zalo để nhận mã OTP
  </p>
)}
```

**m) Sửa `loginMutation.onError`** — xóa nhánh `'no_password'` gọi `doSendOtp('register')`, đổi thành `doSendOtp()`:

```ts
onError: (err: { response?: { data?: { code?: string; message?: string } } }) => {
  const code = err.response?.data?.code
  const msg  = err.response?.data?.message
  if (code === 'no_password') {
    showToast('Tài khoản chưa có mật khẩu. Vui lòng đặt lại mật khẩu.', 'info')
    doSendOtp()
  } else if (code === 'blocked') {
    showToast(msg ?? 'Tài khoản đã bị khoá.', 'error')
  } else {
    showToast(msg ?? 'Mật khẩu không đúng.', 'error')
  }
},
```

**n) Sửa "Quên mật khẩu?" button** trong step `'password'`:

```tsx
<button
  disabled={sendMutation.isPending}
  onClick={() => doSendOtp()}
  className="text-primary text-sm font-medium text-center disabled:opacity-50 flex items-center justify-center gap-1"
>
  {sendMutation.isPending
    ? <span className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    : null}
  Quên mật khẩu?
</button>
```

**o) Sửa "Gửi lại mã OTP" button** trong step `'otp'`:

```tsx
<button
  onClick={() => {
    setOtp(['', '', '', '', '', ''])
    sendMutation.mutate('reset', { onSuccess: () => setCountdown(45) })
  }}
  className="text-primary font-medium"
>
  Gửi lại mã OTP
</button>
```

- [ ] **Step 2: Kiểm tra TypeScript**

```bash
docker compose exec green_car_frontend npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Kiểm tra thủ công login flow**

Mở `http://localhost:5173/login`.
- Nhập SĐT → bấm "Đăng nhập" → nhập mật khẩu → vào app ✓
- Link "Chưa có tài khoản? Đăng ký" → chuyển đến `/register` ✓
- "Quên mật khẩu?" → gửi OTP → đặt mật khẩu mới ✓

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/LoginPage.tsx
git commit -m "refactor: remove register flow from LoginPage, add link to /register"
```

---

## Task 6: SplashPage — nút "Đăng ký" → `/register`

**Files:**
- Sửa: `frontend/src/pages/SplashPage.tsx` (dòng 64–70)

- [ ] **Step 1: Sửa navigate trong SplashPage**

Tìm button "Đăng ký" (dòng 64–70 trong SplashPage.tsx):

```tsx
<button
  onClick={() => navigate('/login')}
  className="w-full h-[52px] rounded-pill border border-white/40 text-white text-[16px] font-semibold"
  style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)' }}
>
  Đăng ký
</button>
```

Đổi `navigate('/login')` thành `navigate('/register')`:

```tsx
<button
  onClick={() => navigate('/register')}
  className="w-full h-[52px] rounded-pill border border-white/40 text-white text-[16px] font-semibold"
  style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)' }}
>
  Đăng ký
</button>
```

- [ ] **Step 2: Kiểm tra thủ công**

Mở `http://localhost:5173/`.
- Bấm "Đăng nhập" → vào `/login` ✓
- Bấm "Đăng ký" → vào `/register` ✓

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/SplashPage.tsx
git commit -m "feat: route register button on SplashPage to /register"
```

---

## Kiểm tra cuối (End-to-End)

Sau khi hoàn thành tất cả task, thực hiện kiểm tra manual:

- [ ] **Flow đăng ký mới hoàn chỉnh:**
  1. Vào `http://localhost:5173/` → bấm "Đăng ký"
  2. Bước 1: nhập SĐT hợp lệ, mã giới thiệu nếu có → bấm "Tiếp theo"
  3. Bước 2: nhập OTP (dev: `000000`) → tự chuyển bước 3
  4. Bước 3: nhập tên + mật khẩu 6 số → "Tiếp theo"
  5. Bước 4: tick cả 2 checkbox → "Tạo tài khoản" → vào `/customer/booking`
  6. DB: kiểm tra `users` table có `name` đúng

- [ ] **Flow link mời:**
  - Vào `http://localhost:5173/register?ref=AIRPORT50K` → mã giới thiệu tự điền "AIRPORT50K"

- [ ] **"Quay lại" từ bước 2, 3, 4:** mỗi bước back về bước trước ✓

- [ ] **Backend test suite:**
  ```bash
  make test
  ```
  Expected: tất cả PASS.
