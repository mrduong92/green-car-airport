# Nginx — config tham chiếu

| File | Dùng cho | PHP-FPM socket |
|---|---|---|
| `greenca.vn.conf` + `greenca-common.conf` | **PRODUCTION** (45.124.95.47, Ubuntu 26.04) — 3 app: customer / driver / admin | `php8.5-fpm.sock` |
| `savego.conf` + `savego-common.conf` | bản cũ, chỉ 2 app, giữ để tham chiếu | `php8.4-fpm.sock` |

⚠️ Hai bộ config KHÁC socket PHP-FPM. Copy nhầm `savego-*` lên production (PHP 8.5) sẽ ra 502.

Bộ `greenca` gộp cả 3 server block vào 1 file, và server block customer để
`default_server` nên truy cập thẳng bằng IP cũng ra app customer (tiện verify trước khi trỏ DNS).

Chi tiết quy trình deploy: xem `docs/DEPLOY.md`.

---

## Bản cũ — 2 subdomain, 1 backend

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
