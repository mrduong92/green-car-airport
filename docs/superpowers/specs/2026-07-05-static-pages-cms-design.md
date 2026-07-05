# Trang tĩnh + Admin CRUD — Design Spec

**Date:** 2026-07-05
**Scope:** Hệ thống trang tĩnh đa trang (slug tự do), admin CRUD nội dung qua rich text editor, trang public không cần đăng nhập trên cả 2 subdomain (customer + driver). Fix 2 link chết `/terms`, `/privacy` đang có sẵn trong flow đăng ký.

---

## Vấn đề

`docs/Bao_gia_cap_nhat.md` (mục B: "Trang tĩnh + Admin CRUD") liệt kê hạng mục Điều khoản dịch vụ + Chính sách bảo mật do admin quản lý nội dung — hiện chưa triển khai gì (xác nhận qua audit trong `TESTS.md`). Đồng thời, `frontend/src/pages/RegisterPage.tsx:351,371` và `frontend/src/pages/DriverRegisterPage.tsx:392,399` đã có sẵn link `href="/privacy"` và `href="/terms"` mở tab mới ở bước xác nhận đăng ký — nhưng các route này chưa tồn tại, nên hiện tại là link chết (404).

## Mục tiêu

- Admin tạo/sửa/ẩn bất kỳ số lượng trang tĩnh nào (slug + tiêu đề + nội dung rich text), không cần sửa code khi thêm trang mới.
- Seed sẵn 2 trang `terms` và `privacy` để khớp link đã có trong flow đăng ký.
- Trang public đọc được không cần đăng nhập, trên cả 2 subdomain (savego.com.vn và driver.savego.com.vn) — vì cả customer app và driver app đều có link trỏ tới.
- Nội dung admin nhập được sanitize để an toàn khi render trên trang public.

## Ngoài phạm vi

- Không có versioning/lịch sử chỉnh sửa — chỉ lưu nội dung hiện tại (giống pattern `PriceConfig`, không phải CMS có draft/revision).
- Không có upload ảnh/media trong nội dung trang — chỉ định dạng văn bản (đậm, tiêu đề, danh sách, link).
- Không đa ngôn ngữ — chỉ tiếng Việt.
- Không có trang danh sách/index public — trang chỉ truy cập được qua URL slug trực tiếp, không duyệt được.

---

## 1. Data model

Migration mới, bảng `static_pages`:

```php
Schema::create('static_pages', function (Blueprint $table) {
    $table->id();
    $table->string('slug', 50)->unique();
    $table->string('title', 150);
    $table->longText('content');
    $table->boolean('is_active')->default(true);
    $table->timestamps();
});
```

`slug` chỉ gồm chữ thường, số, dấu gạch ngang (`^[a-z0-9-]+$`), **không sửa được sau khi tạo** — tránh trường hợp admin đổi slug làm link đã chia sẻ (vd trong `RegisterPage`) bị gãy.

Migration seed sẵn 2 dòng:

| slug | title | content |
|---|---|---|
| `terms` | Điều khoản dịch vụ | placeholder — admin cập nhật sau |
| `privacy` | Chính sách bảo mật | placeholder — admin cập nhật sau |

## 2. Backend API

**Model:** `App\Models\StaticPage` (`slug`, `title`, `content`, `is_active` fillable).

**Admin CRUD** — `App\Http\Controllers\Admin\StaticPageController`, route group `auth:sanctum` → `role:admin`, đăng ký qua `Route::apiResource('/admin/pages', StaticPageController::class)->except(['show'])` — đúng pattern `Route::apiResource('/admin/price-configs', AdminPriceConfigController::class)->except(['show'])` đã dùng cho `PriceConfig` (`routes/api.php:112`):

- `GET /api/admin/pages` — trả toàn bộ trang (kể cả `is_active=false`), cho bảng quản lý admin.
- `POST /api/admin/pages` — tạo trang. Validate: `slug` (`required|string|max:50|regex:/^[a-z0-9-]+$/|unique:static_pages,slug`), `title` (`required|string|max:150`), `content` (`required|string`). Sanitize `content` trước khi lưu.
- `PUT /api/admin/pages/{staticPage}` — sửa. Chỉ nhận `title`, `content`, `is_active` — **`slug` trong payload bị bỏ qua hoàn toàn (`$request->only(['title','content','is_active'])`), không validate rồi từ chối** — đảm bảo không có cách nào đổi được slug qua API này dù client cố gửi lên. Sanitize lại `content` nếu có trong payload.
- `DELETE /api/admin/pages/{staticPage}` — set `is_active=false` (soft-hide, không xoá thật — cùng pattern với `PriceConfigController::destroy`, giữ chỗ slug và tránh 404 đột ngột nếu có link đang cache).

**Public read** — route ngoài `auth:sanctum` (giống `/price-configs`), dùng chung cho cả 2 frontend app:

- `GET /api/pages/{slug}` — trả `{slug, title, content}` cho trang có `is_active=true`. 404 nếu không tồn tại hoặc `is_active=false` (trang ẩn = "chưa publish", admin vẫn sửa được nhưng public không thấy).

**Sanitize:** dùng thư viện HTML purifier phía backend (vd `mews/purifier`) với whitelist thẻ: `p, br, strong, em, h2, h3, ul, ol, li, a[href]`. Áp dụng ở `store` và `update` — sanitize tại thời điểm ghi đảm bảo mọi đường đọc (public page, admin edit form) đều an toàn, không phải sanitize lại ở từng nơi render.

## 3. Frontend — Admin UI

- `frontend/src/api/staticPages.ts` — module mới theo pattern `src/api/*` hiện có: `listPages()`, `createPage(data)`, `updatePage(id, data)`, `deletePage(id)`, `getPublicPage(slug)`.
- `frontend/src/pages/admin/StaticPagesPage.tsx` — trang mới, thêm vào `router/customer.tsx` (route `/admin/pages`) và menu điều hướng admin, cùng nhóm với `VouchersPage`/`PriceConfigPage`. Bảng liệt kê slug, tiêu đề, trạng thái ẩn/hiện, nút "Sửa"; nút "+ Tạo trang mới" mở form tạo (nhập slug + tiêu đề + editor rỗng — trường slug bị khoá/ẩn khi đang sửa trang có sẵn).
- Rich text editor dùng **Tiptap** (`@tiptap/react`, `@tiptap/starter-kit`) — thư viện mới thêm vào `frontend/package.json`, chưa có editor nào trong dự án. Toolbar giới hạn: đậm, nghiêng, H2/H3, danh sách gạch đầu dòng/số, link — khớp với phạm vi "không có rich media".

## 4. Frontend — Trang public + fix link chết

- `frontend/src/pages/StaticPageView.tsx` — component public mới, không cần layout có sidebar/nav (chrome tối giản kiểu `AuthShell`), fetch `getPublicPage(slug)` qua `useParams`, render `title` + `content` (`dangerouslySetInnerHTML` — an toàn vì đã sanitize khi ghi ở backend). Hiển thị "Không tìm thấy trang" khi API trả 404.
- Mount route `/pages/:slug` ở **cả hai** `router/customer.tsx` và `router/driver.tsx`, đặt ở top-level (ngoài `GuestOnly`/`RequireRole`) — truy cập được dù đã đăng nhập hay chưa.
- Cập nhật 2 link chết hiện có, đổi từ `/privacy`/`/terms` sang `/pages/privacy`/`/pages/terms`:
  - `frontend/src/pages/RegisterPage.tsx:351` (`href="/privacy"` → `href="/pages/privacy"`) và dòng tương ứng cho `/terms` (~371)
  - `frontend/src/pages/DriverRegisterPage.tsx:392` (`href="/privacy"` → `href="/pages/privacy"`) và `:399` (`href="/terms"` → `href="/pages/terms"`)

Cả 2 link đều `target="_blank"` và tương đối theo origin hiện tại, nên sau khi tách domain, mỗi app tự resolve `/pages/:slug` trên đúng subdomain của nó — không cần đổi thành URL tuyệt đối cross-origin.

## 5. Kiểm thử

Backend feature test mới (theo pattern các test hiện có trong `backend/tests/Feature/`, tham khảo cấu trúc `PersonalVoucherTest.php`):
- Admin tạo/liệt kê/sửa/ẩn trang thành công; role khác admin bị 403.
- Validate `slug` (regex + unique) từ chối đúng; request update gửi kèm `slug` khác không làm đổi slug trong DB.
- `GET /api/pages/{slug}` public trả đúng nội dung khi `is_active=true`, trả 404 khi ẩn hoặc không tồn tại.
- Nội dung có thẻ không nằm trong whitelist (vd `<script>`) bị loại bỏ khi lưu; thẻ được phép (vd `<strong>`, `<ul>`) giữ nguyên.

Kiểm thử thủ công:
- `make fresh` → mở `/pages/terms` và `/pages/privacy` trên cả `localhost:5173` và `localhost:5174` — thấy nội dung placeholder đã seed, không còn 404.
- Admin tạo trang mới, sửa nội dung qua rich text toolbar, ẩn trang (`is_active=false`) → URL public trả 404.
- Flow đăng ký (`RegisterPage`, `DriverRegisterPage`) — bấm link Điều khoản/Chính sách bảo mật mở đúng nội dung ở tab mới.
