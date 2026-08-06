# Quản lý quản trị viên từ UI admin

**Ngày:** 2026-08-06
**Trạng thái:** design đã chốt, chờ implementation plan

## Bối cảnh

Hiện không có cách nào tạo admin từ giao diện. Khảo sát code xác nhận:

- `backend/routes/api.php` nhóm `role:admin` chỉ có dashboard, drivers, customers, vouchers, revenue, price-configs, pages, ZNS — **không** route nào tạo user `role=admin`, và không có controller tương ứng trong `app/Http/Controllers/Admin/`.
- `frontend/src/pages/admin/` có 8 trang, không trang nào quản lý tài khoản admin.
- `AuthController::register()` / `registerDriver()` hardcode role, không nhận `role` từ request → không thể đăng ký công khai thành admin (đúng về bảo mật, nhưng cũng đóng luôn mọi lối tạo admin).

Cách duy nhất hiện nay là chạy `php artisan tinker` trên server, ghi ở `docs/DEPLOY.md:117-138`. Việc này chặn khách hàng tự thêm nhân sự vận hành và buộc phải cấp SSH cho mỗi lần thêm người.

## Mục tiêu

Admin đăng nhập vào `admin.greenca.vn` có thể: xem danh sách admin, tạo admin mới (tự đặt mật khẩu), sửa tên, khoá/bỏ khoá admin khác, đặt lại mật khẩu cho admin khác, và tự đổi mật khẩu của mình.

Quyết định nghiệp vụ đã chốt với người dùng:

- **Không có role đặc biệt** — mọi admin ngang quyền, không có super-admin.
- **Gỡ admin = khoá** (`is_blocked`), không xoá khỏi DB. Giữ lịch sử, có thể bỏ khoá.
- **Không tự khoá / tự reset pass chính mình.**
- **Mật khẩu do người tạo đặt**; mọi admin đổi được pass của mình và reset được pass của admin khác.

Ngoài phạm vi: audit log ai tạo/khoá ai; gửi mật khẩu qua ZNS/SMS; phân quyền chi tiết theo màn hình; xoá cứng tài khoản admin.

## Kiến trúc

### Backend

Controller mới `app/Http/Controllers/Admin/AdminUserController.php`. **Không cần migration** — `users.is_blocked` đã tồn tại (đang dùng cho customer).

Route thêm vào nhóm `auth:sanctum` → `role:admin` trong `routes/api.php`:

| Method | Path | Action | Việc |
|---|---|---|---|
| GET | `/admin/admins` | `index` | list `role=admin`, mới nhất trước |
| POST | `/admin/admins` | `store` | tạo admin mới |
| PATCH | `/admin/admins/{user}` | `update` | sửa `name` |
| PATCH | `/admin/admins/{user}/block` | `block` | khoá + xoá token |
| PATCH | `/admin/admins/{user}/unblock` | `unblock` | bỏ khoá |
| POST | `/admin/admins/{user}/password` | `resetPassword` | đặt lại pass cho admin khác |
| POST | `/admin/me/password` | `changeOwnPassword` | tự đổi pass |

**Payload `index`** (mảng phẳng, không dùng API Resource — đúng quy ước repo):

```php
['id', 'name', 'phone', 'is_blocked' => bool, 'is_self' => bool, 'created_at' => 'd/m/Y']
```

`is_self` so `$u->id === $request->user()->id`, để frontend không phải tự suy.

**Ràng buộc chung cho mọi route có `{user}`:** nếu `$user->role !== 'admin'` → 422 `['message' => 'User is not an admin.']` — cùng pattern `CustomerController`.

**Ràng buộc chặn tự thao tác:** `block` và `resetPassword` trả 403 khi `$user->id === $request->user()->id`. Vì admin không tự khoá được mình, luôn tồn tại ≥1 admin hoạt động → không cần thêm luật "không khoá admin cuối cùng".

**Validation:**

- `store`: `name` required|string|max:100; `phone` required|string|max:20; `password` `['required','string','size:6','regex:/^\d{6}$/']` — dùng lại đúng rule của `register`/`resetPassword`.
- `update`: `name` required|string|max:100.
- `resetPassword`: `password` — rule như trên.
- `changeOwnPassword`: `current_password` required|string; `password` — rule như trên.

**Chuẩn hoá + trùng lặp số điện thoại:** `store` chạy `PhoneNumber::normalize()` trước, rồi chặn trùng **chỉ trong phạm vi** `role=admin`:

```php
if (User::where('phone', $phone)->where('role', 'admin')->exists()) → 422
```

Một số điện thoại vẫn được phép vừa là customer/driver vừa là admin — nhất quán với hệ hiện tại (`CustomerAlsoRegistersAsDriverTest` cho phép customer kiêm driver, `login` lọc theo `role`).

**Hash mật khẩu:** `User` **không** có cast `hashed` (`app/Models/User.php` — `$casts` chỉ có `is_blocked`, `is_collaborator`). Mọi chỗ ghi password phải `Hash::make()` thủ công; gán chuỗi thô làm `Hash::check()` fail vĩnh viễn và không đăng nhập được. Đây chính là bẫy đã ghi ở `docs/DEPLOY.md:119-121`.

**`changeOwnPassword`:** verify `Hash::check($request->current_password, $user->password)`, sai → 422 `'Mật khẩu hiện tại không đúng.'`. Nếu user chưa có password (tài khoản cũ tạo bằng tinker mà chưa set) → cũng 422 với message đó. Không revoke token sau khi đổi — người dùng ở lại phiên hiện tại.

**`block`:** `is_blocked = true` rồi `$user->tokens()->delete()` để đá khỏi phiên ngay, đúng cách `CustomerController::block()` đang làm.

### Sửa `AuthController::login` — bắt buộc

`login()` hiện chỉ chặn `is_blocked` khi `role === 'customer'`:

```php
if ($user->role === 'customer' && $user->is_blocked) { ... 403 ... }
```

Không mở rộng cho admin thì nút Khoá vô nghĩa — admin bị khoá đăng nhập lại được ngay. Đổi điều kiện thành `in_array($user->role, ['customer', 'admin'], true) && $user->is_blocked`. Giữ nguyên nhánh riêng của driver (khoá qua `driverProfile.status`, có message kèm lý do).

Check này nằm **trước** dev-bypass mật khẩu nên có hiệu lực ở mọi môi trường.

### Frontend

| File | Thay đổi |
|---|---|
| `src/pages/admin/AdminsPage.tsx` | **mới** — màn quản lý, theo pattern `CustomersPage.tsx` |
| `src/api/admin.ts` | thêm 7 hàm gọi API |
| `src/types.d.ts` | thêm `App.AdminUser` |
| `src/router/admin.tsx` | route `/admins` trong nhóm `RequireRole role="admin"` |
| `src/layouts/AdminLayout.tsx` | thêm `{ to: '/admins', icon: 'admin_panel_settings', label: 'Admin' }` vào `TABS` |

`TABS` dùng chung cho cả sidebar PC và bottom nav mobile → thành 8 tab, mỗi tab ~54px trên khung 430px. Nhãn ngắn `Admin` vừa khổ ở `text-[10px]`.

**`AdminsPage` — cấu trúc:**

- Header trang + nút **"Thêm quản trị viên"** → modal form (React Hook Form + Zod: `name`, `phone`, `password` 6 chữ số, có nút hiện/ẩn mật khẩu).
- Danh sách card, mỗi dòng: tên, SĐT, ngày tạo, badge trạng thái (`Đang hoạt động` / `Đã khoá`).
- Dòng admin khác: **Đổi tên**, **Đặt lại mật khẩu**, **Khoá** / **Bỏ khoá** (khoá có confirm).
- Dòng của chính mình (`is_self`): badge **"Bạn"**, ẩn Khoá và Đặt lại mật khẩu, thay bằng **"Đổi mật khẩu của tôi"** → modal 2 ô (mật khẩu hiện tại + mật khẩu mới).
- Không có ô tìm kiếm — số admin nhỏ, thêm search là thừa.
- Data qua TanStack Query; mutation `onSuccess` → `invalidateQueries(['admin-users'])` + toast qua `useUiStore`, đúng cách các trang admin khác đang làm.

Toàn bộ text tiếng Việt.

## Xử lý lỗi

| Tình huống | Backend | UI |
|---|---|---|
| SĐT đã là admin | 422 | toast "Số điện thoại đã là quản trị viên." |
| Mật khẩu không đủ 6 chữ số | 422 (validation) | lỗi inline dưới ô nhập (Zod chặn trước) |
| Tự khoá / tự reset pass | 403 | không hiện nút, nên chỉ là chốt chặn phía server |
| Pass hiện tại sai | 422 | lỗi inline ở ô "mật khẩu hiện tại" |
| Target không phải admin | 422 | toast lỗi chung |
| Admin bị khoá đăng nhập | 403 `code: blocked` | màn login hiện "Tài khoản đã bị khoá bởi admin." |

## Test

`backend/tests/Feature/AdminUserManagementTest.php`:

1. Admin tạo admin mới → 201, user tồn tại với `role=admin`, và `Hash::check('654321', $u->password)` true.
2. Tạo trùng SĐT đã là admin → 422; SĐT đang là customer thì vẫn tạo được.
3. Tự khoá mình → 403, `is_blocked` không đổi.
4. Khoá admin khác → `is_blocked=true`, token của người đó bị xoá, và `POST /auth/login` với số đó trả 403.
5. Bỏ khoá → login trả 200 trở lại.
6. Reset pass admin khác → hash trên DB khớp pass mới; tự reset qua route đó → 403.
7. Tự đổi pass với `current_password` sai → 422, hash không đổi; đúng → hash đổi.
8. Token customer gọi `GET /admin/admins` → 403.

**Lưu ý về môi trường test:** `phpunit.xml` đặt `APP_ENV=testing`, mà `login()` bật dev-bypass mật khẩu ở `local`/`testing` — nên **không** khẳng định "tạo pass đúng" bằng cách login rồi kỳ vọng 200. Phải assert trực tiếp `Hash::check()` trên bản ghi DB. Ngược lại, test khoá (mục 4) vẫn dùng login được vì check `is_blocked` chạy trước bypass.

## Triển khai

Không có migration → deploy chỉ cần build lại `dist-admin/` và reload PHP-FPM. Sau khi lên production, mục "đổi mật khẩu admin production" còn tồn ở `docs/DEPLOY.md:401` làm được ngay trong UI, và mục "Tạo tài khoản admin" (`DEPLOY.md:117`) chỉ còn cần cho admin **đầu tiên** trên DB trống — cần cập nhật doc để ghi rõ điều đó.
