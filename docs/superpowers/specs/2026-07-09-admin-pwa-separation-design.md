# Tách App Admin thành PWA riêng — Design Spec

**Date:** 2026-07-09
**Scope:** Tách admin thành build target thứ 3 (`dist-admin/`), chạy trên subdomain riêng `admin.webco.io.vn` với manifest PWA riêng. Gỡ hoàn toàn route `/admin/*` khỏi build customer.

---

## Vấn đề

Sau khi deploy domain-separation (customer + driver tách subdomain), admin vẫn nằm trong build customer dưới route ẩn `/admin/*`, dùng chung manifest PWA của customer (`start_url: '/'`, `scope: '/'`). Khi cài PWA từ trang admin trên `webco.io.vn`, app cài đặt mở ra màn Splash khách hàng — không có app riêng cho admin.

## Mục tiêu

- Build target thứ 3: `admin` (entry `main.admin.tsx`, output `dist-admin/`), chạy trên `admin.webco.io.vn`.
- Manifest PWA riêng: tên "Save Go Admin", `start_url: '/login'`, `scope: '/'` — cài PWA từ subdomain admin luôn mở đúng vào luồng admin.
- Vì subdomain đã phân biệt được app, **bỏ prefix `/admin`** khỏi toàn bộ route admin: `/login`, `/dashboard`, `/drivers`, `/vouchers`, `/revenue`, `/prices`, `/customers`, `/pages`.
- Gỡ hoàn toàn route và code admin khỏi build customer — bundle customer không còn chứa `pages/admin/*`, `AdminLayout`, hay các route `/admin/*`.

## Ngoài phạm vi

- Không đổi API backend — auth Bearer-token domain-agnostic, giống hệt cách driver đã tách trước đó, không cần thay đổi gì ở Laravel.
- Không đổi logic nghiệp vụ của các trang admin (Dashboard, Drivers, Vouchers, Revenue, PriceConfig, Customers, StaticPages) — chỉ di chuyển sang router/build mới và đổi path.
- Route xem trang tĩnh public (`/pages/:slug`, dùng ở customer/driver) **không** mount trên subdomain admin — admin chỉ có `/pages` (CRUD), không cần viewer public.
- Không thiết lập CI/CD build tự động cho 3 bundle — vẫn build + rsync thủ công theo `docs/DEPLOY.md`.

---

## 1. Cấu trúc build

Thêm build target thứ 3 theo đúng pattern `customer`/`driver` đã có trong `frontend/vite.config.ts`:

```ts
const APPS = {
  customer: { ... },
  driver:   { ... },
  admin: {
    entry: '/src/main.admin.tsx',
    port: 5175,
    outDir: 'dist-admin',
    title: 'Save Go Admin',
    name: 'Save Go Admin',
    shortName: 'SaveGo Admin',
    description: 'Quản trị hệ thống Save Go',
  },
} as const
```

Manifest PWA cho admin dùng `start_url: '/login'` (khác `'/'` như customer/driver) — chưa đăng nhập vào thẳng form login admin, đã đăng nhập thì `GuestOnly` tự điều hướng sang `/dashboard`.

```
frontend/
├── vite.admin.config.ts          # MỚI — createAppConfig('admin')
├── src/
│   ├── main.admin.tsx             # MỚI — bootstrap(adminRouter), theo mẫu main.driver.tsx
│   └── router/admin.tsx           # MỚI — routes admin, không prefix /admin
```

`package.json` thêm scripts `dev:admin` (port 5175) và `build:admin` (output `dist-admin/`), theo đúng mẫu `dev:driver`/`build:driver`.

## 2. Router admin (bỏ prefix `/admin`)

`frontend/src/router/admin.tsx` — tái dùng `RequireRole`, `AdminLayout`, các trang `pages/admin/*` đã có sẵn, chỉ đổi path:

```tsx
function GuestOnly() {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Outlet />
  if (user.role === 'admin') return <Navigate to="/dashboard" replace />
  return <Outlet />
}

export const router = createBrowserRouter([
  {
    element: <GuestOnly />,
    children: [
      { path: '/', element: <Navigate to="/login" replace /> },
      { path: '/login', element: <AdminLoginPage /> },
    ],
  },
  {
    element: <RequireRole role="admin" />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { path: '/dashboard', element: <AdminDashboardPage /> },
          { path: '/drivers', element: <DriversPage /> },
          { path: '/vouchers', element: <VouchersPage /> },
          { path: '/revenue', element: <RevenuePage /> },
          { path: '/prices', element: <PriceConfigPage /> },
          { path: '/customers', element: <AdminCustomersPage /> },
          { path: '/pages', element: <StaticPagesPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
```

## 3. Gỡ admin khỏi build customer

`frontend/src/router/customer.tsx`: xoá toàn bộ import `Admin*`/`StaticPagesPage`/`AdminLayout`, xoá nhánh admin trong `GuestOnly` (`if (user.role === 'admin') return <Navigate to="/admin/dashboard" ... />`), xoá toàn bộ route group `RequireRole role="admin"`.

## 4. Sửa các path prefix dùng chung

Vì route admin đổi từ `/admin/X` sang `/X`, 3 nơi tham chiếu path admin phải đổi theo (chỉ ảnh hưởng path admin, không đụng path customer/driver):

- `frontend/src/hooks/useAuthLogin.ts` — nhánh `onAuthSuccess` redirect admin: `navigate('/admin/dashboard')` → `navigate('/dashboard')`.
- `frontend/src/layouts/AdminLayout.tsx` — mảng `TABS` (nav sidebar/bottom-tab): đổi toàn bộ `to: '/admin/...'` → `to: '/...'`.
- `frontend/src/components/common/AppHeader.tsx` — `ROOT_TABS` set và bảng tiêu đề trang: đổi các entry `/admin/...` → `/...`.

## 5. Dev environment

`docker-compose.yml` thêm service `frontend_admin` (port 5175, lệnh `npm run dev:admin`), theo đúng mẫu `frontend_driver`. `Makefile` thêm `logs-fe-admin`, `fe-shell-admin`.

## 6. Deploy production (staging hiện tại)

Nginx vhost `admin.webco.io.vn` — copy nguyên mẫu `driver.webco.io.vn` (đã có), chỉ đổi `server_name` và `root` sang `frontend/dist-admin/`. Cả 3 vhost tiếp tục proxy `/api/` về cùng backend Laravel — không đổi gì ở nginx dùng chung/backend.

Cần DNS A record `admin` → `103.148.57.141` trước khi cấp SSL qua certbot. Cập nhật `docs/DEPLOY.md`: quy trình build/rsync thêm bước cho `dist-admin/`, mục "Tài khoản admin" cập nhật URL từ `webco.io.vn/admin/login` sang `admin.webco.io.vn/login`.

## 7. Kiểm thử

- `npm run build:admin` ra `dist-admin/` với manifest tên "Save Go Admin", `start_url` trỏ `/login`; bundle **không chứa** chuỗi UI Splash/booking của customer.
- `npm run build:customer` sau khi gỡ: bundle **không chứa** chuỗi UI admin (`Tạo trang mới`, tên các trang admin); `tsc -b` không còn import chết nào tới `pages/admin/*`.
- 3 bundle (`dist/`, `dist-driver/`, `dist-admin/`) có hash file khác nhau.
- Trên `admin.webco.io.vn` (hoặc `localhost:5175` lúc dev): `/` → `/login`; đăng nhập `0923456789` → `/dashboard`; các tab nav (`/drivers`, `/vouchers`, `/revenue`, `/prices`, `/customers`, `/pages`) hoạt động đúng, không còn prefix `/admin`.
- Trên `webco.io.vn`: `/admin/login` và mọi route `/admin/*` trả 404 (SPA fallback về Splash/route `*`).
- Cài PWA từ `admin.webco.io.vn` → app cài đặt mở vào `/login` (chưa đăng nhập) hoặc `/dashboard` (đã đăng nhập) — không lạc sang màn khách hàng.
