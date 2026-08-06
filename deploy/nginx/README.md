# Nginx — config tham chiếu

| File | Dùng cho | PHP-FPM socket |
|---|---|---|
| `greenca.vn.conf` + `greenca-common.conf` | **PRODUCTION** (45.124.95.47, Ubuntu 26.04) — 3 app: customer / driver / admin | `php8.5-fpm.sock` |

Bộ `greenca` gộp cả 3 server block vào 1 file, và server block customer để
`default_server` nên truy cập thẳng bằng IP cũng ra app customer (tiện verify trước khi trỏ DNS).

Chi tiết quy trình deploy: xem `docs/DEPLOY.md`.

---

## Domain → bundle

- `greenca.vn` → serve `frontend/dist` (app customer)
- `driver.greenca.vn` → serve `frontend/dist-driver` (app tài xế)
- `admin.greenca.vn` → serve `frontend/dist-admin` (app admin)

Cả 3 vhost proxy `/api/*` về cùng Laravel backend qua PHP-FPM — backend không phân biệt domain (auth Bearer token).

## Deploy

1. Build 3 bundle:
   ```bash
   cd frontend
   VITE_DRIVER_APP_URL=https://driver.greenca.vn npm run build:customer
   npm run build:driver
   npm run build:admin
   ```
2. Copy `dist/`, `dist-driver/`, `dist-admin/` lên server (giữ đúng path trong `greenca.vn.conf`, hoặc sửa `root` cho khớp).
3. Copy `greenca-common.conf` → `/etc/nginx/snippets/`, `greenca.vn.conf` → `/etc/nginx/sites-available/` + symlink sang `sites-enabled/`.
4. Kiểm `fastcgi_pass` / `SCRIPT_FILENAME` khớp layout PHP-FPM thực tế trên server (production là `php8.5-fpm.sock` — sai socket sẽ ra 502).
5. `nginx -t && systemctl reload nginx`. TLS: chạy certbot cho cả 3 domain.

Lưu ý: DNS cần record cho `driver.greenca.vn` và `admin.greenca.vn` trỏ về cùng server.
