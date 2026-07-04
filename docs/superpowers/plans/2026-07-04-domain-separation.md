# Domain Separation (Customer/Driver Apps) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tách frontend thành 2 app build riêng (customer+admin / driver) deploy trên 2 subdomain, mỗi app login luôn gửi đúng `role` — loại bỏ role-picker và bug số điện thoại 2 role mặc định về customer.

**Architecture:** 1 codebase, 2 Vite entry (`main.tsx` / `main.driver.tsx`) qua 2 config file dùng chung `createAppConfig(target)`; entry script được swap bằng plugin `transformIndexHtml` trên cùng 1 `index.html`. Router tách thành `router/customer.tsx` + `router/driver.tsx` với guards dùng chung. Login state machine tách vào hook `useAuthLogin(role)`, 3 page login mỏng (customer/driver/admin) hardcode role. Backend không đổi.

**Tech Stack:** React 19 + Vite 8 + TypeScript, TanStack Query v5, Zustand, vite-plugin-pwa. Docker Compose dev (thêm service `frontend_driver` port 5174).

**Spec:** `docs/superpowers/specs/2026-07-04-domain-separation-design.md`

## Global Constraints

- Toàn bộ UI text tiếng Việt — không dịch sang tiếng Anh.
- Không sửa backend (controllers, routes, migrations) — `checkPhone`/`login`/`reset-password` đã nhận optional `role`.
- Giữ `baseURL: '/api'` trong `src/api/axios.ts` — không thêm `VITE_API_URL` branching.
- Design tokens Tailwind hiện có (`primary`, `navy`, `neutral-gray`, `border-gray`...) — copy nguyên class từ code cũ khi di chuyển markup.
- Frontend không có test runner — verify bằng `npx tsc -b`, `vite build`, và kiểm tra thủ công trên browser.
- Chạy lệnh npm/npx trong container: `docker compose exec frontend <cmd>` (hoặc chạy trực tiếp trong `frontend/` nếu có node local).
- Port: customer 5173, driver 5174. Output: customer `dist/`, driver `dist-driver/`.

---

## File Map

| File | Thay đổi |
|---|---|
| `frontend/vite.config.ts` | Refactor: export `createAppConfig(target)`, default = customer |
| `frontend/vite.customer.config.ts` | Tạo mới |
| `frontend/vite.driver.config.ts` | Tạo mới |
| `frontend/package.json` | Scripts `dev:customer/dev:driver/build:customer/build:driver` |
| `frontend/src/bootstrap.tsx` | Tạo mới — createRoot + providers dùng chung |
| `frontend/src/main.tsx` | Rút gọn: gọi `bootstrap(customerRouter)` |
| `frontend/src/main.driver.tsx` | Tạo mới: gọi `bootstrap(driverRouter)` |
| `frontend/src/router/guards.tsx` | Tạo mới — RequireRole/RequireDriverActive/RequireDriverPending |
| `frontend/src/router/customer.tsx` | Tạo mới — routes customer + admin + `/admin/login` |
| `frontend/src/router/driver.tsx` | Tạo mới — routes driver |
| `frontend/src/router/index.tsx` | Xoá (Task 2) |
| `frontend/src/components/driver/GoongTripMap.tsx` | Chuyển sang `components/common/` |
| `frontend/src/hooks/useAuthLogin.ts` | Tạo mới — login state machine theo role |
| `frontend/src/components/auth/AuthShell.tsx` | Tạo mới |
| `frontend/src/components/auth/PhoneInput.tsx` | Tạo mới |
| `frontend/src/components/auth/PasswordInput.tsx` | Tạo mới |
| `frontend/src/components/auth/OtpInputs.tsx` | Tạo mới |
| `frontend/src/pages/customer/LoginPage.tsx` | Tạo mới (thay `pages/LoginPage.tsx`) |
| `frontend/src/pages/driver/LoginPage.tsx` | Tạo mới |
| `frontend/src/pages/admin/LoginPage.tsx` | Tạo mới |
| `frontend/src/pages/LoginPage.tsx` | Xoá (Task 5) |
| `frontend/src/pages/SplashPage.tsx` | Link "Đăng ký làm tài xế" → driver app URL |
| `frontend/.env.example`, `frontend/.env` | Thêm `VITE_DRIVER_APP_URL` |
| `docker-compose.yml` | Thêm service `frontend_driver` |
| `Makefile` | Thêm `logs-fe-driver`, `fe-shell-driver` |
| `deploy/nginx/*.conf` | Tạo mới — reference config production |
| `CLAUDE.md` | Cập nhật services/commands/routes |

---

### Task 1: Vite 2-entry infrastructure

**Files:**
- Modify: `frontend/vite.config.ts`
- Create: `frontend/vite.customer.config.ts`
- Create: `frontend/vite.driver.config.ts`
- Create: `frontend/src/bootstrap.tsx`
- Create: `frontend/src/main.driver.tsx`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/package.json`

**Interfaces:**
- Consumes: router hiện tại `@/router` (chưa tách — Task 2 mới tách).
- Produces: `createAppConfig(target: 'customer' | 'driver'): UserConfig` export từ `vite.config.ts`; `bootstrap(router: ReturnType<typeof createBrowserRouter>): void` export từ `src/bootstrap.tsx`; npm scripts `dev:customer`, `dev:driver`, `build:customer`, `build:driver`.

- [ ] **Step 1: Refactor `vite.config.ts` thành `createAppConfig(target)`**

Thay toàn bộ nội dung `frontend/vite.config.ts` bằng:

```ts
import { defineConfig, type Plugin, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export type AppTarget = 'customer' | 'driver'

const APPS = {
  customer: {
    entry: '/src/main.tsx',
    port: 5173,
    outDir: 'dist',
    title: 'Save Go',
    name: 'Save Go',
    shortName: 'SaveGo',
    description: 'Đặt xe sân bay — Nhanh, minh bạch, tiện lợi',
  },
  driver: {
    entry: '/src/main.driver.tsx',
    port: 5174,
    outDir: 'dist-driver',
    title: 'Save Go Tài Xế',
    name: 'Save Go Tài Xế',
    shortName: 'SaveGo Tài Xế',
    description: 'Ứng dụng tài xế Save Go — Nhận cuốc sân bay',
  },
} as const

// Swap entry script + title/meta trong index.html theo app target —
// giữ 1 index.html duy nhất để dev server và SPA fallback hoạt động chuẩn
function appEntryPlugin(target: AppTarget): Plugin {
  const app = APPS[target]
  return {
    name: 'app-entry',
    transformIndexHtml(html) {
      return html
        .replace('/src/main.tsx', app.entry)
        .replace(/<title>.*<\/title>/, `<title>${app.title}</title>`)
        .replace('content="SaveGo"', `content="${app.shortName}"`)
    },
  }
}

export function createAppConfig(target: AppTarget): UserConfig {
  const app = APPS[target]
  return {
    plugins: [
      appEntryPlugin(target),
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        includeAssets: ['favicon.ico', 'icons/*.png'],
        manifest: {
          name: app.name,
          short_name: app.shortName,
          description: app.description,
          theme_color: '#006a36',
          background_color: '#F8FAF9',
          display: 'standalone',
          orientation: 'portrait',
          scope: '/',
          start_url: '/',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: { '@': path.resolve(__dirname, 'src') },
    },
    build: { outDir: app.outDir },
    server: {
      host: true,
      port: app.port,
      allowedHosts: ['.ngrok-free.app', '.ngrok.io'],
      proxy: {
        '/api': { target: 'http://nginx', changeOrigin: true },
      },
    },
  }
}

// `vite` không --config vẫn chạy app customer (docker service `frontend` hiện tại)
export default defineConfig(createAppConfig('customer'))
```

- [ ] **Step 2: Tạo 2 config file mỏng**

`frontend/vite.customer.config.ts`:

```ts
import { defineConfig } from 'vite'
import { createAppConfig } from './vite.config'

export default defineConfig(createAppConfig('customer'))
```

`frontend/vite.driver.config.ts`:

```ts
import { defineConfig } from 'vite'
import { createAppConfig } from './vite.config'

export default defineConfig(createAppConfig('driver'))
```

- [ ] **Step 3: Tách `bootstrap.tsx`, rút gọn `main.tsx`, tạo `main.driver.tsx`**

Tạo `frontend/src/bootstrap.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, type RouterProviderProps } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useUiStore } from '@/stores/ui'
import type { BeforeInstallPromptEvent } from '@/stores/ui'
import './index.css'

type AppRouter = RouterProviderProps['router']

export function bootstrap(router: AppRouter) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: 1, staleTime: 30_000 },
    },
  })

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    useUiStore.getState().setDeferredInstallPrompt(e as BeforeInstallPromptEvent)
  })

  window.addEventListener('appinstalled', () => {
    useUiStore.getState().setDeferredInstallPrompt(null)
    useUiStore.getState().setInstalled(true)
  })

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  )
}
```

Thay toàn bộ `frontend/src/main.tsx` bằng:

```tsx
import { bootstrap } from '@/bootstrap'
import { router } from '@/router'

bootstrap(router)
```

Tạo `frontend/src/main.driver.tsx` (tạm thời cùng router — Task 2 tách):

```tsx
import { bootstrap } from '@/bootstrap'
import { router } from '@/router'

bootstrap(router)
```

- [ ] **Step 4: Cập nhật npm scripts**

Trong `frontend/package.json`, thay block `"scripts"` bằng:

```json
"scripts": {
  "dev": "vite --host",
  "dev:customer": "vite --host --config vite.customer.config.ts",
  "dev:driver": "vite --host --config vite.driver.config.ts",
  "build": "tsc -b && vite build",
  "build:customer": "tsc -b && vite build --config vite.customer.config.ts",
  "build:driver": "tsc -b && vite build --config vite.driver.config.ts",
  "preview": "vite preview",
  "lint": "eslint ."
},
```

(`dev`/`build` giữ nguyên = customer, để docker service `frontend` hiện tại không phải đổi command.)

- [ ] **Step 5: Verify typecheck + build cả 2 app**

```bash
docker compose exec frontend npx tsc -b
docker compose exec frontend npm run build:customer
docker compose exec frontend npm run build:driver
ls frontend/dist/index.html frontend/dist-driver/index.html
grep -o '<title>[^<]*</title>' frontend/dist/index.html frontend/dist-driver/index.html
```

Expected: cả 3 lệnh exit 0; cả 2 `index.html` tồn tại; title lần lượt `Save Go` và `Save Go Tài Xế`. Kiểm tra thêm: `grep 'main.driver' frontend/dist-driver/index.html` phải có match (script entry đã swap, dạng bundle hash).

- [ ] **Step 6: Verify dev server driver chạy được**

```bash
docker compose exec frontend sh -c "npm run dev:driver & PID=\$!; sleep 8; wget -qO- http://localhost:5174/ | grep -o '<title>[^<]*</title>'; kill \$PID"
```

Expected: in ra `<title>Save Go Tài Xế</title>`.

- [ ] **Step 7: Commit**

```bash
git add frontend/vite.config.ts frontend/vite.customer.config.ts frontend/vite.driver.config.ts \
  frontend/src/bootstrap.tsx frontend/src/main.tsx frontend/src/main.driver.tsx frontend/package.json
git commit -m "feat: two vite build targets (customer/driver) with shared createAppConfig"
```

---

### Task 2: Tách router customer/driver

**Files:**
- Create: `frontend/src/router/guards.tsx`
- Create: `frontend/src/router/customer.tsx`
- Create: `frontend/src/router/driver.tsx`
- Delete: `frontend/src/router/index.tsx`
- Modify: `frontend/src/main.tsx`, `frontend/src/main.driver.tsx`
- Modify: `frontend/src/pages/SplashPage.tsx:73-81`
- Modify: `frontend/src/pages/customer/BookingStatusPage.tsx:15`
- Move: `frontend/src/components/driver/GoongTripMap.tsx` → `frontend/src/components/common/GoongTripMap.tsx`
- Modify: `frontend/.env.example`, `frontend/.env`

**Interfaces:**
- Consumes: `bootstrap(router)` từ Task 1; tất cả page/layout hiện có.
- Produces: `export const router` từ `router/customer.tsx` và `router/driver.tsx`; `RequireRole`, `RequireDriverActive`, `RequireDriverPending` từ `router/guards.tsx`. Route `/login` trong cả 2 router tạm dùng `pages/LoginPage.tsx` cũ (Task 3–4 thay).

- [ ] **Step 1: Tạo `router/guards.tsx`** (chuyển nguyên văn 3 guard từ `router/index.tsx:34-58`, thêm export)

```tsx
import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'

export function RequireRole({ role }: { role: App.Role }) {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== role) return <Navigate to="/" replace />
  return <Outlet />
}

// Chỉ cho driver đã active vào
export function RequireDriverActive() {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'driver') return <Navigate to="/" replace />
  if (user.approval_status === 'pending' || user.approval_status === 'blocked')
    return <Navigate to="/driver/pending" replace />
  return <Outlet />
}

// Chỉ cho driver pending/blocked vào /driver/pending
export function RequireDriverPending() {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'driver') return <Navigate to="/" replace />
  if (user.approval_status === 'active') return <Navigate to="/driver/trips" replace />
  return <Outlet />
}
```

- [ ] **Step 2: Tạo `router/customer.tsx`**

GuestOnly ở đây chỉ biết home của customer/admin; role lạ (token driver cũ trong storage) → cho xem trang guest thay vì redirect vòng lặp.

```tsx
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { RequireRole } from '@/router/guards'
import CustomerLayout from '@/layouts/CustomerLayout'
import AdminLayout from '@/layouts/AdminLayout'
import SplashPage from '@/pages/SplashPage'
import LoginPage from '@/pages/LoginPage'
import RegisterPage from '@/pages/RegisterPage'
import BookingFormPage from '@/pages/customer/BookingFormPage'
import BookingStatusPage from '@/pages/customer/BookingStatusPage'
import BookingHistoryPage from '@/pages/customer/BookingHistoryPage'
import CustomerProfilePage from '@/pages/customer/ProfilePage'
import CustomerNotificationsPage from '@/pages/customer/NotificationsPage'
import CustomerStatsPage from '@/pages/customer/StatsPage'
import CollaboratorWalletPage from '@/pages/customer/CollaboratorWalletPage'
import AdminDashboardPage from '@/pages/admin/DashboardPage'
import DriversPage from '@/pages/admin/DriversPage'
import VouchersPage from '@/pages/admin/VouchersPage'
import RevenuePage from '@/pages/admin/RevenuePage'
import PriceConfigPage from '@/pages/admin/PriceConfigPage'
import AdminCustomersPage from '@/pages/admin/CustomersPage'
import InstallPage from '@/pages/InstallPage'

function GuestOnly() {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Outlet />
  if (user.role === 'customer') return <Navigate to="/customer/booking" replace />
  if (user.role === 'admin') return <Navigate to="/admin/dashboard" replace />
  return <Outlet /> // role không thuộc app này (vd token driver cũ) — hiện trang guest
}

export const router = createBrowserRouter([
  {
    element: <GuestOnly />,
    children: [
      { path: '/', element: <SplashPage /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },
  {
    element: <RequireRole role="customer" />,
    children: [
      {
        element: <CustomerLayout />,
        children: [
          { path: '/customer/booking', element: <BookingFormPage /> },
          { path: '/customer/booking/:id', element: <BookingStatusPage /> },
          { path: '/customer/history', element: <BookingHistoryPage /> },
          { path: '/customer/stats', element: <CustomerStatsPage /> },
          { path: '/customer/notifications', element: <CustomerNotificationsPage /> },
          { path: '/customer/profile', element: <CustomerProfilePage /> },
          { path: '/customer/collaborator/wallet', element: <CollaboratorWalletPage /> },
        ],
      },
    ],
  },
  {
    element: <RequireRole role="admin" />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { path: '/admin/dashboard', element: <AdminDashboardPage /> },
          { path: '/admin/drivers', element: <DriversPage /> },
          { path: '/admin/vouchers', element: <VouchersPage /> },
          { path: '/admin/revenue', element: <RevenuePage /> },
          { path: '/admin/prices', element: <PriceConfigPage /> },
          { path: '/admin/customers', element: <AdminCustomersPage /> },
        ],
      },
    ],
  },
  { path: '/install', element: <InstallPage /> },
  { path: '*', element: <Navigate to="/" replace /> },
])
```

(Route `/admin/login` thêm ở Task 5 khi có `pages/admin/LoginPage.tsx`.)

- [ ] **Step 3: Tạo `router/driver.tsx`**

```tsx
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { RequireDriverActive, RequireDriverPending } from '@/router/guards'
import DriverLayout from '@/layouts/DriverLayout'
import LoginPage from '@/pages/LoginPage'
import DriverRegisterPage from '@/pages/DriverRegisterPage'
import TripListPage from '@/pages/driver/TripListPage'
import TripDetailPage from '@/pages/driver/TripDetailPage'
import TripHistoryPage from '@/pages/driver/TripHistoryPage'
import WalletPage from '@/pages/driver/WalletPage'
import TopUpPage from '@/pages/driver/TopUpPage'
import DriverProfilePage from '@/pages/driver/ProfilePage'
import DriverNotificationsPage from '@/pages/driver/NotificationsPage'
import DriverStatsPage from '@/pages/driver/StatsPage'
import DriverPendingPage from '@/pages/driver/DriverPendingPage'
import InstallPage from '@/pages/InstallPage'

function GuestOnly() {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Outlet />
  if (user.role === 'driver') {
    if (user.approval_status === 'pending' || user.approval_status === 'blocked')
      return <Navigate to="/driver/pending" replace />
    return <Navigate to="/driver/trips" replace />
  }
  return <Outlet /> // role không thuộc app này — hiện trang guest
}

export const router = createBrowserRouter([
  {
    element: <GuestOnly />,
    children: [
      { path: '/', element: <Navigate to="/login" replace /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/register/driver', element: <DriverRegisterPage /> },
    ],
  },
  {
    element: <RequireDriverPending />,
    children: [
      { path: '/driver/pending', element: <DriverPendingPage /> },
    ],
  },
  {
    element: <RequireDriverActive />,
    children: [
      {
        element: <DriverLayout />,
        children: [
          { path: '/driver/trips', element: <TripListPage /> },
          { path: '/driver/trips/history', element: <TripHistoryPage /> },
          { path: '/driver/trips/:id', element: <TripDetailPage /> },
          { path: '/driver/wallet', element: <WalletPage /> },
          { path: '/driver/wallet/topup', element: <TopUpPage /> },
          { path: '/driver/stats', element: <DriverStatsPage /> },
          { path: '/driver/notifications', element: <DriverNotificationsPage /> },
          { path: '/driver/profile', element: <DriverProfilePage /> },
        ],
      },
    ],
  },
  { path: '/install', element: <InstallPage /> },
  { path: '*', element: <Navigate to="/" replace /> },
])
```

- [ ] **Step 4: Xoá `router/index.tsx`, cập nhật 2 entry**

```bash
rm frontend/src/router/index.tsx
```

`frontend/src/main.tsx`:

```tsx
import { bootstrap } from '@/bootstrap'
import { router } from '@/router/customer'

bootstrap(router)
```

`frontend/src/main.driver.tsx`:

```tsx
import { bootstrap } from '@/bootstrap'
import { router } from '@/router/driver'

bootstrap(router)
```

- [ ] **Step 5: Chuyển `GoongTripMap` sang `components/common/`**

```bash
git mv frontend/src/components/driver/GoongTripMap.tsx frontend/src/components/common/GoongTripMap.tsx
```

Cập nhật 2 chỗ import (tìm bằng `grep -rn "components/driver/GoongTripMap" frontend/src`):
- `frontend/src/pages/customer/BookingStatusPage.tsx:15` → `lazy(() => import('@/components/common/GoongTripMap'))`
- Trong `frontend/src/pages/driver/TripDetailPage.tsx` (nếu grep ra) → đổi tương tự.

- [ ] **Step 6: SplashPage — link đăng ký tài xế trỏ sang driver app**

Thêm `VITE_DRIVER_APP_URL` vào `frontend/.env` và `frontend/.env.example`:

```
VITE_DRIVER_APP_URL=http://localhost:5174
```

(Production sẽ set `https://driver.savego.com.vn`.)

Trong `frontend/src/pages/SplashPage.tsx`, thay block (dòng ~73–81):

```tsx
      {/* Driver registration link */}
      <p className="text-center text-[13px]">
        <button
          onClick={() => navigate('/register/driver')}
          className="text-white/70 underline underline-offset-2"
        >
          Đăng ký làm tài xế
        </button>
      </p>
```

bằng:

```tsx
      {/* Driver registration link — driver app là subdomain riêng */}
      <p className="text-center text-[13px]">
        <a
          href={`${import.meta.env.VITE_DRIVER_APP_URL ?? 'http://localhost:5174'}/register/driver`}
          className="text-white/70 underline underline-offset-2"
        >
          Đăng ký làm tài xế
        </a>
      </p>
```

- [ ] **Step 7: Verify build + smoke test cả 2 app**

```bash
docker compose exec frontend npx tsc -b
docker compose exec frontend npm run build:customer
docker compose exec frontend npm run build:driver
```

Expected: exit 0 cả 3. Sau đó smoke test dev:

```bash
# customer (service frontend đang chạy): mở http://localhost:5173
#  - / hiện Splash; /login hiện LoginPage; /driver/trips → redirect về /
# driver:
docker compose exec frontend sh -c "npm run dev:driver & PID=\$!; sleep 8; wget -qO- http://localhost:5174/login >/dev/null && echo OK; kill \$PID"
```

Expected: `OK`. Kiểm tra thủ công http://localhost:5174 (nếu chạy dev:driver): `/` redirect `/login`; `/customer/booking` → redirect `/` → `/login`.

- [ ] **Step 8: Commit**

```bash
git add -A frontend/src frontend/.env.example
git commit -m "feat: split router into customer and driver apps with shared guards"
```

---

### Task 3: Hook `useAuthLogin` + auth components + customer LoginPage

**Files:**
- Create: `frontend/src/hooks/useAuthLogin.ts`
- Create: `frontend/src/components/auth/AuthShell.tsx`
- Create: `frontend/src/components/auth/PhoneInput.tsx`
- Create: `frontend/src/components/auth/PasswordInput.tsx`
- Create: `frontend/src/components/auth/OtpInputs.tsx`
- Create: `frontend/src/pages/customer/LoginPage.tsx`
- Modify: `frontend/src/router/customer.tsx` (import LoginPage mới)

**Interfaces:**
- Consumes: `checkPhoneApi`, `loginApi`, `resetPasswordApi`, `sendOtp` từ `@/api/auth`; `useAuthStore`, `useUiStore`; `registerPushSubscription` từ `@/push`.
- Produces (Task 4–5 dùng lại nguyên các API này):
  - `useAuthLogin(role: App.Role)` trả về: `{ step, setStep, phone, setPhone, password, setPassword, showPwd, setShowPwd, otp, countdown, otpRefs, pwdRef, pwdValid, checkMutation, loginMutation, resetMutation, sendMutation, doSendOtp, resendOtp, handleOtpChange, handleOtpKeyDown, handleBack, onAuthSuccess }`
  - `type LoginStep = 'phone' | 'password' | 'otp' | 'set-password' | 'no-role'`
  - `<AuthShell title sub onBack brandSub? children>`, `<PhoneInput value onChange onEnter?>`, `<PasswordInput label value onChange show onToggle onEnter? inputRef? hint?>`, `<OtpInputs otp otpRefs onChange onKeyDown countdown onResend>`

- [ ] **Step 1: Tạo `hooks/useAuthLogin.ts`**

State machine giống `pages/LoginPage.tsx` cũ nhưng: bỏ bước `role-picker`; `checkPhone` xét `data.roles.includes(role)` → `password` hoặc `no-role`; mọi mutation luôn gửi `role`.

```ts
import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { sendOtp, loginApi, resetPasswordApi, checkPhoneApi } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { registerPushSubscription } from '@/push'

export type LoginStep = 'phone' | 'password' | 'otp' | 'set-password' | 'no-role'

type ApiError = { response?: { status?: number; data?: { code?: string; message?: string } } }

export function useAuthLogin(role: App.Role) {
  const navigate  = useNavigate()
  const setAuth   = useAuthStore((s) => s.setAuth)
  const showToast = useUiStore((s) => s.showToast)

  const [step, setStep]           = useState<LoginStep>('phone')
  const [phone, setPhone]         = useState('')
  const [password, setPassword]   = useState('')
  const [showPwd, setShowPwd]     = useState(false)
  const [otp, setOtp]             = useState(['', '', '', '', '', ''])
  const [countdown, setCountdown] = useState(0)
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])
  const pwdRef  = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  useEffect(() => {
    if (step === 'password' || step === 'set-password') {
      setTimeout(() => pwdRef.current?.focus(), 100)
    }
    if (step === 'otp') {
      setTimeout(() => otpRefs.current[0]?.focus(), 100)
    }
  }, [step])

  const onAuthSuccess = ({ data }: { data: { user: App.User; token: string } }) => {
    setAuth(data.user, data.token)
    registerPushSubscription()
    const { role: userRole, needs_onboarding } = data.user
    if (userRole === 'customer') navigate('/customer/booking')
    else if (userRole === 'driver') navigate(needs_onboarding ? '/driver/profile' : '/driver/trips')
    else navigate('/admin/dashboard')
  }

  const sendMutation = useMutation({
    mutationFn: () => sendOtp(phone, 'reset'),
    onSuccess: () => setCountdown(45),
    onError: (err: ApiError) => {
      showToast(err.response?.data?.message ?? 'Gửi OTP thất bại. Vui lòng thử lại.', 'error')
    },
  })

  const doSendOtp = () => {
    setOtp(['', '', '', '', '', ''])
    setPassword('')
    sendMutation.mutate(undefined, { onSuccess: () => setStep('otp') })
  }

  const resendOtp = () => {
    setOtp(['', '', '', '', '', ''])
    sendMutation.mutate()
  }

  const loginMutation = useMutation({
    mutationFn: () => loginApi(phone, password, role),
    onSuccess: onAuthSuccess,
    onError: (err: ApiError) => {
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
  })

  const resetMutation = useMutation({
    mutationFn: () => resetPasswordApi(phone, otp.join(''), password, role),
    onSuccess: onAuthSuccess,
    onError: (err: ApiError) => {
      showToast(err.response?.data?.message ?? 'Có lỗi xảy ra.', 'error')
    },
  })

  const checkMutation = useMutation({
    mutationFn: () => checkPhoneApi(phone),
    onSuccess: ({ data }) => {
      if (data.roles.includes(role)) setStep('password')
      else setStep('no-role') // số tồn tại nhưng không có role của app này
    },
    onError: (err: ApiError) => {
      if (err.response?.status === 422) setStep('no-role') // số chưa đăng ký bất kỳ role nào
      else showToast(err.response?.data?.message ?? 'Có lỗi xảy ra.', 'error')
    },
  })

  const handleOtpChange = (idx: number, val: string) => {
    if (!/^\d?$/.test(val)) return
    const next = [...otp]
    next[idx] = val
    setOtp(next)
    if (val && idx < 5) otpRefs.current[idx + 1]?.focus()
    if (next.every((d) => d !== '')) setStep('set-password')
  }

  const handleOtpKeyDown = (idx: number, e: KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) otpRefs.current[idx - 1]?.focus()
  }

  const handleBack = () => {
    if (step === 'phone')             navigate(-1)
    else if (step === 'set-password') setStep('otp')
    else                              setStep('phone') // password | otp | no-role
  }

  const pwdValid = /^\d{6}$/.test(password)

  return {
    step, setStep, phone, setPhone, password, setPassword,
    showPwd, setShowPwd, otp, countdown, otpRefs, pwdRef, pwdValid,
    checkMutation, loginMutation, resetMutation, sendMutation,
    doSendOtp, resendOtp, handleOtpChange, handleOtpKeyDown, handleBack, onAuthSuccess,
  }
}
```

- [ ] **Step 2: Tạo `components/auth/AuthShell.tsx`** (khung trang: back button + brand + heading; markup copy từ LoginPage cũ dòng 156–182)

```tsx
import type { ReactNode } from 'react'
import ToastContainer from '@/components/common/Toast'

export default function AuthShell({
  title,
  sub,
  onBack,
  brandSub = 'Airport Transfer',
  children,
}: {
  title: string
  sub: string
  onBack: () => void
  brandSub?: string
  children: ReactNode
}) {
  return (
    <div className="min-h-svh bg-white flex flex-col w-full">
      <ToastContainer />
      {/* Top bar */}
      <div className="px-4 pt-14 pb-2 safe-top flex items-center">
        <button onClick={onBack} className="w-10 h-10 flex items-center justify-center text-navy">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
      </div>

      <div className="flex-1 px-6 pt-4 flex flex-col gap-6">
        {/* Brand + heading */}
        <div>
          <div className="flex items-center gap-3 mb-7">
            <div className="w-12 h-12 rounded-logo bg-primary-tint flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-primary" style={{ fontSize: 26, fontVariationSettings: "'FILL' 1" }}>
                directions_car
              </span>
            </div>
            <div>
              <p className="text-primary font-bold text-[20px] leading-none tracking-tight">Save Go</p>
              <p className="text-neutral-gray text-[11px] tracking-widest uppercase mt-0.5">{brandSub}</p>
            </div>
          </div>
          <h1 className="text-navy font-bold text-[28px] leading-tight mb-2">{title}</h1>
          <p className="text-neutral-gray text-sm">{sub}</p>
        </div>

        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Tạo `components/auth/PhoneInput.tsx`** (markup copy từ LoginPage cũ dòng 212–228)

```tsx
export default function PhoneInput({
  value,
  onChange,
  onEnter,
}: {
  value: string
  onChange: (v: string) => void
  onEnter?: () => void
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-neutral-gray uppercase tracking-wider mb-2">Số điện thoại</p>
      <div
        className="flex items-center bg-white overflow-hidden h-[52px]"
        style={{ border: '1.5px solid #006a36', borderRadius: 8, boxShadow: '0 0 0 4px rgba(0,106,54,0.18)' }}
      >
        <span className="px-4 text-navy font-semibold text-sm border-r border-border-gray h-full flex items-center">🇻🇳 +84</span>
        <input
          type="tel"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
          placeholder="9xx xxx xxx"
          className="flex-1 px-4 outline-none text-navy text-[17px] font-semibold tracking-wider bg-transparent"
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Tạo `components/auth/PasswordInput.tsx`** (markup copy từ LoginPage cũ dòng 276–301, dùng cho cả `password` và `set-password`)

```tsx
import type { RefObject } from 'react'

export default function PasswordInput({
  label,
  value,
  onChange,
  show,
  onToggle,
  onEnter,
  inputRef,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  show: boolean
  onToggle: () => void
  onEnter?: () => void
  inputRef?: RefObject<HTMLInputElement | null>
  hint?: string
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-neutral-gray uppercase tracking-wider mb-2">{label}</p>
      <div className="relative">
        <input
          ref={inputRef}
          type={show ? 'text' : 'password'}
          inputMode="numeric"
          maxLength={6}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
          onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
          placeholder="••••••"
          className="w-full h-[52px] border-[1.5px] border-primary rounded-input px-4 pr-12 text-navy text-2xl tracking-[0.4em] outline-none focus:shadow-[0_0_0_4px_rgba(0,106,54,0.18)] transition-shadow"
          style={{ fontFamily: 'monospace' }}
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-gray"
        >
          <span className="material-symbols-outlined text-[20px]">
            {show ? 'visibility_off' : 'visibility'}
          </span>
        </button>
      </div>
      {hint && <p className="text-[11px] text-neutral-gray mt-1.5">{hint}</p>}
    </div>
  )
}
```

- [ ] **Step 5: Tạo `components/auth/OtpInputs.tsx`** (markup copy từ LoginPage cũ dòng 326–360)

```tsx
import type { KeyboardEvent, RefObject } from 'react'

export default function OtpInputs({
  otp,
  otpRefs,
  onChange,
  onKeyDown,
  countdown,
  onResend,
}: {
  otp: string[]
  otpRefs: RefObject<(HTMLInputElement | null)[]>
  onChange: (idx: number, val: string) => void
  onKeyDown: (idx: number, e: KeyboardEvent) => void
  countdown: number
  onResend: () => void
}) {
  return (
    <>
      <div className="flex gap-2 justify-center">
        {otp.map((d, i) => (
          <input
            key={i}
            ref={(el) => { otpRefs.current[i] = el }}
            type="tel"
            maxLength={1}
            value={d}
            onChange={(e) => onChange(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            className="w-12 h-14 text-center text-xl font-bold border-[1.5px] border-border-gray rounded-input outline-none focus:border-primary focus:shadow-[0_0_0_4px_rgba(0,106,54,0.18)] text-navy transition-shadow"
          />
        ))}
      </div>

      <p className="text-center text-sm text-neutral-gray">
        {countdown > 0
          ? `Gửi lại mã sau ${countdown}s`
          : (
            <button onClick={onResend} className="text-primary font-medium">
              Gửi lại mã OTP
            </button>
          )
        }
      </p>
    </>
  )
}
```

- [ ] **Step 6: Tạo `pages/customer/LoginPage.tsx`**

```tsx
import { Link, useNavigate } from 'react-router-dom'
import { loginApi } from '@/api/auth'
import { useAuthLogin, type LoginStep } from '@/hooks/useAuthLogin'
import Button from '@/components/common/Button'
import AuthShell from '@/components/auth/AuthShell'
import PhoneInput from '@/components/auth/PhoneInput'
import PasswordInput from '@/components/auth/PasswordInput'
import OtpInputs from '@/components/auth/OtpInputs'

const DEV_MOCK = import.meta.env.VITE_MOCK === 'true' || false
const DEV_PASS = '000000'
const DEV_ACCOUNT = { label: 'Khách Hàng', phone: '0901234567' }

export default function LoginPage() {
  const navigate = useNavigate()
  const auth = useAuthLogin('customer')
  const {
    step, setStep, phone, setPhone, password, setPassword,
    showPwd, setShowPwd, otp, countdown, otpRefs, pwdRef, pwdValid,
    checkMutation, loginMutation, resetMutation, sendMutation,
    doSendOtp, resendOtp, handleOtpChange, handleOtpKeyDown, handleBack, onAuthSuccess,
  } = auth

  const heading: Record<LoginStep, { title: string; sub: string }> = {
    'phone':        { title: 'Đăng nhập', sub: 'Nhập số điện thoại đã đăng ký' },
    'password':     { title: 'Nhập mật khẩu', sub: `Mật khẩu 6 chữ số của tài khoản ${phone}` },
    'otp':          { title: 'Xác minh để đặt lại', sub: `Nhập mã OTP được gửi đến ${phone}` },
    'set-password': { title: 'Mật khẩu mới', sub: 'Mật khẩu gồm 6 chữ số' },
    'no-role':      { title: 'Chưa có tài khoản', sub: `Số ${phone} chưa đăng ký tài khoản khách hàng.` },
  }
  const { title, sub } = heading[step]

  return (
    <AuthShell title={title} sub={sub} onBack={handleBack}>
      {step === 'phone' && (
        <>
          {DEV_MOCK && (
            <div className="flex flex-col gap-2">
              <button
                disabled={loginMutation.isPending}
                onClick={() => {
                  setPhone(DEV_ACCOUNT.phone)
                  setPassword(DEV_PASS)
                  loginApi(DEV_ACCOUNT.phone, DEV_PASS, 'customer').then(onAuthSuccess)
                }}
                className="w-full py-3 rounded-card border border-border-soft bg-primary-tint text-navy text-sm font-medium flex items-center justify-between px-4 disabled:opacity-50"
              >
                <span>{DEV_ACCOUNT.label}</span>
                <span className="text-xs text-neutral-gray">{DEV_ACCOUNT.phone}</span>
              </button>
              <div className="flex items-center gap-2 my-1">
                <div className="flex-1 h-px bg-border-gray" />
                <span className="text-xs text-neutral-gray">hoặc nhập thủ công</span>
                <div className="flex-1 h-px bg-border-gray" />
              </div>
            </div>
          )}

          <PhoneInput
            value={phone}
            onChange={setPhone}
            onEnter={() => phone.length >= 9 && checkMutation.mutate()}
          />

          <div className="flex flex-col gap-3">
            <Button
              fullWidth size="lg"
              loading={checkMutation.isPending}
              disabled={phone.length < 9}
              onClick={() => checkMutation.mutate()}
            >
              Đăng nhập
            </Button>
            <p className="text-center text-sm text-neutral-gray">
              Chưa có tài khoản?{' '}
              <Link to="/register" className="text-primary font-semibold">Đăng ký</Link>
            </p>
          </div>
        </>
      )}

      {step === 'no-role' && (
        <div className="flex flex-col gap-3">
          <Button fullWidth size="lg" onClick={() => navigate('/register')}>
            Đăng ký tài khoản mới
          </Button>
          <button onClick={() => setStep('phone')} className="text-primary text-sm font-medium">
            Dùng số điện thoại khác
          </button>
        </div>
      )}

      {step === 'password' && (
        <>
          <PasswordInput
            label="Mật khẩu"
            value={password}
            onChange={setPassword}
            show={showPwd}
            onToggle={() => setShowPwd((v) => !v)}
            onEnter={() => pwdValid && loginMutation.mutate()}
            inputRef={pwdRef}
          />

          <Button
            fullWidth size="lg"
            loading={loginMutation.isPending}
            disabled={!pwdValid}
            onClick={() => loginMutation.mutate()}
          >
            Đăng nhập
          </Button>

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
        </>
      )}

      {step === 'otp' && (
        <OtpInputs
          otp={otp}
          otpRefs={otpRefs}
          onChange={handleOtpChange}
          onKeyDown={handleOtpKeyDown}
          countdown={countdown}
          onResend={resendOtp}
        />
      )}

      {step === 'set-password' && (
        <>
          <PasswordInput
            label="Mật khẩu mới"
            value={password}
            onChange={setPassword}
            show={showPwd}
            onToggle={() => setShowPwd((v) => !v)}
            onEnter={() => pwdValid && resetMutation.mutate()}
            inputRef={pwdRef}
            hint="Nhập đúng 6 chữ số"
          />

          <Button
            fullWidth size="lg"
            loading={resetMutation.isPending}
            disabled={!pwdValid}
            onClick={() => resetMutation.mutate()}
          >
            Đặt lại mật khẩu
          </Button>
        </>
      )}
    </AuthShell>
  )
}
```

- [ ] **Step 7: Trỏ router customer sang LoginPage mới**

Trong `frontend/src/router/customer.tsx`, đổi:

```tsx
import LoginPage from '@/pages/LoginPage'
```

thành:

```tsx
import LoginPage from '@/pages/customer/LoginPage'
```

- [ ] **Step 8: Verify**

```bash
docker compose exec frontend npx tsc -b
docker compose exec frontend npm run build:customer
```

Expected: exit 0. Kiểm tra thủ công http://localhost:5173/login:
- Nhập số đã đăng ký customer (dev seed `0901234567`) → sang bước mật khẩu, không có role-picker.
- Nhập số chưa đăng ký (vd `0999999999`) → bước "Chưa có tài khoản" + nút "Đăng ký tài khoản mới" → /register.
- Login dev bypass mật khẩu `000000` → vào `/customer/booking`.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/hooks/useAuthLogin.ts frontend/src/components/auth frontend/src/pages/customer/LoginPage.tsx frontend/src/router/customer.tsx
git commit -m "feat: role-scoped auth login hook + customer login page"
```

---

### Task 4: Driver LoginPage

**Files:**
- Create: `frontend/src/pages/driver/LoginPage.tsx`
- Modify: `frontend/src/router/driver.tsx` (import LoginPage mới)

**Interfaces:**
- Consumes: `useAuthLogin('driver')`, `LoginStep`, `AuthShell`, `PhoneInput`, `PasswordInput`, `OtpInputs`, `Button`, `loginApi` — đúng chữ ký như Task 3 Produces.
- Produces: default export `LoginPage` cho router driver.

- [ ] **Step 1: Tạo `pages/driver/LoginPage.tsx`**

Khác customer page ở: `useAuthLogin('driver')`, `brandSub="Dành cho Tài Xế"`, heading `no-role` = "chưa đăng ký tài xế", CTA `no-role` và link đăng ký → `/register/driver`, dev account tài xế.

```tsx
import { Link, useNavigate } from 'react-router-dom'
import { loginApi } from '@/api/auth'
import { useAuthLogin, type LoginStep } from '@/hooks/useAuthLogin'
import Button from '@/components/common/Button'
import AuthShell from '@/components/auth/AuthShell'
import PhoneInput from '@/components/auth/PhoneInput'
import PasswordInput from '@/components/auth/PasswordInput'
import OtpInputs from '@/components/auth/OtpInputs'

const DEV_MOCK = import.meta.env.VITE_MOCK === 'true' || false
const DEV_PASS = '000000'
const DEV_ACCOUNT = { label: 'Tài Xế', phone: '0912345678' }

export default function LoginPage() {
  const navigate = useNavigate()
  const {
    step, setStep, phone, setPhone, password, setPassword,
    showPwd, setShowPwd, otp, countdown, otpRefs, pwdRef, pwdValid,
    checkMutation, loginMutation, resetMutation, sendMutation,
    doSendOtp, resendOtp, handleOtpChange, handleOtpKeyDown, handleBack, onAuthSuccess,
  } = useAuthLogin('driver')

  const heading: Record<LoginStep, { title: string; sub: string }> = {
    'phone':        { title: 'Đăng nhập Tài Xế', sub: 'Nhập số điện thoại tài xế đã đăng ký' },
    'password':     { title: 'Nhập mật khẩu', sub: `Mật khẩu 6 chữ số của tài khoản ${phone}` },
    'otp':          { title: 'Xác minh để đặt lại', sub: `Nhập mã OTP được gửi đến ${phone}` },
    'set-password': { title: 'Mật khẩu mới', sub: 'Mật khẩu gồm 6 chữ số' },
    'no-role':      { title: 'Chưa đăng ký tài xế', sub: `Số ${phone} chưa đăng ký làm tài xế Save Go.` },
  }
  const { title, sub } = heading[step]

  return (
    <AuthShell title={title} sub={sub} onBack={handleBack} brandSub="Dành cho Tài Xế">
      {step === 'phone' && (
        <>
          {DEV_MOCK && (
            <div className="flex flex-col gap-2">
              <button
                disabled={loginMutation.isPending}
                onClick={() => {
                  setPhone(DEV_ACCOUNT.phone)
                  setPassword(DEV_PASS)
                  loginApi(DEV_ACCOUNT.phone, DEV_PASS, 'driver').then(onAuthSuccess)
                }}
                className="w-full py-3 rounded-card border border-border-soft bg-primary-tint text-navy text-sm font-medium flex items-center justify-between px-4 disabled:opacity-50"
              >
                <span>{DEV_ACCOUNT.label}</span>
                <span className="text-xs text-neutral-gray">{DEV_ACCOUNT.phone}</span>
              </button>
              <div className="flex items-center gap-2 my-1">
                <div className="flex-1 h-px bg-border-gray" />
                <span className="text-xs text-neutral-gray">hoặc nhập thủ công</span>
                <div className="flex-1 h-px bg-border-gray" />
              </div>
            </div>
          )}

          <PhoneInput
            value={phone}
            onChange={setPhone}
            onEnter={() => phone.length >= 9 && checkMutation.mutate()}
          />

          <div className="flex flex-col gap-3">
            <Button
              fullWidth size="lg"
              loading={checkMutation.isPending}
              disabled={phone.length < 9}
              onClick={() => checkMutation.mutate()}
            >
              Đăng nhập
            </Button>
            <p className="text-center text-sm text-neutral-gray">
              Chưa có tài khoản tài xế?{' '}
              <Link to="/register/driver" className="text-primary font-semibold">Đăng ký tài xế</Link>
            </p>
          </div>
        </>
      )}

      {step === 'no-role' && (
        <div className="flex flex-col gap-3">
          <Button fullWidth size="lg" onClick={() => navigate('/register/driver')}>
            Đăng ký làm tài xế
          </Button>
          <button onClick={() => setStep('phone')} className="text-primary text-sm font-medium">
            Dùng số điện thoại khác
          </button>
        </div>
      )}

      {step === 'password' && (
        <>
          <PasswordInput
            label="Mật khẩu"
            value={password}
            onChange={setPassword}
            show={showPwd}
            onToggle={() => setShowPwd((v) => !v)}
            onEnter={() => pwdValid && loginMutation.mutate()}
            inputRef={pwdRef}
          />

          <Button
            fullWidth size="lg"
            loading={loginMutation.isPending}
            disabled={!pwdValid}
            onClick={() => loginMutation.mutate()}
          >
            Đăng nhập
          </Button>

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
        </>
      )}

      {step === 'otp' && (
        <OtpInputs
          otp={otp}
          otpRefs={otpRefs}
          onChange={handleOtpChange}
          onKeyDown={handleOtpKeyDown}
          countdown={countdown}
          onResend={resendOtp}
        />
      )}

      {step === 'set-password' && (
        <>
          <PasswordInput
            label="Mật khẩu mới"
            value={password}
            onChange={setPassword}
            show={showPwd}
            onToggle={() => setShowPwd((v) => !v)}
            onEnter={() => pwdValid && resetMutation.mutate()}
            inputRef={pwdRef}
            hint="Nhập đúng 6 chữ số"
          />

          <Button
            fullWidth size="lg"
            loading={resetMutation.isPending}
            disabled={!pwdValid}
            onClick={() => resetMutation.mutate()}
          >
            Đặt lại mật khẩu
          </Button>
        </>
      )}
    </AuthShell>
  )
}
```

- [ ] **Step 2: Trỏ router driver sang LoginPage mới**

Trong `frontend/src/router/driver.tsx`, đổi:

```tsx
import LoginPage from '@/pages/LoginPage'
```

thành:

```tsx
import LoginPage from '@/pages/driver/LoginPage'
```

- [ ] **Step 3: Verify**

```bash
docker compose exec frontend npx tsc -b
docker compose exec frontend npm run build:driver
```

Expected: exit 0. Kiểm tra thủ công (chạy `npm run dev:driver`, mở http://localhost:5174/login):
- Số chỉ có role customer (`0901234567`) → bước "Chưa đăng ký tài xế" + nút "Đăng ký làm tài xế" → `/register/driver`.
- Số có role driver (`0912345678`) → sang bước mật khẩu, login `000000` → `/driver/trips` (hoặc `/driver/pending` nếu chưa duyệt).
- Không bao giờ hiện role-picker.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/driver/LoginPage.tsx frontend/src/router/driver.tsx
git commit -m "feat: driver login page with driver-only role check"
```

---

### Task 5: Admin LoginPage + xoá LoginPage cũ

**Files:**
- Create: `frontend/src/pages/admin/LoginPage.tsx`
- Modify: `frontend/src/router/customer.tsx` (thêm route `/admin/login`)
- Delete: `frontend/src/pages/LoginPage.tsx`

**Interfaces:**
- Consumes: `useAuthLogin('admin')` + auth components (chữ ký như Task 3 Produces).
- Produces: route `/admin/login` trong app customer — không có link UI nào trỏ tới (admin gõ URL trực tiếp).

- [ ] **Step 1: Tạo `pages/admin/LoginPage.tsx`**

Tối giản: không có link đăng ký, không có DEV_MOCK; `no-role` chỉ báo lỗi + quay lại nhập số.

```tsx
import { useAuthLogin, type LoginStep } from '@/hooks/useAuthLogin'
import Button from '@/components/common/Button'
import AuthShell from '@/components/auth/AuthShell'
import PhoneInput from '@/components/auth/PhoneInput'
import PasswordInput from '@/components/auth/PasswordInput'
import OtpInputs from '@/components/auth/OtpInputs'

export default function LoginPage() {
  const {
    step, setStep, phone, setPhone, password, setPassword,
    showPwd, setShowPwd, otp, countdown, otpRefs, pwdRef, pwdValid,
    checkMutation, loginMutation, resetMutation, sendMutation,
    doSendOtp, resendOtp, handleOtpChange, handleOtpKeyDown, handleBack,
  } = useAuthLogin('admin')

  const heading: Record<LoginStep, { title: string; sub: string }> = {
    'phone':        { title: 'Quản trị viên', sub: 'Nhập số điện thoại quản trị' },
    'password':     { title: 'Nhập mật khẩu', sub: `Mật khẩu 6 chữ số của tài khoản ${phone}` },
    'otp':          { title: 'Xác minh để đặt lại', sub: `Nhập mã OTP được gửi đến ${phone}` },
    'set-password': { title: 'Mật khẩu mới', sub: 'Mật khẩu gồm 6 chữ số' },
    'no-role':      { title: 'Không có quyền truy cập', sub: `Số ${phone} không phải tài khoản quản trị.` },
  }
  const { title, sub } = heading[step]

  return (
    <AuthShell title={title} sub={sub} onBack={handleBack} brandSub="Quản Trị">
      {step === 'phone' && (
        <>
          <PhoneInput
            value={phone}
            onChange={setPhone}
            onEnter={() => phone.length >= 9 && checkMutation.mutate()}
          />
          <Button
            fullWidth size="lg"
            loading={checkMutation.isPending}
            disabled={phone.length < 9}
            onClick={() => checkMutation.mutate()}
          >
            Đăng nhập
          </Button>
        </>
      )}

      {step === 'no-role' && (
        <button onClick={() => setStep('phone')} className="text-primary text-sm font-medium">
          Dùng số điện thoại khác
        </button>
      )}

      {step === 'password' && (
        <>
          <PasswordInput
            label="Mật khẩu"
            value={password}
            onChange={setPassword}
            show={showPwd}
            onToggle={() => setShowPwd((v) => !v)}
            onEnter={() => pwdValid && loginMutation.mutate()}
            inputRef={pwdRef}
          />
          <Button
            fullWidth size="lg"
            loading={loginMutation.isPending}
            disabled={!pwdValid}
            onClick={() => loginMutation.mutate()}
          >
            Đăng nhập
          </Button>
          <button
            disabled={sendMutation.isPending}
            onClick={() => doSendOtp()}
            className="text-primary text-sm font-medium text-center disabled:opacity-50"
          >
            Quên mật khẩu?
          </button>
        </>
      )}

      {step === 'otp' && (
        <OtpInputs
          otp={otp}
          otpRefs={otpRefs}
          onChange={handleOtpChange}
          onKeyDown={handleOtpKeyDown}
          countdown={countdown}
          onResend={resendOtp}
        />
      )}

      {step === 'set-password' && (
        <>
          <PasswordInput
            label="Mật khẩu mới"
            value={password}
            onChange={setPassword}
            show={showPwd}
            onToggle={() => setShowPwd((v) => !v)}
            onEnter={() => pwdValid && resetMutation.mutate()}
            inputRef={pwdRef}
            hint="Nhập đúng 6 chữ số"
          />
          <Button
            fullWidth size="lg"
            loading={resetMutation.isPending}
            disabled={!pwdValid}
            onClick={() => resetMutation.mutate()}
          >
            Đặt lại mật khẩu
          </Button>
        </>
      )}
    </AuthShell>
  )
}
```

- [ ] **Step 2: Thêm route `/admin/login` vào router customer**

Trong `frontend/src/router/customer.tsx`:

```tsx
import AdminLoginPage from '@/pages/admin/LoginPage'
```

và thêm vào children của `GuestOnly` (sau `/register`):

```tsx
      { path: '/admin/login', element: <AdminLoginPage /> },
```

- [ ] **Step 3: Xoá LoginPage cũ, kiểm tra không còn import**

```bash
rm frontend/src/pages/LoginPage.tsx
grep -rn "pages/LoginPage" frontend/src
```

Expected: grep không ra kết quả nào.

- [ ] **Step 4: Verify**

```bash
docker compose exec frontend npx tsc -b
docker compose exec frontend npm run build:customer
docker compose exec frontend npm run build:driver
```

Expected: exit 0 cả 3. Kiểm tra thủ công http://localhost:5173/admin/login:
- Số admin (dev seed `0923456789`) → mật khẩu → `/admin/dashboard`.
- Số customer thường → "Không có quyền truy cập".
- Không có link nào trong UI trỏ tới `/admin/login` (chỉ vào bằng URL).

- [ ] **Step 5: Commit**

```bash
git add -A frontend/src
git commit -m "feat: hidden admin login route, remove shared role-picker login page"
```

---

### Task 6: Docker Compose service `frontend_driver` + Makefile

**Files:**
- Modify: `docker-compose.yml` (thêm service sau block `frontend`)
- Modify: `Makefile`

**Interfaces:**
- Consumes: npm script `dev:driver` (Task 1), port 5174 từ `vite.driver.config.ts`.
- Produces: container `green_car_frontend_driver` chạy `make up`; make targets `logs-fe-driver`, `fe-shell-driver`.

- [ ] **Step 1: Thêm service vào `docker-compose.yml`**

Ngay sau block `frontend:` (trước `worker:`), thêm:

```yaml
  frontend_driver:
    image: node:22-alpine
    container_name: green_car_frontend_driver
    restart: unless-stopped
    working_dir: /app
    volumes:
      - ./frontend:/app
      - /app/node_modules
    ports:
      - "5174:5174"
    environment:
      - VITE_API_URL=http://localhost:8080/api
    command: sh -c "npm install && npm run dev:driver"
    depends_on:
      - nginx
    networks:
      - app-network
```

(Dùng chung volume `./frontend` với service `frontend` — 2 container share node_modules anonymous volume riêng, `npm install` idempotent.)

- [ ] **Step 2: Thêm Makefile targets**

Trong `Makefile`, thêm vào `.PHONY` dòng đầu: `logs-fe-driver fe-shell-driver`, và thêm sau target `logs-fe`:

```makefile
logs-fe-driver:
	$(DOCKER_COMPOSE) logs -f frontend_driver
```

và sau target `fe-shell`:

```makefile
fe-shell-driver:
	$(DOCKER_COMPOSE) exec frontend_driver sh
```

- [ ] **Step 3: Verify**

```bash
docker compose config --services | grep frontend
make up
sleep 20
docker compose ps --format '{{.Name}} {{.Status}}' | grep frontend
curl -s http://localhost:5173/ | grep -o '<title>[^<]*</title>'
curl -s http://localhost:5174/ | grep -o '<title>[^<]*</title>'
```

Expected: `config --services` liệt kê `frontend` và `frontend_driver`; cả 2 container Up; title lần lượt `Save Go` và `Save Go Tài Xế`.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml Makefile
git commit -m "feat: frontend_driver dev service on port 5174"
```

---

### Task 7: Nginx production reference config + cập nhật docs

**Files:**
- Create: `deploy/nginx/savego-common.conf`
- Create: `deploy/nginx/savego.conf`
- Create: `deploy/nginx/README.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: build outputs `dist/` (customer) và `dist-driver/` (driver) từ Task 1.
- Produces: reference config để copy lên server production — không được mount vào docker-compose dev (dev nginx giữ nguyên `docker/nginx/conf.d/default.conf`).

- [ ] **Step 1: Tạo `deploy/nginx/savego-common.conf`** (snippet include chung cho 2 vhost — SPA fallback + proxy API về Laravel)

```nginx
# Snippet dùng chung cho savego.com.vn và driver.savego.com.vn.
# Yêu cầu biến $backend_root trỏ tới backend/public — set trong vhost nếu path khác.
# Copy vào /etc/nginx/snippets/savego-common.conf trên server.

client_max_body_size 20M;

# SPA — root của server block là dist/ hoặc dist-driver/
location / {
    try_files $uri $uri/ /index.html;
    gzip_static on;
}

# SSE — cần tắt buffering và tăng timeout
location = /api/driver/stream {
    fastcgi_pass unix:/var/run/php/php8.4-fpm.sock;
    fastcgi_param SCRIPT_FILENAME /var/www/green-car-airport/backend/public/index.php;
    include fastcgi_params;
    fastcgi_read_timeout 360;
    fastcgi_buffering off;
}

location = /api/customer/stream {
    fastcgi_pass unix:/var/run/php/php8.4-fpm.sock;
    fastcgi_param SCRIPT_FILENAME /var/www/green-car-airport/backend/public/index.php;
    include fastcgi_params;
    fastcgi_read_timeout 360;
    fastcgi_buffering off;
}

# API → Laravel (mọi request /api/* đi qua public/index.php)
location /api/ {
    fastcgi_pass unix:/var/run/php/php8.4-fpm.sock;
    fastcgi_param SCRIPT_FILENAME /var/www/green-car-airport/backend/public/index.php;
    include fastcgi_params;
    fastcgi_read_timeout 60;
}

location ~ /\.(?!well-known).* {
    deny all;
}
```

- [ ] **Step 2: Tạo `deploy/nginx/savego.conf`** (2 vhost, chỉ khác `server_name` + `root`)

```nginx
# Reference config production — copy vào /etc/nginx/sites-available/ trên server.
# TLS (certbot) cấu hình riêng, ngoài phạm vi file này.

server {
    listen 80;
    server_name savego.com.vn www.savego.com.vn;
    root /var/www/green-car-airport/frontend/dist;
    index index.html;

    include /etc/nginx/snippets/savego-common.conf;

    error_log /var/log/nginx/savego-error.log;
    access_log /var/log/nginx/savego-access.log;
}

server {
    listen 80;
    server_name driver.savego.com.vn;
    root /var/www/green-car-airport/frontend/dist-driver;
    index index.html;

    include /etc/nginx/snippets/savego-common.conf;

    error_log /var/log/nginx/savego-driver-error.log;
    access_log /var/log/nginx/savego-driver-access.log;
}
```

- [ ] **Step 3: Tạo `deploy/nginx/README.md`**

```markdown
# Nginx production — 2 subdomain, 1 backend

- `savego.com.vn` → serve `frontend/dist` (app customer + admin)
- `driver.savego.com.vn` → serve `frontend/dist-driver` (app driver)
- Cả 2 vhost proxy `/api/*` về cùng Laravel backend qua PHP-FPM — backend không phân biệt domain (auth Bearer token).

## Deploy

1. Build 2 bundle:
   ```bash
   cd frontend
   VITE_DRIVER_APP_URL=https://driver.savego.com.vn npm run build:customer
   npm run build:driver
   ```
2. Copy `dist/` và `dist-driver/` lên server (giữ đúng path trong `savego.conf`, hoặc sửa `root` cho khớp).
3. Copy `savego-common.conf` → `/etc/nginx/snippets/`, `savego.conf` → `/etc/nginx/sites-available/` + symlink sang `sites-enabled/`.
4. Sửa đường dẫn `fastcgi_pass` / `SCRIPT_FILENAME` theo layout PHP-FPM thực tế trên server.
5. `nginx -t && systemctl reload nginx`. TLS: chạy certbot cho cả 2 domain.

Lưu ý: DNS cần record cho `driver.savego.com.vn` trỏ về cùng server.
```

- [ ] **Step 4: Cập nhật `CLAUDE.md`**

Các sửa đổi (giữ format bảng hiện có):

1. Bảng **Docker Services** — thêm dòng sau `green_car_frontend`:

```markdown
| `green_car_frontend_driver` | Vite dev server (app tài xế) | **5174** |
```

2. Section **Common Commands** — thêm dưới `make fe-build`:

```markdown
make logs-fe-driver   # follow driver frontend logs
make fe-shell-driver  # sh into driver frontend container

# Frontend builds (2 app targets)
docker compose exec frontend npm run build:customer   # → dist/
docker compose exec frontend npm run build:driver     # → dist-driver/
```

3. Section **Frontend Architecture** — thay đoạn **Routing** bằng:

```markdown
**Routing:** 2 app riêng, mỗi app 1 router + 1 Vite build target:
- `router/customer.tsx` (entry `main.tsx`, port 5173, `dist/`) — Splash, `/login`, `/register`, `/admin/login` (ẩn), `customer/*`, `admin/*`
- `router/driver.tsx` (entry `main.driver.tsx`, port 5174, `dist-driver/`) — `/login`, `/register/driver`, `driver/*`
- `router/guards.tsx` — `RequireRole`, `RequireDriverActive`, `RequireDriverPending` dùng chung; mỗi router có `GuestOnly` riêng theo role của app

Login không còn role-picker: mỗi app hardcode `role` khi gọi `checkPhone`/`login` (hook `useAuthLogin(role)`). Production: `savego.com.vn` = customer+admin, `driver.savego.com.vn` = driver (xem `deploy/nginx/`).
```

4. Bảng **Repository Layout** — cập nhật dòng router:

```markdown
│       ├── router/        # customer.tsx + driver.tsx + guards.tsx (2 app targets)
```

- [ ] **Step 5: Verify**

```bash
docker run --rm -v "$PWD/deploy/nginx/savego.conf:/etc/nginx/conf.d/savego.conf:ro" nginx:1.25-alpine nginx -t 2>&1 || true
```

(Lệnh trên sẽ báo lỗi vì thiếu snippet path trong container — chỉ để bắt lỗi syntax thô; nếu muốn test đủ, mount thêm snippet vào `/etc/nginx/snippets/`. Không bắt buộc pass.)

Kiểm tra chính: đọc lại 2 file conf, xác nhận `root` khác nhau, `include` cùng snippet, không copy-paste lệch nhau.

- [ ] **Step 6: Commit**

```bash
git add deploy/nginx CLAUDE.md
git commit -m "docs: production nginx reference for two-subdomain deploy + CLAUDE.md updates"
```

---

## Checklist tổng kết (end-to-end)

```
[ ] make up → cả frontend (5173) và frontend_driver (5174) chạy
[ ] localhost:5173: Splash → Đăng nhập → số 2-role (0901234567 nếu đã có cả 2 role) → vào thẳng mật khẩu, login ra customer — KHÔNG có role-picker
[ ] localhost:5174: /login → cùng số đó → vào thẳng mật khẩu, login ra driver
[ ] localhost:5174: số chỉ có customer → "Chưa đăng ký tài xế" + CTA /register/driver
[ ] localhost:5173: số chưa đăng ký → "Chưa có tài khoản" + CTA /register
[ ] localhost:5173/admin/login: số admin (0923456789) login → /admin/dashboard
[ ] Splash "Đăng ký làm tài xế" → mở localhost:5174/register/driver
[ ] build:customer + build:driver đều pass; dist/ và dist-driver/ có index.html với đúng title/manifest
[ ] Spot-check 1 flow mỗi role: customer đặt xe, driver xem trips, admin dashboard
```
