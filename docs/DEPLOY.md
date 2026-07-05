# Deploy Production — Save Go

> Cập nhật lần cuối: 2026-07-05. KHÔNG lưu mật khẩu trong file này — server chỉ đăng nhập bằng SSH key (password auth đã tắt).

## Thông tin server

| Mục | Giá trị |
|---|---|
| Tên server | `ubuntu-2vcpu-2gb-1-09aa0` |
| WAN IP | `103.148.57.141` |
| OS | Ubuntu 24.04.4 LTS |
| User | `root` |
| SSH key (máy local) | `~/.ssh/greencar-prod` (ed25519, comment `greencar-prod-deploy`) |
| Đăng nhập | `ssh -i ~/.ssh/greencar-prod root@103.148.57.141` |
| Password auth | **ĐÃ TẮT** (`/etc/ssh/sshd_config.d/00-disable-password-auth.conf`) — mất key thì phải vào console của nhà cung cấp VPS |

⚠️ **Server dùng chung** — còn host các site khác: `amd.io.vn`, `amdnewtech.shop`, `nmtauto.com(.vn)`, `webai.io.vn`, `funa-ai`. Cẩn trọng khi đụng nginx/PHP-FPM/MySQL dùng chung.

## Kiến trúc deploy

| Thành phần | Giá trị |
|---|---|
| Thư mục app | `/var/www/green-car-airport` (git checkout, branch `main`) |
| Customer + Admin app | `https://webco.io.vn` → `frontend/dist/` |
| Driver app | `https://driver.webco.io.vn` → `frontend/dist-driver/` |
| Backend API | Cả 2 vhost proxy `/api/` → PHP-FPM 8.4 (`unix:/run/php/php8.4-fpm.sock`) → `backend/public/index.php` |
| Nginx vhosts | `/etc/nginx/sites-available/webco.io.vn`, `/etc/nginx/sites-available/driver.webco.io.vn` |
| SSL | certbot (Let's Encrypt), auto-renew |
| Database | MySQL local, DB `green_car_airport`, user `amd` (mật khẩu trong `backend/.env` trên server) |
| Redis | local, client `phpredis` (extension đã cài — KHÔNG cần predis) |
| Env files | `backend/.env`, `frontend/.env` trên server — KHÔNG có trong git, backup trước khi sửa |
| Node.js | **KHÔNG có trên server** — frontend build ở máy local rồi rsync lên |

## Quy trình deploy

### 1. Backend (chạy trên server)

```bash
ssh -i ~/.ssh/greencar-prod root@103.148.57.141

cd /var/www/green-car-airport
# Backup trước
BACKUP=/root/deploy-backups/$(date +%Y%m%d-%H%M%S) && mkdir -p $BACKUP
cp backend/.env frontend/.env $BACKUP/ && cp -r frontend/dist $BACKUP/dist-previous

git fetch origin && git reset --hard origin/main

cd backend
COMPOSER_ALLOW_SUPERUSER=1 composer install --no-dev --optimize-autoloader --no-interaction
php artisan migrate --force          # KHÔNG BAO GIỜ dùng migrate:fresh — DB có dữ liệu thật
php artisan config:cache && php artisan route:cache
# ⚠️ BẮT BUỘC sau khi chạy artisan bằng root: trả quyền về www-data,
# nếu không PHP-FPM không ghi được log/cache → mọi request 500 không để lại vết
chown -R www-data:www-data storage bootstrap/cache
systemctl reload php8.4-fpm
```

Seed chỉ chạy khi có seeder mới cần thiết, và chỉ chạy đúng class (KHÔNG chạy `db:seed` trần — DatabaseSeeder sẽ tạo user dev vào production):

```bash
php artisan db:seed --class=StaticPageSeeder --force
```

### 2. Frontend (build local, rsync lên)

```bash
# Ở máy local, repo đã ở latest main:
docker compose exec -T -e VITE_DRIVER_APP_URL=https://driver.webco.io.vn frontend npm run build:customer
docker compose exec -T frontend npm run build:driver

rsync -az --delete -e "ssh -i ~/.ssh/greencar-prod" frontend/dist/        root@103.148.57.141:/var/www/green-car-airport/frontend/dist/
rsync -az --delete -e "ssh -i ~/.ssh/greencar-prod" frontend/dist-driver/ root@103.148.57.141:/var/www/green-car-airport/frontend/dist-driver/
```

Lưu ý: `VITE_DRIVER_APP_URL` phải set lúc build customer (link "Đăng ký làm tài xế" ở Splash bake vào bundle).

### 3. Verify sau deploy

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://webco.io.vn/            # 200
curl -s https://webco.io.vn/api/pages/terms                              # JSON điều khoản
curl -s https://driver.webco.io.vn/ | grep -o '<title>[^<]*</title>'     # Save Go Tài Xế
```

⚠️ **Title đúng CHƯA đủ** — đã từng có bug 2 build ra cùng 1 bundle customer nhưng title vẫn khác nhau. Phải verify nội dung bundle thật:

```bash
# Bundle driver phải chứa chuỗi UI chỉ có ở app driver:
BUNDLE=$(curl -s https://driver.webco.io.vn/ | grep -o '/assets/index-[^"]*\.js')
curl -s "https://driver.webco.io.vn$BUNDLE" | grep -c "Chưa đăng ký tài xế"   # >= 1
# Và 2 app phải ra 2 file hash KHÁC nhau:
curl -s https://webco.io.vn/ | grep -o '/assets/index-[^"]*\.js'
curl -s https://driver.webco.io.vn/ | grep -o '/assets/index-[^"]*\.js'
```

## Backup

- Mỗi lần deploy: `/root/deploy-backups/<timestamp>/` trên server (env files + composer + dist cũ).
- DB: chưa có backup tự động — cần setup (TODO).

## Lịch sử / ghi chú

- 2026-07-05: Deploy domain-separation (2 app customer/driver) + static pages CRUD. Tạo vhost `driver.webco.io.vn`. Tắt SSH password auth, chuyển sang key `greencar-prod`.
- `savego.com.vn` chưa có DNS (dự kiến domain chính thức sau này) — hiện dùng `webco.io.vn`.
- Queue worker: chưa thấy service/cron nào chạy `queue:work` trên server dù `QUEUE_CONNECTION=redis` — cần kiểm tra nếu notification không gửi (TODO).
