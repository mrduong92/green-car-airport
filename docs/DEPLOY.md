# Deploy — Save Go

> Có **2 server**: PRODUCTION (`greenca.vn`, 45.124.95.47) và STAGING (`webco.io.vn`, 103.148.57.141).
> Hai server dùng DB + env RIÊNG, không dùng chung.

---

# PRODUCTION — greenca.vn

> Dựng lần đầu 2026-08-06. KHÔNG lưu mật khẩu trong file này — server chỉ đăng nhập bằng SSH key.

## Thông tin server

| Mục | Giá trị |
|---|---|
| Tên server | `green-car-ubuntu` |
| WAN IP | `45.124.95.47` |
| OS | Ubuntu 26.04 LTS |
| User | `root` |
| SSH key (máy local) | `~/.ssh/ssh-17-37-18-6-8-2026-private.pem` |
| Đăng nhập | `ssh -i ~/.ssh/ssh-17-37-18-6-8-2026-private.pem root@45.124.95.47` |
| Password auth | **ĐÃ TẮT** — mất key phải vào console VPS |
| Firewall | `ufw` bật, chỉ mở 22 / 80 / 443 |

⚠️ **Server riêng cho dự án này** — không host site nào khác (khác với staging).

### Khác biệt quan trọng so với staging

| | Production | Staging |
|---|---|---|
| PHP | **8.5** (`/run/php/php8.5-fpm.sock`) | 8.4 (`/run/php/php8.4-fpm.sock`) |
| MySQL | 8.4 | 8.0 |
| Redis | 8.0 | 7 |
| DB user | `greenca` | `amd` |
| Dev bypass `000000` | **ĐÃ TẮT** | còn bật |

Ubuntu 26.04 KHÔNG có gói `php8.4-*` trong repo mặc định — production chạy PHP 8.5
(`composer.json` yêu cầu `^8.3` nên vẫn hợp lệ). Mọi snippet nginx phải trỏ đúng
socket `php8.5-fpm.sock`, copy nguyên từ staging sẽ ra 502.

### ⚠️ sshd_config không đọc drop-in

Nhà cung cấp VPS thay `/etc/ssh/sshd_config` bằng bản legacy **không có dòng
`Include /etc/ssh/sshd_config.d/*.conf`** — nên file `60-cloudimg-settings.conf`
(vốn đã ghi `PasswordAuthentication no`) bị bỏ qua hoàn toàn. Đã sửa trực tiếp trong
file chính (`PasswordAuthentication no`, `PermitRootLogin prohibit-password`) và
thêm lại dòng `Include`. Backup bản gốc ở `/root/sshd_config.bak-<timestamp>`.
Config còn vài directive đã deprecated (`UsePrivilegeSeparation`, `RSAAuthentication`…)
— chỉ là cảnh báo, `sshd -t` vẫn pass.

## Kiến trúc deploy

| Thành phần | Giá trị |
|---|---|
| Thư mục app | `/var/www/green-car-airport` (git checkout, branch `main`) |
| Customer app | `greenca.vn` → `frontend/dist/` (cũng là `default_server`, vào bằng IP được) |
| Driver app | `driver.greenca.vn` → `frontend/dist-driver/` |
| Admin app | `admin.greenca.vn` → `frontend/dist-admin/` |
| Backend API | Cả 3 vhost proxy `/api/` → PHP-FPM 8.5 → `backend/public/index.php` |
| Nginx vhost | `/etc/nginx/sites-available/greenca.vn` (cả 3 server block trong 1 file) |
| Nginx snippet | `/etc/nginx/snippets/greenca-common.conf` |
| Database | MySQL local, DB `green_car_airport`, user `greenca` (mật khẩu trong `backend/.env`) |
| Deploy key | `/root/.ssh/id_ed25519` trên server, đã add read-only vào repo GitHub |
| Node.js | **KHÔNG có trên server** — frontend build ở máy local rồi rsync lên |
| Backup DB | `/usr/local/bin/backup-db.sh`, cron `/etc/cron.d/greenca-db-backup` 03:15 hằng ngày, giữ 14 bản ở `/root/db-backups/` |

Không cần queue worker / scheduler: repo hiện KHÔNG có `app/Jobs`, `app/Notifications`,
`app/Console/Commands` hay task nào trong scheduler — không có gì đẩy vào queue.

## Quy trình deploy

### 1. Backend (chạy trên server)

```bash
ssh -i ~/.ssh/ssh-17-37-18-6-8-2026-private.pem root@45.124.95.47

cd /var/www/green-car-airport
BACKUP=/root/deploy-backups/$(date +%Y%m%d-%H%M%S) && mkdir -p $BACKUP
cp backend/.env $BACKUP/backend.env
cp -r frontend/dist $BACKUP/dist-previous

git fetch origin && git reset --hard origin/main

cd backend
COMPOSER_ALLOW_SUPERUSER=1 composer install --no-dev --optimize-autoloader --no-interaction
php artisan migrate --force          # KHÔNG BAO GIỜ migrate:fresh
php artisan config:cache && php artisan route:cache && php artisan event:cache
chown -R www-data:www-data storage bootstrap/cache   # BẮT BUỘC sau khi chạy artisan bằng root
systemctl reload php8.5-fpm
```

### 2. Frontend (build local, rsync lên)

```bash
docker compose run --rm --no-deps -T -e VITE_DRIVER_APP_URL=https://driver.greenca.vn \
  frontend sh -c "npm install && npm run build:customer && npm run build:driver && npm run build:admin"

K=~/.ssh/ssh-17-37-18-6-8-2026-private.pem
for d in dist dist-driver dist-admin; do
  rsync -az --delete -e "ssh -i $K" frontend/$d/ root@45.124.95.47:/var/www/green-car-airport/frontend/$d/
done
```

### 3. Verify sau deploy

Dùng lại toàn bộ check ở phần staging (title + marker bundle + 3 hash khác nhau),
đổi domain sang `greenca.vn`. Thêm 2 check riêng của production:

```bash
# Dev bypass PHẢI chết — cả 2 lệnh không được trả 200
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://greenca.vn/api/auth/otp/verify \
  -H 'Content-Type: application/json' -d '{"phone":"0987654321","otp":"000000"}'   # 422
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://greenca.vn/api/auth/login \
  -H 'Content-Type: application/json' -d '{"phone":"0987654321","password":"000000","role":"customer"}'  # 422
```

### Tạo tài khoản admin

DB production khởi tạo trống nên phải tạo admin thủ công. Lưu ý `password` **không** có
cast `hashed` trong `App\Models\User` — phải `Hash::make()` bằng tay, gán chuỗi thô sẽ
làm `Hash::check()` luôn fail và không đăng nhập được.

```bash
ssh -i ~/.ssh/ssh-17-37-18-6-8-2026-private.pem root@45.124.95.47
cd /var/www/green-car-airport/backend
php artisan tinker --execute="
  \$u = App\Models\User::firstOrCreate(
    ['phone' => '09XXXXXXXX', 'role' => 'admin'],
    ['name' => 'Admin']
  );
  \$u->password = Hash::make('123456');
  \$u->save();
  echo \$u->id.' '.\$u->phone.' '.\$u->role;
"
```

Đăng nhập `https://admin.greenca.vn` bằng số đó + mật khẩu vừa đặt (không cần OTP,
vì `AuthController::login` cho đăng nhập bằng mật khẩu khi user đã có `password`).

### 4. SSL

**Đã xong (2026-08-06)** — cả 4 hostname đều có HTTPS + redirect 80→443, `certbot.timer` active:

| Cert | Domains | Hết hạn |
|---|---|---|
| `greenca.vn` | `greenca.vn`, `www.greenca.vn` | 2026-11-04 |
| `driver.greenca.vn` | `driver.greenca.vn`, `admin.greenca.vn` | 2026-11-04 |

Cấp làm 2 lần vì lúc đầu 2 subdomain chưa có bản ghi DNS. Lệnh dùng lại khi cần:

```bash
dig +short @ns2.bkdns.vn driver.greenca.vn   # phải ra 45.124.95.47 TRƯỚC khi chạy certbot
certbot --nginx -d driver.greenca.vn -d admin.greenca.vn \
  --agree-tos -m datdt2@kaopiz.com --redirect --non-interactive
```

⚠️ **Đừng gộp domain chưa trỏ DNS vào lệnh certbot.** Chỉ cần 1 domain fail challenge là
certbot bỏ nguyên lệnh và KHÔNG cấp cert nào cả — kể cả domain đã trỏ đúng.

⚠️ **Kiểm DNS bằng NS gốc (`dig +short @ns2.bkdns.vn ...`), đừng tin resolver local.**
Vừa thêm record xong thì resolver local/8.8.8.8 còn cache NXDOMAIN, dễ tưởng là chưa set.

certbot tự sửa vhost thành 443 + redirect 80→443 và tự cài timer auto-renew.
Sau đó kiểm tra `APP_URL` trong `backend/.env` rồi `php artisan config:cache`.

#### Auto-renew — 2 lớp

| Lớp | Cơ chế | Ghi chú |
|---|---|---|
| Chính | `certbot.timer` (systemd), ~06:28 hằng ngày | Đã verify `certbot renew --dry-run` → **cả 2 cert simulated renewal thành công** |
| Dự phòng | `/etc/cron.d/greenca-certbot-renew`, 02:17 + 14:17 | Log ở `/var/log/greenca-certbot-renew.log` |

⚠️ `/etc/cron.d/certbot` (của gói certbot) **KHÔNG dùng được làm dự phòng** — nó có điều kiện
`test ... -a \! -d /run/systemd/system` nên tự vô hiệu trên máy chạy systemd. Đó là lý do phải
thêm file cron riêng.

`renewal/*.conf` đã có `installer = nginx` nên certbot tự reload nginx sau khi gia hạn.
certbot chỉ gia hạn khi cert còn dưới 30 ngày, các lần khác no-op; có lock file nên
timer và cron chạy trùng cũng an toàn.

`certbot renew --dry-run` chạy khá lâu (>5 phút) — đừng tưởng là treo.

## Lịch sử production

- 2026-08-06: Dựng server production lần đầu. Cài nginx 1.28 + PHP 8.5 + MySQL 8.4 + Redis 8.0 + certbot.
  Deploy commit `3c50f33` (= code của `605bcab` trên staging + fix tắt dev bypass; 2 commit ở giữa chỉ sửa docs).
  DB khởi tạo trống, chỉ seed `PriceConfigSeeder` (6 dòng) + `StaticPageSeeder` (2 trang) — KHÔNG seed user dev.
  Tắt SSH password auth, bật ufw, cài backup DB hằng ngày.
  Env copy từ staging và giữ nguyên credential ZNS (Abenla) / VAPID / SePay; đổi APP_URL, DB, Redis,
  `MAIL_MAILER=log` (production không có mailpit), `LOG_LEVEL=warning`, `APP_KEY` sinh mới.
  Cấp SSL cho cả 4 hostname (hết hạn 2026-11-04). Tạo admin `0868968312` — verify
  login trả token và `GET /api/admin/dashboard` trả 200. Verify cuối qua HTTPS: 3 app 200,
  3 hash bundle khác nhau và khớp build local, marker driver/admin đúng, bypass `000000` trả 422.

---

# STAGING — webco.io.vn

> Cập nhật lần cuối: 2026-07-05. KHÔNG lưu mật khẩu trong file này — server chỉ đăng nhập bằng SSH key (password auth đã tắt).
>
> ⚠️ Đây là server **STAGING** (dùng chung, thử nghiệm). Production đã dựng riêng — xem phần PRODUCTION ở trên.
>
> Ghi chú bảo mật: trên staging, mật khẩu `000000` và OTP `000000` vẫn là "dev bypass" đăng nhập được mọi tài khoản — vì `APP_ENV=production` mà code cũ vẫn nhận magic code. Từ commit `3c50f33` điều kiện đã đổi thành `environment(['local','testing'])`, nên **lần deploy staging tiếp theo bypass sẽ tự tắt luôn ở đây** — nhớ chuẩn bị OTP thật trước khi deploy staging, nếu không sẽ không đăng nhập được để test.

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

### Tài khoản admin (staging)

Vào `https://admin.webco.io.vn/login`, số `0923456789`. Admin giờ là app riêng trên subdomain riêng (không còn route ẩn `/admin/login` trong app customer — đã gỡ khỏi build customer).

## SSH — đăng nhập bằng key (không dùng password)

Server đã tắt password auth hoàn toàn. Cách thiết lập lại từ đầu (nếu đổi máy local hoặc dựng server mới):

**1. Tạo key ở máy local:**

```bash
ssh-keygen -t ed25519 -f ~/.ssh/greencar-prod -N "" -C "greencar-prod-deploy"
```

**2. Cài public key lên server** (lần đầu vẫn cần password/console của VPS để vào):

```bash
# Cách chuẩn:
ssh-copy-id -i ~/.ssh/greencar-prod.pub root@103.148.57.141
# Hoặc thủ công: append nội dung ~/.ssh/greencar-prod.pub vào ~/.ssh/authorized_keys trên server
```

**3. Xác nhận key login được TRƯỚC KHI tắt password** (không làm bước này dễ tự khoá mình ngoài):

```bash
ssh -i ~/.ssh/greencar-prod -o BatchMode=yes root@103.148.57.141 "echo OK"
```

**4. Tắt password auth trên server** (drop-in để không sửa file gốc, ưu tiên cao `00-`):

```bash
printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\n' > /etc/ssh/sshd_config.d/00-disable-password-auth.conf
sshd -t && systemctl reload ssh
```

**5. (Tùy chọn) alias cho gọn** — thêm vào `~/.ssh/config` ở máy local:

```
Host greencar-staging
  HostName 103.148.57.141
  User root
  IdentityFile ~/.ssh/greencar-prod
```

→ sau đó chỉ cần `ssh greencar-staging`. Mất key = phải vào console VPS của nhà cung cấp để khôi phục.

## Kiến trúc deploy

| Thành phần | Giá trị |
|---|---|
| Thư mục app | `/var/www/green-car-airport` (git checkout, branch `main`) |
| Customer app | `https://webco.io.vn` → `frontend/dist/` |
| Admin app | `https://admin.webco.io.vn` → `frontend/dist-admin/` |
| Driver app | `https://driver.webco.io.vn` → `frontend/dist-driver/` |
| Backend API | Cả 3 vhost proxy `/api/` → PHP-FPM 8.4 (`unix:/run/php/php8.4-fpm.sock`) → `backend/public/index.php` |
| Nginx vhosts | `/etc/nginx/sites-available/webco.io.vn`, `/etc/nginx/sites-available/driver.webco.io.vn`, `/etc/nginx/sites-available/admin.webco.io.vn` |
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
# 2 file cùng tên .env → phải đặt tên riêng, không copy chung 1 chỗ (sẽ đè nhau)
cp backend/.env $BACKUP/backend.env && cp frontend/.env $BACKUP/frontend.env
cp -r frontend/dist $BACKUP/dist-previous

git fetch origin && git reset --hard origin/main

cd backend
COMPOSER_ALLOW_SUPERUSER=1 composer install --no-dev --optimize-autoloader --no-interaction
php artisan migrate --force          # KHÔNG BAO GIỜ dùng migrate:fresh — DB có dữ liệu thật (24 users, 75 bookings)
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
docker compose exec -T frontend npm run build:admin

rsync -az --delete -e "ssh -i ~/.ssh/greencar-prod" frontend/dist/        root@103.148.57.141:/var/www/green-car-airport/frontend/dist/
rsync -az --delete -e "ssh -i ~/.ssh/greencar-prod" frontend/dist-driver/ root@103.148.57.141:/var/www/green-car-airport/frontend/dist-driver/
rsync -az --delete -e "ssh -i ~/.ssh/greencar-prod" frontend/dist-admin/  root@103.148.57.141:/var/www/green-car-airport/frontend/dist-admin/
```

Lưu ý: `VITE_DRIVER_APP_URL` phải set lúc build customer (link "Đăng ký làm tài xế" ở Splash bake vào bundle).

### ⚠️ Config bên thứ 3 — nguồn ở đâu

Frontend chỉ dùng **6** biến `VITE_*` (grep `import.meta.env` để xác nhận), tất cả **bake vào
bundle lúc build**, không đọc runtime — nên đổi key là phải build + rsync lại:

| Biến | Dùng cho | Nguồn |
|---|---|---|
| `VITE_GOONG_API_KEY`, `VITE_GOONG_MAP_KEY` | Bản đồ + autocomplete địa chỉ (Goong) | `frontend/.env` máy local |
| `VITE_VAPID_PUBLIC_KEY` | Web push | `frontend/.env` — **phải khớp `VAPID_PUBLIC_KEY` ở backend `.env`**, lệch là push chết im lặng |
| `VITE_DRIVER_APP_URL` | Link sang app tài xế ở Splash | truyền qua `-e` lúc build |
| `VITE_CODE_PREFIX` | Tiền tố mã voucher admin tự sinh | `frontend/.env` (mặc định backend: `SGO`) |
| `VITE_MOCK` | Hiện nút đăng nhập nhanh dev | `frontend/.env`, production để `false` |

`VITE_FIREBASE_*` và `VITE_ZALO_APP_ID` trong `frontend/.env` là **config chết** — không file
nào trong `src/` dùng, đã verify không lọt vào bundle. (`VITE_FIREBASE_AUTH_DOMAIN` đang trỏ 1
URL ngrok cũ; vô hại vì không dùng, nhưng đừng tưởng Firebase đang chạy.)

Backend (`backend/.env` trên server, không có trong git) — **copy nguyên credential từ staging**:
OTP qua **ZNS Abenla** (`ABENLA_*`, `ZNS_PROVIDER=abenla`, `ZNS_FORCE_SEND=true`; `SOUTHTELECOM_*`
là provider dự phòng), thanh toán **SePay** (`SEPAY_*`, VCB `1017588888`), push `VAPID_*`.
Production dùng **chung tài khoản nhà cung cấp với staging** — hết quota/đổi key là ảnh hưởng cả hai.
`MAIL_MAILER=log` vì production không có mailpit (mail chỉ ghi vào `storage/logs`).

### 3. Verify sau deploy

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://webco.io.vn/            # 200
curl -s https://webco.io.vn/api/pages/terms                              # JSON điều khoản
curl -s https://driver.webco.io.vn/ | grep -o '<title>[^<]*</title>'     # Save Go Tài Xế
curl -s https://admin.webco.io.vn/ | grep -o '<title>[^<]*</title>'      # Save Go Admin
```

⚠️ **Title đúng CHƯA đủ** — đã từng có bug 2 build ra cùng 1 bundle customer nhưng title vẫn khác nhau. Phải verify nội dung bundle thật:

```bash
# Bundle driver phải chứa chuỗi UI chỉ có ở app driver:
BUNDLE=$(curl -s https://driver.webco.io.vn/ | grep -o '/assets/index-[^"]*\.js')
curl -s "https://driver.webco.io.vn$BUNDLE" | grep -c "Chưa đăng ký tài xế"   # >= 1
# Bundle admin phải chứa chuỗi UI chỉ có ở app admin:
ADMIN_BUNDLE=$(curl -s https://admin.webco.io.vn/ | grep -o '/assets/index-[^"]*\.js')
curl -s "https://admin.webco.io.vn$ADMIN_BUNDLE" | grep -c "Quản trị viên"    # >= 1
# Bundle customer KHÔNG được còn chứa UI admin (đã gỡ khỏi build customer):
CUSTOMER_BUNDLE=$(curl -s https://webco.io.vn/ | grep -o '/assets/index-[^"]*\.js')
curl -s "https://webco.io.vn$CUSTOMER_BUNDLE" | grep -c "Tạo trang mới"       # phải = 0
# Và 3 app phải ra 3 file hash KHÁC nhau:
curl -s https://webco.io.vn/ | grep -o '/assets/index-[^"]*\.js'
curl -s https://driver.webco.io.vn/ | grep -o '/assets/index-[^"]*\.js'
curl -s https://admin.webco.io.vn/ | grep -o '/assets/index-[^"]*\.js'
```

## Backup

- Mỗi lần deploy: `/root/deploy-backups/<timestamp>/` trên server (env files + composer + dist cũ).
- DB: chưa có backup tự động — cần setup (TODO).

## Lịch sử / ghi chú

- 2026-07-26: Deploy PR #5 — nối dây referral cho đăng ký tài xế + sửa bug OTP + bộ e2e Playwright. Không có migration mới (`Nothing to migrate`), `composer.lock` không đổi. Backend chỉ đổi `AuthController::registerDriver()` (nhận `referral_code`, lưu `referred_by_user_id`); frontend đổi 4 file (`api/auth.ts`, `useAuthLogin.ts`, `RegisterPage.tsx`, `DriverRegisterPage.tsx`). Verify: 3 app 200, 3 hash bundle khác nhau và khớp build local, marker driver/admin đúng, customer không chứa UI admin, bundle driver chứa chuỗi mới "Mã giới thiệu"/"Nhập mã nếu có", API chấp nhận field `referral_code`.
  - ⚠️ **Bẫy khi build:** `docker compose exec frontend` chạy từ thư mục khác project sẽ báo `service "frontend" is not running` và **không build gì cả** — dễ rsync nhầm bundle cũ. Nếu đang có git worktree với container riêng, phải build từ repo chính. Quan trọng hơn: worktree có thể có `frontend/.env` với key Goong giả (dùng cho e2e); build nhầm từ đó sẽ nướng key giả vào bundle và làm chết autocomplete địa chỉ mà không có lỗi rõ ràng. Luôn kiểm tra trước khi rsync: `grep -c "e2e-test-placeholder" dist/assets/*.js` phải = 0, và key thật phải có mặt.
  - Cách build an toàn không đụng container đang chạy: `docker compose run --rm --no-deps -T -e VITE_DRIVER_APP_URL=https://driver.webco.io.vn frontend sh -c "npm install && npm run build:customer && npm run build:driver && npm run build:admin"`

- 2026-07-10: Deploy tính năng Admin trừ/xóa điểm Cộng Tác Viên (2 route mới `POST /admin/customers/{user}/deduct-points` và `.../reset-points`, field `points` trong `GET /admin/customers`, lịch sử ví CTV hiện cả giao dịch admin trừ điểm). Không có migration mới. Verify qua HTTPS: 3 app 200 + đúng bundle + hash khác nhau, admin bundle chứa chuỗi UI mới ("Trừ điểm"/"Xóa điểm về 0"), `GET /api/admin/customers` xác nhận field `points` xuất hiện trên dữ liệu thật.
- 2026-07-09: Tách Admin thành app/PWA riêng (`dist-admin/`, subdomain `admin.webco.io.vn`, bỏ prefix `/admin` khỏi route). Đã tạo vhost + DNS + SSL cho `admin.webco.io.vn` (certbot, hết hạn 2026-10-07) — deploy lên staging xong, verify qua HTTPS OK (title, manifest, marker bundle, hash khác 2 app còn lại).
- 2026-07-05: Deploy domain-separation (2 app customer/driver) + static pages CRUD + phone-normalization. Tạo vhost `driver.webco.io.vn` + SSL. Tắt SSH password auth, chuyển sang key `greencar-prod`. Fix bug entry-swap build (2 app ra cùng bundle). Fix quyền storage (root artisan → 500). Fix check số dư ví khi tài xế nhận cuốc (BIGINT unsigned crash).
- `savego.com.vn` chưa có DNS (dự kiến domain chính thức khi lên production riêng) — staging dùng `webco.io.vn` + `driver.webco.io.vn` + `admin.webco.io.vn`.

### TODO
- ~~Tắt dev bypass `000000`~~ — xong ở commit `3c50f33` (chỉ còn `local`/`testing`).
- ~~Backup DB tự động~~ — xong trên production (cron 03:15 hằng ngày). **Staging vẫn chưa có.**
- ~~Queue worker~~ — không cần: repo không có Job/Notification/Command nào đẩy vào queue.
- ~~DB + env riêng cho production~~ — xong.
- ~~Tài khoản admin production~~ — xong, đã tạo `0868968312` (id=1, role=admin, có mật khẩu).
- ~~DNS + SSL cho `driver.` / `admin.`~~ — xong, cả 3 app đã chạy HTTPS.
- **Nên làm:** đổi mật khẩu admin production (mật khẩu khởi tạo đã đi qua log phiên deploy).
- **Nên tách credential bên thứ 3 khỏi staging** — hiện production dùng chung tài khoản ZNS Abenla / SePay / VAPID với staging. Test trên staging có thể đốt quota SMS của production, và thu hồi key vì lý do gì cũng làm chết cả hai.
- Dọn `VITE_FIREBASE_*` + `VITE_ZALO_APP_ID` khỏi `frontend/.env` / `.env.example` nếu không định dùng — đang là config chết gây hiểu nhầm.
- Test `SsePublisherTest::trip accept publishes trip taken` đang FAIL sẵn trên `main` (assert sai channel: mong `driver.trips.events`, thực tế `customer.1.events`) — không liên quan deploy, nhưng nên sửa.
