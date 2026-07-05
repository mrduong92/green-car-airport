# Trang tĩnh + Admin CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin tạo/sửa/ẩn trang tĩnh (slug + tiêu đề + nội dung rich text) qua CRUD, trang public đọc không cần đăng nhập trên cả customer app và driver app, thay thế 2 link chết `/terms`/`/privacy` hiện có trong flow đăng ký bằng `/pages/terms`/`/pages/privacy` thật.

**Architecture:** Bảng `static_pages` (slug bất biến sau khi tạo) + 2 controller Laravel tách theo pattern `PriceConfig` (`StaticPageController` public `show`, `Admin\StaticPageController` CRUD đầy đủ, sanitize HTML khi ghi). Frontend: `pages/admin/StaticPagesPage.tsx` (list + form, dùng chung 1 file theo pattern `PriceConfigPage.tsx`) với editor Tiptap tách riêng `components/admin/TiptapEditor.tsx`; `pages/StaticPageView.tsx` mount ở cả `router/customer.tsx` và `router/driver.tsx` làm route public.

**Tech Stack:** Laravel 13 / PHP 8.4, `ezyang/htmlpurifier` (sanitize HTML), React 19 + TypeScript, TanStack Query v5, React Hook Form + Zod, `@tiptap/react` + `@tiptap/starter-kit` + `@tiptap/extension-link` (rich text editor mới thêm vào dự án).

**Spec:** `docs/superpowers/specs/2026-07-05-static-pages-cms-design.md`

## Global Constraints

- Toàn bộ UI text tiếng Việt — không dịch sang tiếng Anh.
- `slug` chỉ gồm chữ thường/số/gạch ngang (`^[a-z0-9-]+$`), **không sửa được sau khi tạo** — API update phải bỏ qua `slug` trong payload dù client gửi lên.
- Không có versioning, không upload media, không đa ngôn ngữ, không trang danh sách public (spec "Ngoài phạm vi").
- `DELETE` là soft-hide (`is_active=false`), không xoá thật — cùng pattern `PriceConfigController::destroy`.
- Nội dung admin nhập phải sanitize ở backend trước khi lưu (whitelist: `p, br, strong, em, h2, h3, ul, ol, li, a[href]`) — không tin tưởng frontend sanitize.
- Route admin CRUD: `auth:sanctum` → `role:admin`, đăng ký qua `Route::apiResource(...)->except(['show'])` đúng pattern `routes/api.php:112`.
- Route public: không auth, top-level (giống `/price-configs`).
- Chạy lệnh trong container: `docker compose exec app <cmd>` (backend), `docker compose exec frontend <cmd>` (frontend).
- Test PHP: `docker compose exec app php artisan test --filter=<Name>`. Frontend không có test runner — verify bằng `npx tsc -b` + `npm run build:customer` + `npm run build:driver`.

---

## File Map

| File | Thay đổi |
|---|---|
| `backend/database/migrations/2026_07_05_000001_create_static_pages_table.php` | Tạo mới — bảng + seed 2 dòng `terms`/`privacy` |
| `backend/app/Models/StaticPage.php` | Tạo mới |
| `backend/app/Http/Controllers/StaticPageController.php` | Tạo mới — public `show($slug)` |
| `backend/app/Http/Controllers/Admin/StaticPageController.php` | Tạo mới — CRUD `index/store/update/destroy` |
| `backend/routes/api.php` | Thêm route public + admin resource |
| `backend/composer.json` | Thêm `ezyang/htmlpurifier` |
| `backend/tests/Feature/StaticPageTest.php` | Tạo mới |
| `frontend/src/types.d.ts` | Thêm `interface StaticPage` |
| `frontend/src/api/staticPages.ts` | Tạo mới |
| `frontend/src/components/admin/TiptapEditor.tsx` | Tạo mới |
| `frontend/src/pages/admin/StaticPagesPage.tsx` | Tạo mới |
| `frontend/src/layouts/AdminLayout.tsx` | Thêm tab "Trang tĩnh" |
| `frontend/src/router/customer.tsx` | Thêm route `/admin/pages` (admin) + `/pages/:slug` (public) |
| `frontend/src/pages/StaticPageView.tsx` | Tạo mới |
| `frontend/src/router/driver.tsx` | Thêm route `/pages/:slug` (public) |
| `frontend/src/pages/RegisterPage.tsx` | Sửa 2 href `/privacy`, `/terms` → `/pages/privacy`, `/pages/terms` |
| `frontend/src/pages/DriverRegisterPage.tsx` | Sửa 2 href tương tự |
| `frontend/package.json` | Thêm `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link` |

---

### Task 1: Backend — model, migration, CRUD API, sanitize, tests

**Files:**
- Create: `backend/database/migrations/2026_07_05_000001_create_static_pages_table.php`
- Create: `backend/app/Models/StaticPage.php`
- Create: `backend/app/Http/Controllers/StaticPageController.php`
- Create: `backend/app/Http/Controllers/Admin/StaticPageController.php`
- Modify: `backend/routes/api.php`
- Modify: `backend/composer.json` (qua `composer require`)
- Test: `backend/tests/Feature/StaticPageTest.php`

**Interfaces:**
- Produces: `App\Models\StaticPage` (fillable: `slug, title, content, is_active`); `GET /api/pages/{slug}` → `{slug, title, content}` (200) hoặc 404; `GET/POST/PUT/DELETE /api/admin/pages[...]` (role:admin).
- Consumes: `App\Models\User` (role check qua middleware `role:admin` có sẵn), `EnsureRole` middleware có sẵn (`backend/app/Http/Middleware/EnsureRole.php`).

- [ ] **Step 1: Cài `ezyang/htmlpurifier`**

```bash
docker compose exec app composer require ezyang/htmlpurifier
```

- [ ] **Step 2: Viết test trước (TDD) — `backend/tests/Feature/StaticPageTest.php`**

```php
<?php

namespace Tests\Feature;

use App\Models\StaticPage;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StaticPageTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_show_returns_active_page(): void
    {
        StaticPage::create([
            'slug' => 'terms', 'title' => 'Điều khoản dịch vụ',
            'content' => '<p>Nội dung</p>', 'is_active' => true,
        ]);

        $response = $this->getJson('/api/pages/terms')->assertOk();

        $response->assertJson([
            'slug' => 'terms', 'title' => 'Điều khoản dịch vụ', 'content' => '<p>Nội dung</p>',
        ]);
    }

    public function test_public_show_returns_404_for_inactive_page(): void
    {
        StaticPage::create([
            'slug' => 'hidden', 'title' => 'Ẩn', 'content' => '<p>x</p>', 'is_active' => false,
        ]);

        $this->getJson('/api/pages/hidden')->assertNotFound();
    }

    public function test_public_show_returns_404_for_missing_slug(): void
    {
        $this->getJson('/api/pages/khong-ton-tai')->assertNotFound();
    }

    public function test_admin_can_create_page(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/admin/pages', [
                'slug' => 'faq', 'title' => 'Câu hỏi thường gặp', 'content' => '<p>Nội dung FAQ</p>',
            ])
            ->assertCreated();

        $this->assertDatabaseHas('static_pages', ['slug' => 'faq', 'title' => 'Câu hỏi thường gặp']);
        $response->assertJson(['slug' => 'faq']);
    }

    public function test_non_admin_cannot_create_page(): void
    {
        $customer = User::factory()->create(['role' => 'customer']);

        $this->actingAs($customer, 'sanctum')
            ->postJson('/api/admin/pages', ['slug' => 'faq', 'title' => 'x', 'content' => '<p>x</p>'])
            ->assertForbidden();
    }

    public function test_create_rejects_invalid_slug(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/admin/pages', ['slug' => 'Invalid Slug!', 'title' => 'x', 'content' => '<p>x</p>'])
            ->assertStatus(422);
    }

    public function test_create_rejects_duplicate_slug(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        StaticPage::create(['slug' => 'terms', 'title' => 'x', 'content' => '<p>x</p>']);

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/admin/pages', ['slug' => 'terms', 'title' => 'y', 'content' => '<p>y</p>'])
            ->assertStatus(422);
    }

    public function test_update_cannot_change_slug(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $page  = StaticPage::create(['slug' => 'terms', 'title' => 'Cũ', 'content' => '<p>Cũ</p>']);

        $this->actingAs($admin, 'sanctum')
            ->putJson("/api/admin/pages/{$page->id}", [
                'slug' => 'da-doi', 'title' => 'Mới', 'content' => '<p>Mới</p>',
            ])
            ->assertOk();

        $this->assertDatabaseHas('static_pages', ['id' => $page->id, 'slug' => 'terms', 'title' => 'Mới']);
    }

    public function test_destroy_soft_hides_instead_of_deleting(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $page  = StaticPage::create(['slug' => 'terms', 'title' => 'x', 'content' => '<p>x</p>']);

        $this->actingAs($admin, 'sanctum')
            ->deleteJson("/api/admin/pages/{$page->id}")
            ->assertOk();

        $this->assertDatabaseHas('static_pages', ['id' => $page->id, 'is_active' => false]);
    }

    public function test_content_is_sanitized_on_create(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/admin/pages', [
                'slug' => 'xss', 'title' => 'x',
                'content' => '<p>An toàn</p><script>alert(1)</script><strong>Đậm</strong>',
            ])
            ->assertCreated();

        $this->assertStringNotContainsString('<script>', $response->json('content'));
        $this->assertStringContainsString('<strong>Đậm</strong>', $response->json('content'));
    }
}
```

- [ ] **Step 3: Chạy test để xác nhận fail**

```bash
docker compose exec app php artisan test --filter=StaticPageTest
```

Expected: FAIL — class `App\Models\StaticPage` chưa tồn tại (hoặc route 404 nếu chưa đăng ký).

- [ ] **Step 4: Tạo migration**

```php
<?php
// backend/database/migrations/2026_07_05_000001_create_static_pages_table.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('static_pages', function (Blueprint $table) {
            $table->id();
            $table->string('slug', 50)->unique();
            $table->string('title', 150);
            $table->longText('content');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        DB::table('static_pages')->insert([
            [
                'slug' => 'terms', 'title' => 'Điều khoản dịch vụ',
                'content' => '<p>Nội dung điều khoản dịch vụ sẽ được cập nhật sớm.</p>',
                'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
            ],
            [
                'slug' => 'privacy', 'title' => 'Chính sách bảo mật',
                'content' => '<p>Nội dung chính sách bảo mật sẽ được cập nhật sớm.</p>',
                'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
            ],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('static_pages');
    }
};
```

- [ ] **Step 5: Tạo model**

```php
<?php
// backend/app/Models/StaticPage.php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StaticPage extends Model
{
    protected $fillable = ['slug', 'title', 'content', 'is_active'];

    protected $casts = [
        'is_active' => 'boolean',
    ];
}
```

- [ ] **Step 6: Tạo public controller**

```php
<?php
// backend/app/Http/Controllers/StaticPageController.php

namespace App\Http\Controllers;

use App\Models\StaticPage;
use Illuminate\Http\JsonResponse;

class StaticPageController extends Controller
{
    public function show(string $slug): JsonResponse
    {
        $page = StaticPage::where('slug', $slug)->where('is_active', true)->first();

        if (! $page) {
            return response()->json(['message' => 'Không tìm thấy trang.'], 404);
        }

        return response()->json([
            'slug'    => $page->slug,
            'title'   => $page->title,
            'content' => $page->content,
        ]);
    }
}
```

- [ ] **Step 7: Tạo admin controller (kèm sanitize)**

```php
<?php
// backend/app/Http/Controllers/Admin/StaticPageController.php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\StaticPage;
use HTMLPurifier;
use HTMLPurifier_Config;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StaticPageController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(StaticPage::orderBy('id')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'slug'    => 'required|string|max:50|regex:/^[a-z0-9-]+$/|unique:static_pages,slug',
            'title'   => 'required|string|max:150',
            'content' => 'required|string',
        ]);

        $data['content'] = $this->sanitize($data['content']);

        $page = StaticPage::create($data);

        return response()->json($page, 201);
    }

    public function update(Request $request, StaticPage $staticPage): JsonResponse
    {
        $data = $request->validate([
            'title'     => 'sometimes|string|max:150',
            'content'   => 'sometimes|string',
            'is_active' => 'sometimes|boolean',
        ]);

        if (isset($data['content'])) {
            $data['content'] = $this->sanitize($data['content']);
        }

        $staticPage->update($data);

        return response()->json($staticPage->fresh());
    }

    public function destroy(StaticPage $staticPage): JsonResponse
    {
        $staticPage->update(['is_active' => false]);

        return response()->json(['message' => 'Đã ẩn trang']);
    }

    private function sanitize(string $html): string
    {
        $config = HTMLPurifier_Config::createDefault();
        $config->set('HTML.Allowed', 'p,br,strong,em,h2,h3,ul,ol,li,a[href]');
        $config->set('URI.AllowedSchemes', ['http' => true, 'https' => true]);
        $config->set('Cache.DefinitionImpl', null);

        return (new HTMLPurifier($config))->purify($html);
    }
}
```

Lưu ý: `update()` **không nhận `slug` trong `validate()`** — nếu client gửi `slug` trong body, nó bị bỏ qua hoàn toàn vì không nằm trong danh sách rule, `$data` sẽ không chứa key đó.

- [ ] **Step 8: Đăng ký route**

Trong `backend/routes/api.php`, thêm import ở đầu file (cạnh các import controller khác):

```php
use App\Http\Controllers\StaticPageController;
use App\Http\Controllers\Admin\StaticPageController as AdminStaticPageController;
```

Thêm route public — đặt cạnh dòng `Route::get('/price-configs', ...)`:

```php
Route::get('/pages/{slug}', [StaticPageController::class, 'show']);
```

Thêm route admin — đặt cạnh dòng `Route::apiResource('/admin/price-configs', AdminPriceConfigController::class)->except(['show']);` trong group `role:admin`:

```php
Route::apiResource('/admin/pages', AdminStaticPageController::class)->except(['show']);
```

- [ ] **Step 9: Chạy test, xác nhận pass**

```bash
docker compose exec app php artisan test --filter=StaticPageTest
```

Expected: `10 passed` (hoặc số lượng test tương ứng), không có warning/error.

- [ ] **Step 10: Migrate database dev**

```bash
docker compose exec app php artisan migrate
```

Expected: `2026_07_05_000001_create_static_pages_table ... DONE`

- [ ] **Step 11: Verify thủ công qua curl**

```bash
curl -s http://localhost:8080/api/pages/terms | python3 -m json.tool
curl -s http://localhost:8080/api/pages/khong-ton-tai -o /dev/null -w '%{http_code}\n'
```

Expected: dòng đầu trả JSON có `"slug": "terms"`; dòng hai in `404`.

- [ ] **Step 12: Commit**

```bash
git add backend/database/migrations/2026_07_05_000001_create_static_pages_table.php \
  backend/app/Models/StaticPage.php \
  backend/app/Http/Controllers/StaticPageController.php \
  backend/app/Http/Controllers/Admin/StaticPageController.php \
  backend/routes/api.php backend/composer.json backend/composer.lock \
  backend/tests/Feature/StaticPageTest.php
git commit -m "feat: static pages CRUD API with HTML sanitization"
```

---

### Task 2: Frontend — Admin CRUD UI (Tiptap editor)

**Files:**
- Modify: `frontend/package.json` (qua `npm install`)
- Modify: `frontend/src/types.d.ts`
- Create: `frontend/src/api/staticPages.ts`
- Create: `frontend/src/components/admin/TiptapEditor.tsx`
- Create: `frontend/src/pages/admin/StaticPagesPage.tsx`
- Modify: `frontend/src/layouts/AdminLayout.tsx`
- Modify: `frontend/src/router/customer.tsx`

**Interfaces:**
- Consumes: `GET/POST/PUT/DELETE /api/admin/pages[...]` từ Task 1 (JSON shape: `{id, slug, title, content, is_active, created_at, updated_at}`).
- Produces: `App.StaticPage` type; `listPages()`, `createPage(data)`, `updatePage(id, data)`, `deletePage(id)` trong `api/staticPages.ts`; `<TiptapEditor value onChange>` component; route `/admin/pages`.

- [ ] **Step 1: Cài Tiptap**

```bash
docker compose exec frontend npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-link
```

- [ ] **Step 2: Thêm type `App.StaticPage`**

Trong `frontend/src/types.d.ts`, thêm ngay sau `interface PriceConfig { ... }` (dòng ~251):

```ts
  interface StaticPage {
    id: number
    slug: string
    title: string
    content: string
    is_active: boolean
  }
```

- [ ] **Step 3: Tạo `api/staticPages.ts`**

```ts
// frontend/src/api/staticPages.ts
import api from './axios'

export const getPublicPage = (slug: string) =>
  api.get<{ slug: string; title: string; content: string }>(`/pages/${slug}`).then((r) => r.data)

// Admin CRUD
export const listPages = () =>
  api.get<App.StaticPage[]>('/admin/pages').then((r) => r.data)

export const createPage = (data: { slug: string; title: string; content: string }) =>
  api.post<App.StaticPage>('/admin/pages', data)

export const updatePage = (id: number, data: Partial<Pick<App.StaticPage, 'title' | 'content' | 'is_active'>>) =>
  api.put<App.StaticPage>(`/admin/pages/${id}`, data)

export const deletePage = (id: number) =>
  api.delete(`/admin/pages/${id}`)
```

- [ ] **Step 4: Tạo `components/admin/TiptapEditor.tsx`**

```tsx
// frontend/src/components/admin/TiptapEditor.tsx
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import clsx from 'clsx'

const CONTENT_CLASS = '[&_h2]:text-lg [&_h2]:font-bold [&_h2]:mb-2 [&_h3]:text-base [&_h3]:font-bold [&_h3]:mb-1.5 ' +
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-primary [&_a]:underline [&_p]:mb-2'

export { CONTENT_CLASS }

export default function TiptapEditor({
  value,
  onChange,
}: {
  value: string
  onChange: (html: string) => void
}) {
  const editor = useEditor({
    extensions: [StarterKit, Link.configure({ openOnClick: false })],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })

  if (!editor) return null

  const setLink = () => {
    const url = window.prompt('Nhập URL:')
    if (url) editor.chain().focus().setLink({ href: url }).run()
  }

  const btnClass = (active: boolean) =>
    clsx('px-2.5 py-1.5 rounded-input text-sm font-medium transition-colors',
      active ? 'bg-primary text-white' : 'text-navy hover:bg-light-green')

  return (
    <div className="border border-border-gray rounded-input overflow-hidden">
      <div className="flex flex-wrap gap-1 border-b border-border-gray p-2 bg-warm-white">
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()}
          className={clsx(btnClass(editor.isActive('bold')), 'font-bold')}>B</button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()}
          className={clsx(btnClass(editor.isActive('italic')), 'italic')}>I</button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={btnClass(editor.isActive('heading', { level: 2 }))}>H2</button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={btnClass(editor.isActive('heading', { level: 3 }))}>H3</button>
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={btnClass(editor.isActive('bulletList'))}>• List</button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={btnClass(editor.isActive('orderedList'))}>1. List</button>
        <button type="button" onClick={setLink}
          className={btnClass(editor.isActive('link'))}>Link</button>
      </div>
      <EditorContent editor={editor} className={clsx('p-3 min-h-[200px] text-sm text-navy outline-none', CONTENT_CLASS)} />
    </div>
  )
}
```

- [ ] **Step 5: Tạo `pages/admin/StaticPagesPage.tsx`** (theo pattern `PriceConfigPage.tsx`)

```tsx
// frontend/src/pages/admin/StaticPagesPage.tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import clsx from 'clsx'
import { listPages, createPage, updatePage, deletePage } from '@/api/staticPages'
import { useUiStore } from '@/stores/ui'
import Button from '@/components/common/Button'
import TiptapEditor from '@/components/admin/TiptapEditor'

const createSchema = z.object({
  slug:    z.string().min(1, 'Bắt buộc').regex(/^[a-z0-9-]+$/, 'Chỉ chữ thường, số và dấu gạch ngang'),
  title:   z.string().min(1, 'Bắt buộc').max(150),
  content: z.string().min(1, 'Bắt buộc'),
})
const editSchema = createSchema.omit({ slug: true })
type FormData = z.infer<typeof createSchema>

export default function StaticPagesPage() {
  const qc = useQueryClient()
  const showToast = useUiStore((s) => s.showToast)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  const { data: pages = [] } = useQuery({
    queryKey: ['admin-static-pages'],
    queryFn: listPages,
  })

  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(editingId ? editSchema : createSchema),
    defaultValues: { slug: '', title: '', content: '' },
  })

  const createMutation = useMutation({
    mutationFn: (d: FormData) => createPage(d),
    onSuccess: () => {
      showToast('Đã tạo trang', 'success')
      qc.invalidateQueries({ queryKey: ['admin-static-pages'] })
      reset(); setShowForm(false)
    },
    onError: () => showToast('Tạo trang thất bại', 'error'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<App.StaticPage> }) => updatePage(id, data),
    onSuccess: () => {
      showToast('Đã cập nhật', 'success')
      qc.invalidateQueries({ queryKey: ['admin-static-pages'] })
      setEditingId(null); reset(); setShowForm(false)
    },
    onError: () => showToast('Cập nhật thất bại', 'error'),
  })

  const toggleMutation = useMutation({
    mutationFn: (p: App.StaticPage) =>
      p.is_active ? deletePage(p.id) : updatePage(p.id, { is_active: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-static-pages'] }),
  })

  const startEdit = (p: App.StaticPage) => {
    setEditingId(p.id)
    reset({ slug: p.slug, title: p.title, content: p.content })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const cancelForm = () => { setShowForm(false); setEditingId(null); reset({ slug: '', title: '', content: '' }) }

  const onSubmit = (d: FormData) => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: { title: d.title, content: d.content } })
    } else {
      createMutation.mutate(d)
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <div className="flex flex-col px-4 py-4 gap-4">
      <div className="flex items-center justify-between">
        <h1 className="hidden lg:block text-h2 text-navy font-semibold">Trang tĩnh</h1>
        <Button size="sm" onClick={() => { cancelForm(); setShowForm(!showForm) }}>
          <span className="material-symbols-outlined text-lg">add</span>
          Tạo trang mới
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit(onSubmit)}
          className="bg-white rounded-card shadow-card p-4 flex flex-col gap-3">
          <p className="text-sm font-semibold text-navy">
            {editingId ? 'Chỉnh sửa trang' : 'Tạo trang mới'}
          </p>

          {editingId ? (
            <div>
              <label className="text-xs text-neutral-gray mb-1 block">Đường dẫn (slug)</label>
              <p className="text-sm text-navy font-mono">/pages/{pages.find((p) => p.id === editingId)?.slug}</p>
            </div>
          ) : (
            <div>
              <label className="text-xs text-neutral-gray mb-1 block">Đường dẫn (slug)</label>
              <input {...register('slug')}
                placeholder="vd: huong-dan-su-dung"
                className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none font-mono" />
              {errors.slug && <p className="text-danger-red text-xs mt-1">{errors.slug.message}</p>}
            </div>
          )}

          <div>
            <label className="text-xs text-neutral-gray mb-1 block">Tiêu đề</label>
            <input {...register('title')}
              className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none" />
            {errors.title && <p className="text-danger-red text-xs mt-1">{errors.title.message}</p>}
          </div>

          <div>
            <label className="text-xs text-neutral-gray mb-1 block">Nội dung</label>
            <Controller
              name="content"
              control={control}
              render={({ field }) => <TiptapEditor value={field.value} onChange={field.onChange} />}
            />
            {errors.content && <p className="text-danger-red text-xs mt-1">{errors.content.message}</p>}
          </div>

          <div className="flex gap-2">
            <Button type="submit" fullWidth loading={isPending}>
              {editingId ? 'Lưu thay đổi' : 'Tạo trang'}
            </Button>
            <button type="button" onClick={cancelForm}
              className="px-4 py-2 text-sm text-neutral-gray border border-border-gray rounded-input">
              Huỷ
            </button>
          </div>
        </form>
      )}

      <div className="flex flex-col gap-3">
        {pages.map((p) => (
          <div key={p.id}
            className={clsx('bg-white rounded-card shadow-card p-4 flex items-center gap-3',
              !p.is_active && 'opacity-50')}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-navy">{p.title}</p>
              <p className="text-xs text-neutral-gray font-mono">/pages/{p.slug}</p>
              {!p.is_active && <p className="text-xs text-neutral-gray mt-0.5">Đã ẩn</p>}
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => startEdit(p)}
                className="text-xs text-primary border border-primary rounded-pill px-3 py-1.5">
                Sửa
              </button>
              <button onClick={() => toggleMutation.mutate(p)}
                className="text-xs text-neutral-gray border border-border-gray rounded-pill px-3 py-1.5">
                {p.is_active ? 'Ẩn' : 'Hiện'}
              </button>
            </div>
          </div>
        ))}
        {pages.length === 0 && (
          <p className="text-caption text-neutral-gray text-center py-10">Chưa có trang nào</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Thêm tab vào `AdminLayout.tsx`**

Trong `frontend/src/layouts/AdminLayout.tsx`, thêm vào mảng `TABS` (sau dòng `{ to: '/admin/customers', ... }`):

```ts
  { to: '/admin/pages',     icon: 'article',             label: 'Trang tĩnh' },
```

- [ ] **Step 7: Đăng ký route trong `router/customer.tsx`**

Thêm import (cạnh `import AdminCustomersPage from '@/pages/admin/CustomersPage'`):

```tsx
import StaticPagesPage from '@/pages/admin/StaticPagesPage'
```

Thêm route trong children của `RequireRole role="admin"` → `AdminLayout` (sau dòng `/admin/customers`):

```tsx
          { path: '/admin/pages', element: <StaticPagesPage /> },
```

- [ ] **Step 8: Verify**

```bash
docker compose exec frontend npx tsc -b
docker compose exec frontend npm run build:customer
```

Expected: exit 0 cả 2 lệnh. Kiểm tra thủ công `http://localhost:5173/admin/login` → đăng nhập admin (`0923456789`, mật khẩu `000000`) → vào tab "Trang tĩnh" → thấy 2 trang `terms`/`privacy` đã seed → bấm "Sửa" → soạn thảo bằng toolbar (in đậm, H2, danh sách) → Lưu → thấy nội dung cập nhật trong danh sách.

- [ ] **Step 9: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/types.d.ts \
  frontend/src/api/staticPages.ts frontend/src/components/admin/TiptapEditor.tsx \
  frontend/src/pages/admin/StaticPagesPage.tsx frontend/src/layouts/AdminLayout.tsx \
  frontend/src/router/customer.tsx
git commit -m "feat: admin static pages CRUD UI with Tiptap rich text editor"
```

---

### Task 3: Frontend — Public page view + fix dead links

**Files:**
- Create: `frontend/src/pages/StaticPageView.tsx`
- Modify: `frontend/src/router/customer.tsx`
- Modify: `frontend/src/router/driver.tsx`
- Modify: `frontend/src/pages/RegisterPage.tsx`
- Modify: `frontend/src/pages/DriverRegisterPage.tsx`

**Interfaces:**
- Consumes: `getPublicPage(slug)` từ `@/api/staticPages` (Task 2); `CONTENT_CLASS` export từ `@/components/admin/TiptapEditor` (Task 2) — dùng lại để nội dung public hiển thị đúng style heading/list/link như lúc soạn thảo.
- Produces: route `/pages/:slug` public ở cả 2 router.

- [ ] **Step 1: Tạo `pages/StaticPageView.tsx`**

```tsx
// frontend/src/pages/StaticPageView.tsx
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { getPublicPage } from '@/api/staticPages'
import { CONTENT_CLASS } from '@/components/admin/TiptapEditor'

export default function StaticPageView() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['static-page', slug],
    queryFn: () => getPublicPage(slug!),
    retry: false,
  })

  return (
    <div className="min-h-svh bg-white flex flex-col w-full">
      <div className="px-4 pt-14 pb-2 safe-top flex items-center">
        <button onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center text-navy">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
      </div>

      <div className="flex-1 px-6 pt-2 pb-10">
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <span className="material-symbols-outlined animate-spin text-primary text-3xl">progress_activity</span>
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <span className="material-symbols-outlined text-4xl text-neutral-gray">search_off</span>
            <p className="text-neutral-gray text-sm">Không tìm thấy trang</p>
          </div>
        )}

        {data && (
          <>
            <h1 className="text-navy font-bold text-[22px] mb-4">{data.title}</h1>
            <div
              className={clsx('text-sm text-navy leading-relaxed', CONTENT_CLASS)}
              dangerouslySetInnerHTML={{ __html: data.content }}
            />
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Mount route `/pages/:slug` trong `router/customer.tsx`**

Thêm import:

```tsx
import StaticPageView from '@/pages/StaticPageView'
```

Thêm route top-level (cạnh `{ path: '/install', element: <InstallPage /> }`, trước dòng `*`):

```tsx
  { path: '/pages/:slug', element: <StaticPageView /> },
```

- [ ] **Step 3: Mount route `/pages/:slug` trong `router/driver.tsx`**

Thêm import:

```tsx
import StaticPageView from '@/pages/StaticPageView'
```

Thêm route top-level (cùng vị trí, cạnh `/install`):

```tsx
  { path: '/pages/:slug', element: <StaticPageView /> },
```

- [ ] **Step 4: Sửa link trong `RegisterPage.tsx`**

Tìm 2 dòng (~351, ~371) và sửa:

```tsx
href="/privacy"
```
→
```tsx
href="/pages/privacy"
```

```tsx
href="/terms"
```
→
```tsx
href="/pages/terms"
```

- [ ] **Step 5: Sửa link trong `DriverRegisterPage.tsx`**

Dòng 392:
```tsx
<a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary font-semibold underline">Chính sách bảo mật</a>
```
→
```tsx
<a href="/pages/privacy" target="_blank" rel="noopener noreferrer" className="text-primary font-semibold underline">Chính sách bảo mật</a>
```

Dòng 399:
```tsx
<a href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary font-semibold underline">Điều khoản sử dụng</a>
```
→
```tsx
<a href="/pages/terms" target="_blank" rel="noopener noreferrer" className="text-primary font-semibold underline">Điều khoản sử dụng</a>
```

- [ ] **Step 6: Verify build cả 2 app**

```bash
docker compose exec frontend npx tsc -b
docker compose exec frontend npm run build:customer
docker compose exec frontend npm run build:driver
```

Expected: exit 0 cả 3 lệnh.

- [ ] **Step 7: Verify thủ công trên cả 2 domain**

```bash
# Customer app (port 5173)
curl -s http://localhost:5173/pages/terms -o /dev/null -w '%{http_code}\n'
# Driver app (port 5174) — cần frontend_driver đang chạy (docker compose up -d)
curl -s http://localhost:5174/pages/privacy -o /dev/null -w '%{http_code}\n'
```

Expected: cả 2 trả `200` (route SPA luôn trả `index.html`, nội dung thực tế cần mở trình duyệt để xem do client-side fetch).

Mở trình duyệt kiểm tra:
- `http://localhost:5173/pages/terms` và `http://localhost:5174/pages/terms` đều hiển thị đúng nội dung "Điều khoản dịch vụ" đã seed/sửa ở Task 2.
- `http://localhost:5173/pages/khong-ton-tai` hiển thị "Không tìm thấy trang".
- Vào flow đăng ký khách hàng (`/register`) tới bước xác nhận điều khoản → bấm "Chính sách bảo mật" / "Điều khoản sử dụng" → mở tab mới đúng nội dung.
- Vào flow đăng ký tài xế (`http://localhost:5174/register/driver`) tới bước 6 → bấm 2 link tương tự → mở đúng nội dung.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/StaticPageView.tsx frontend/src/router/customer.tsx frontend/src/router/driver.tsx \
  frontend/src/pages/RegisterPage.tsx frontend/src/pages/DriverRegisterPage.tsx
git commit -m "feat: public static page view, fix dead terms/privacy links"
```

---

## Checklist tổng kết (end-to-end)

```
[ ] docker compose exec app php artisan test --filter=StaticPageTest → tất cả pass
[ ] docker compose exec app php artisan migrate → static_pages có 2 dòng seed (terms, privacy)
[ ] Admin đăng nhập → /admin/pages → thấy 2 trang seed, tạo trang mới, sửa nội dung qua Tiptap, ẩn/hiện trang
[ ] Slug không sửa được khi edit trang có sẵn (chỉ hiện readonly)
[ ] localhost:5173/pages/terms và localhost:5174/pages/terms đều hiển thị đúng nội dung
[ ] Trang ẩn (is_active=false) trả "Không tìm thấy trang" ở cả 2 domain
[ ] Link Điều khoản/Chính sách trong RegisterPage.tsx và DriverRegisterPage.tsx mở đúng nội dung, không còn 404
[ ] build:customer + build:driver + tsc -b đều pass
```
