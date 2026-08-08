# Deploy — GreenCA

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

### ⚠️ Queue worker + scheduler — BẮT BUỘC

`QUEUE_CONNECTION=redis` và **cả 12 notification trong `app/Notifications/` đều
`implements ShouldQueue`**, cộng `app/Jobs/SendNewBookingBroadcastJob`. Không có worker
thì mọi thông báo (đặt cuốc, nhận cuốc, huỷ, hoàn thành, nạp điểm…) nằm im trong Redis,
**không lỗi, không log, chỉ đơn giản là không bao giờ tới tay người dùng**.

`routes/console.php` có `Schedule::command('bookings:expire')->hourly()` — không có cron
`schedule:run` thì booking quá hạn treo mãi ở `finding_driver`.

| Thành phần | Nơi cấu hình | Chạy bằng |
|---|---|---|
| Queue worker | `/etc/systemd/system/greenca-queue.service` (enabled, auto-restart) | `www-data` |
| Scheduler | `/etc/cron.d/greenca-scheduler` — `schedule:run` mỗi phút | `www-data` |
| Log | `/var/log/greenca-queue.log`, `/var/log/greenca-scheduler.log` | logrotate `/etc/logrotate.d/greenca` |

**Không dùng supervisor** — dùng systemd, đã đủ và không phải cài thêm gói.

⚠️ **Cả hai PHẢI chạy bằng `www-data`.** Chạy bằng root thì file cache/log sinh ra thuộc
root, PHP-FPM mất quyền ghi và mọi request trả 500 không để lại vết.

⚠️ **`php artisan tinker` KHÔNG chạy được dưới `www-data`** — psysh không ghi được
`/var/www/.config/psysh` nên script im lặng không thực thi (không báo lỗi rõ). Chạy tinker
bằng root, xong nhớ `chown -R www-data:www-data storage bootstrap/cache`.

Kiểm tra worker còn sống và có tiêu thụ job:

```bash
systemctl status greenca-queue
tail -f /var/log/greenca-queue.log          # mỗi job in RUNNING rồi DONE/FAIL
php artisan queue:failed                    # job chết nằm ở đây
```

### ⚠️ PHP-FPM — SSE phải chạy pool RIÊNG

| Pool | Socket | Phục vụ | max_children |
|---|---|---|---|
| `www` | `php8.5-fpm.sock` | toàn bộ API thường | 20 |
| `sse` | `php8.5-fpm-sse.sock` | `/api/customer/stream`, `/api/driver/stream` | 30 (ondemand) |

Config nằm trong repo: `deploy/php-fpm/sse.conf` + `deploy/nginx/greenca-common.conf`.
Pool `www` là file của distro, phải sửa tay (mặc định Ubuntu chỉ **5**).

**Lý do:** 2 controller SSE giữ kết nối tới 300s, blocking trong `$redis->subscribe()`.
PHP-FPM là mô hình 1 kết nối = 1 process, nên mỗi client PWA đang mở app chiếm trọn
1 worker suốt 5 phút. Chung pool thì số client realtime ≥ `pm.max_children` là API
thường hết worker, mọi request xếp hàng.

**Sự cố 2026-08-08:** `pm.max_children=5`, cao điểm 47 request stream/giờ (≈3,9 worker
bị chiếm liên tục) và 7 client đồng thời → `unread-count` mất **48,66s**,
`trips/{id}/status` **34,29s**.

⚠️ **Bẫy chẩn đoán:** load average lúc đó chỉ **0.17**, RAM còn 6,8GB. Worker không
đốt CPU — chúng nằm chờ Redis. Nhìn `top`/`uptime` sẽ kết luận sai là "server khoẻ".
Lệnh đúng để soi:

```bash
grep max_children /var/log/php8.5-fpm.log                              # bằng chứng cạn pool
ps --no-headers -o args -C php-fpm8.5 | sed 's/php-fpm: //' | sort | uniq -c   # child theo pool
redis-cli client list | grep -c cmd=subscribe                          # số stream đang mở
```

Còn giới hạn: trần mới là 30 client realtime đồng thời. Vượt ngưỡng sẽ tắc lại,
khác là chỉ SSE chết còn API vẫn sống. Hết hẳn thì phải đưa SSE ra khỏi PHP-FPM.

### ⚠️ Reverb — WebSocket server, BẮT BUỘC chạy

Realtime đã chuyển từ SSE sang Reverb. Không chạy tiến trình này thì app vẫn hoạt
động bình thường nhưng **không có cập nhật realtime nào** — tài xế không thấy cuốc
mới xuất hiện, khách không thấy trạng thái đổi cho tới khi tự refresh.

| Thành phần | Nơi cấu hình |
|---|---|
| Service | `deploy/systemd/greenca-reverb.service` → `/etc/systemd/system/` |
| Proxy WSS | `location /app/` trong `deploy/nginx/greenca-common.conf` |
| Log | `/var/log/greenca-reverb.log` |

```bash
cp deploy/systemd/greenca-reverb.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now greenca-reverb
systemctl status greenca-reverb
```

#### ⚠️ Bẫy: `REVERB_HOST` ở backend và frontend là HAI giá trị KHÁC nhau

Cùng tên biến nhưng hai vai trò ngược nhau — đặt nhầm thì broadcast đi vào hư
không mà **không có lỗi nào** (đã dính đúng lỗi này lúc dựng ở môi trường dev).

| | Giá trị production | Vai trò |
|---|---|---|
| `backend/.env` → `REVERB_HOST` | `127.0.0.1`, port `8081`, scheme `http` | Nơi **backend gửi** sự kiện tới Reverb |
| build frontend → `VITE_REVERB_HOST` | `greenca.vn`, port `443`, scheme `https` | Nơi **trình duyệt kết nối** tới (qua nginx) |

`REVERB_APP_KEY` / `SECRET` / `APP_ID` phải sinh riêng cho production, không dùng
lại của dev. `VITE_REVERB_APP_KEY` phải khớp `REVERB_APP_KEY`.

#### Sau mỗi lần deploy

```bash
systemctl restart greenca-reverb    # tiến trình giữ code CŨ trong bộ nhớ, giống queue worker
```

#### Kết quả load test trên production (2026-08-09, nửa đêm, không có người dùng)

Đo bằng bộ tạo tải Node mở WebSocket thật vào `wss://greenca.vn/app/<key>`.
**Không dùng trình duyệt để đo sức chứa** — Chrome chặn ~255 WebSocket mỗi host,
đo bằng trình duyệt sẽ ra kết luận sai là "server chỉ chịu được 255".

| Số kết nối | RSS Reverb | CPU | RAM trống | API |
|---|---|---|---|---|
| 0 (nền) | 61–67MB | 0,2% | 6,6GB | 60ms |
| 255 | 69MB | 0,3% | 6,6GB | bình thường |
| 1003 | 82MB | 0,3% | 6,5GB | **thất bại** → đã sửa |
| >1016 | — | — | — | Reverb thoát, rớt sạch kết nối |

**Chi phí mỗi kết nối ~15KB.** RAM không phải nút thắt: 5.000 kết nối ≈ 75MB.

Ba trần đã chạm và cách xử lý:

1. **nginx worker `Max open files` = 1024.** Mỗi WS proxy tốn 2 fd (client +
   upstream). Khi cạn, **API thường cũng ngừng phục vụ** — đúng loại sự cố cũ,
   chỉ chuyển từ PHP-FPM sang nginx. Đã thêm `worker_rlimit_nofile 65535`.
   ⚠️ Phải `systemctl restart nginx`, `reload` KHÔNG áp được directive này.
2. **Tiến trình Reverb `Max open files` = 1024.** `LimitNOFILE=524288` trong
   unit chỉ nâng hard limit, tiến trình vẫn dùng soft. Đã ghi `65535:65535`.
3. **`stream_select()` của PHP giới hạn `FD_SETSIZE = 1024`** — đã xử lý bằng
   `ext-event`. Không có extension này, ReactPHP rơi về `StreamSelectLoop`:

   ```bash
   php -r 'require "vendor/autoload.php"; echo get_class(React\EventLoop\Loop::get());'
   # StreamSelectLoop  → trần ~1000, PHẢI sửa
   # ExtEventLoop      → dùng epoll, không còn trần 1024
   ```

   Triệu chứng khi chạm trần rất dễ chẩn đoán nhầm: Reverb **thoát sạch**
   (`Deactivated successfully`, đỉnh bộ nhớ chỉ 57MB), systemd khởi động lại,
   **toàn bộ client mất kết nối** — trông như crash ngẫu nhiên chứ không giống
   hết tài nguyên.

#### Cài `ext-event` (đã làm trên production 2026-08-09)

```bash
apt-get install -y php8.5-dev libevent-dev libssl-dev build-essential
printf "\n\n\n\n\n\n" | pecl install event      # 6 câu hỏi tương tác, để mặc định
# CHỈ bật cho CLI — Reverb chạy CLI, FPM không dùng nên không cần thêm rủi ro.
# Priority 30 để nạp SAU sockets (20), là yêu cầu của ext-event.
ln -sf /etc/php/8.5/mods-available/event.ini /etc/php/8.5/cli/conf.d/30-event.ini
systemctl restart greenca-reverb
```

Danh sách gói trước/sau khi cài lưu ở `/root/pkgs-{before,after}-event.txt`
(80 gói thêm mới, chủ yếu là bộ công cụ biên dịch).

#### Kết quả SAU khi gỡ cả 3 trần

| Số kết nối | RSS Reverb | CPU | fd | RAM trống | API | restart |
|---|---|---|---|---|---|---|
| 3.000 | — | — | — | 6,4GB | 200 / 32–47ms | 0 |
| **4.996** | **153MB** | **3,4%** | 5.005 | 6,2GB | 200 / 31–43ms | **0** |

**Đạt mục tiêu 5.000 tài xế đồng thời**, chi phí ~18KB mỗi kết nối, CPU 3,4%,
RAM còn trống 6,2GB, API hoàn toàn không bị ảnh hưởng. Mở 5.000 kết nối mất 28s.

#### ⚠️ Build frontend PHẢI dùng `--mode staging` / `--mode production`

Vite ưu tiên file `.env` **HƠN** biến môi trường truyền lúc build, nên
`-e VITE_REVERB_APP_KEY=...` bị giá trị dev trong `frontend/.env` ghi đè —
bundle mang key dev, Reverb từ chối, mất realtime mà không có lỗi rõ ràng.
Chỉ file theo mode (`.env.staging`) mới thắng được `.env`:

```bash
docker compose exec -T frontend sh -c \
  './node_modules/.bin/vite build --config vite.customer.config.ts --mode staging'
```

Kiểm sau khi build (bắt buộc — đã dính đúng lỗi này):

```bash
grep -c "<APP_KEY của môi trường>" frontend/dist/assets/index-*.js   # phải >= 1
grep -c "localhost:8081"           frontend/dist/assets/index-*.js   # phải = 0
```

`docker compose run` KHÔNG có `node_modules` (volume ẩn danh) — build bằng
`docker compose exec` trên container đang chạy.

#### Kiểm tra

```bash
systemctl is-active greenca-reverb
ss -tlnp | grep 8081                                    # phải nghe ở 127.0.0.1
curl -s -o /dev/null -w '%{http_code}\n' https://greenca.vn/app/test   # KHÔNG được 502
tail -f /var/log/greenca-reverb.log
```

Hai endpoint SSE cũ (`/api/driver/stream`, `/api/customer/stream`) **vẫn còn** để
app đã cài trên máy người dùng không chết trong lúc chuyển đổi. Gỡ chúng cùng pool
FPM `sse` sau khi toàn bộ client đã cập nhật.

### Tuning server (2026-08-08)

Server dựng xong để nguyên mặc định distro. Đã tune, config versioned trong repo:

| File repo | Copy tới |
|---|---|
| `deploy/mysql/zz-greenca.cnf` | `/etc/mysql/mysql.conf.d/` |
| `deploy/php-fpm/99-greenca.ini` | `/etc/php/8.5/fpm/conf.d/` |
| `deploy/php-fpm/sse.conf` | `/etc/php/8.5/fpm/pool.d/` |
| `deploy/nginx/greenca-common.conf` | `/etc/nginx/snippets/` |

| Hạng mục | Trước | Sau |
|---|---|---|
| `innodb_buffer_pool_size` | 128MB | 2GB |
| `innodb_redo_log_capacity` | 100MB | 1GB |
| `slow_query_log` | OFF | ON, `long_query_time=1` → `/var/log/mysql/slow.log` |
| `max_connections` | 151 | 300 |
| PHP `memory_limit` | **-1 (vô hạn)** | 256M |
| PHP opcache | 128MB, validate_timestamps=1 | 256MB, validate_timestamps=**0** |
| nginx `worker_connections` | 768 | 8192 |
| nginx `gzip_types` | **bị comment** → chỉ nén HTML | bật đủ JS/CSS/JSON |
| Cache asset | không có header | `/assets/` immutable 1 năm |
| Redis | `maxmemory 0` + `noeviction` | 512MB + `volatile-lru` |

`innodb_flush_log_at_trx_commit` **giữ nguyên = 1** — ví điểm là tiền, không đánh
đổi độ bền ghi lấy tốc độ.

Redis dùng `volatile-lru` chứ KHÔNG phải `allkeys-lru`: cache/session có TTL nên
bị đuổi trước, còn job trong queue không có TTL nên được giữ lại. Chọn nhầm
`allkeys-lru` là mất job.

Kết quả đo: JS bundle 1085KB → **337KB** qua gzip; 30 request song song chậm nhất
0,150s; EXPLAIN các truy vấn nóng chuyển từ full scan sang dùng index.

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

# BẮT BUỘC: worker đang giữ code CŨ trong bộ nhớ. Không restart thì job vẫn
# chạy bằng bản trước khi deploy cho tới khi worker tự hết --max-time (1 giờ).
php artisan queue:restart
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

Chỉ cần cho admin **đầu tiên** trên DB trống. Từ admin thứ hai trở đi dùng màn
`admin.greenca.vn` → tab **Admin** (tạo, đổi tên, đặt lại mật khẩu, khoá/bỏ khoá).

DB production khởi tạo trống nên phải tạo admin đầu tiên thủ công. Lưu ý `password` **không** có
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

## Giám sát (cảnh báo hỏng âm thầm)

`/usr/local/bin/greenca-healthcheck.sh`, cron `/etc/cron.d/greenca-monitor` chạy **5 phút/lần**.

Giám sát riêng `failed_jobs` là KHÔNG đủ — ca tệ nhất là **worker chết**: job dồn trong
Redis, `failed_jobs` vẫn bằng 0, không lỗi không log. Script kiểm 4 dấu hiệu:

| Kiểm | Vì sao |
|---|---|
| `greenca-queue` không `active` | Worker chết → mọi thông báo ngừng, hoàn toàn im lặng |
| `failed_jobs` > 0 | Job chết (kèm tên class gần nhất) |
| Queue tồn đọng > `QUEUE_BACKLOG_MAX` (50) | Worker sống nhưng kẹt / không kịp |
| `greenca-scheduler.log` không đổi > `SCHEDULER_STALE_MIN` (10 phút) | Cron hỏng → booking quá hạn không tự huỷ |

**Chống spam:** chỉ gửi khi trạng thái ĐỔI (lưu ở `/var/lib/greenca-monitor/last-status`),
và gửi 1 tin khi hồi phục. Lỗi kéo dài không bị dội lại mỗi 5 phút.

### Cấu hình Telegram

**ĐÃ NỐI XONG (2026-08-07)** — bot `@GreenCarAirportBot`, gửi vào chat riêng của chủ app.
Token + chat_id nằm ở `/etc/greenca-monitor.conf` (chmod 600, **KHÔNG có trong git**).
Chưa điền token thì script vẫn chạy đúng nhưng cảnh báo chỉ ghi `syslog` +
`/var/log/greenca-monitor.log` — không ai nhận được.

Khi cần đổi bot / thêm nhóm nhận:

```bash
# 1) Nhắn @BotFather -> /newbot -> lấy token
# 2) BẤM START trong chat với bot (chỉ mở khung chat KHÔNG đủ — Telegram
#    không ghi nhận gì, getUpdates sẽ trả result rỗng)
# 3) Lấy chat_id: https://api.telegram.org/bot<TOKEN>/getUpdates
#    -> result[0].message.chat.id
# 4) Điền vào /etc/greenca-monitor.conf rồi thử:
/usr/local/bin/greenca-healthcheck.sh --test    # gửi tin thử
/usr/local/bin/greenca-healthcheck.sh --now     # kiểm ngay, báo dù trạng thái không đổi
```

⚠️ **Gửi vào NHÓM:** chat_id nhóm là số **ÂM** (`-100xxxxxxxxxx`), và phải mời bot vào nhóm.
Bot mặc định bật privacy mode (`can_read_all_group_messages: false`) nên **không đọc được tin
nhắn thường trong nhóm** — muốn lấy chat_id phải gõ đích danh `/start@<tên_bot>`, gõ `/start`
trơn sẽ không ăn thua và `getUpdates` vẫn rỗng.

⚠️ `getUpdates` trả rỗng còn có thể do **webhook đang chiếm update** — kiểm bằng
`getWebhookInfo`, nếu `url` khác rỗng thì `getUpdates` luôn rỗng.

Đã test thực tế cả 4 loại phát hiện (dừng worker, chèn failed_job giả, nhồi 60 job vào
queue, lùi mtime log scheduler), cộng chống spam và tin hồi phục — đều đúng.

### Cảnh báo sắp hết tiền / quota bên thứ 3

`/usr/local/bin/greenca-quota-check.sh`, cron `/etc/cron.d/greenca-quota` chạy **hàng giờ**
(số dư không đổi nhanh, và mỗi lần kiểm là một lệnh gọi ra ngoài). Cùng cơ chế chống spam.

### Báo cáo số dư ZNS hàng ngày (khác cảnh báo sự cố)

`/usr/local/bin/greenca-daily-report.sh`, cron `/etc/cron.d/greenca-daily-report` chạy
**08:00 mỗi ngày** — LUÔN gửi Telegram dù số dư vẫn ổn, khác hẳn `greenca-quota-check.sh`
(chỉ báo khi trạng thái đổi, tránh spam). Đây là báo cáo định kỳ cho người vận hành biết
số dư, không phải cảnh báo sự cố. Dùng chung `php artisan zns:balance` và
`/etc/greenca-monitor.conf` (Telegram, `ZNS_BALANCE_MIN`) với script cảnh báo — không có
logic tra số dư thứ hai. Test thủ công: `/usr/local/bin/greenca-daily-report.sh` (gửi ngay,
không đợi cron).

| Dịch vụ | Cảnh báo TRƯỚC khi hết? | Cách làm |
|---|---|---|
| **ZNS** (Abenla / SouthTelecom) | ✅ Có | `php artisan zns:balance --min=N` — tra số dư provider đang dùng |
| **Goong** | ❌ **Không thể** | Goong KHÔNG có API quota, chỉ "gọi thử" phát hiện lúc ĐÃ hỏng |
| **SePay** | — | Bỏ qua: cổng thanh toán, không có khái niệm quota, và đang nạp điểm thủ công |

⚠️ **Goong không có API tra số dư/quota.** [docs.goong.io/rest](https://docs.goong.io/rest/)
chỉ có Directions, Trip, Speed Limit, Distance Matrix, Places, Geocoding, Static Map — không
có endpoint nào cho quota. Nên với Goong chỉ làm được "canary": gọi thử một request rẻ,
hỏng thì báo. **Đây là phát hiện lúc đã gián đoạn, KHÔNG phải cảnh báo sớm.** Muốn biết
trước thì phải tự vào dashboard Goong xem, hoặc tự đếm request phía app.

⚠️ **Production KHÔNG có `frontend/.env`** (frontend build ở máy local, chỉ rsync `dist/`),
nên key Goong cho canary phải đặt trong `/etc/greenca-monitor.conf`. Thiếu key thì script
**báo "chưa giám sát được Goong"** chứ không im lặng bỏ qua — im lặng thì lại tưởng đang
giám sát mà thực ra không.

Quy ước exit code của `zns:balance` (tách bạch có chủ ý):

| Exit | Nghĩa | Cảnh báo |
|---|---|---|
| 0 | Còn trên ngưỡng | không |
| 1 | **Dưới ngưỡng** | "sắp hết tiền, nạp ngay" |
| 2 | **Không tra được** | "không tra được số dư" — KHÁC hẳn hết tiền |

Gộp 1 và 2 làm một là sai lầm dễ mắc: hiện Abenla trả `Code 104` kèm `"Balance": 0.0` vì
IP chưa whitelist — gộp lại thì sẽ báo "hết tiền" và người ta đi nạp tiền oan mà app vẫn hỏng.

**Ngưỡng `ZNS_BALANCE_MIN=100000`** — giá ZNS là **365đ/tin** (chủ app xác nhận 2026-08-07),
nên 100.000đ ≈ **273 tin** còn lại lúc cảnh báo nổ: đủ thời gian nạp trước khi gián đoạn.
Chỉnh trong `/etc/greenca-monitor.conf`.

⚠️ **Số dư 24.890đ ≈ 68 tin — ĐANG dưới ngưỡng.** Ngay khi Abenla whitelist IP production,
cảnh báo "sắp hết tiền" sẽ nổ ở lần kiểm đầu. Đó là cảnh báo ĐÚNG, không phải báo động giả.

⚠️ **Con số 24.890 đo được từ STAGING, không phải production.** Abenla chặn theo **IP nguồn**,
mà production `45.124.95.47` chưa được whitelist — gọi từ đó luôn ra `Code 104`. Cùng tài
khoản `ABHP77G`, cùng credential, chỉ khác IP:

| Gọi từ | Kết quả |
|---|---|
| Production `45.124.95.47` | `{"Balance":0.0,"Code":104,"Message":"CanNotAccess"}` |
| Staging `103.148.57.141` | `{"Balance":24890.0000,"Code":106,"Message":"Success"}` |

Nên đừng ngạc nhiên khi thấy "production không tra được số dư" đi cùng một con số cụ thể —
số đó lấy từ staging. Và **`Balance: 0.0` ở dòng production KHÔNG phải số dư bằng 0**, nó là
giá trị mặc định trong payload lỗi.

Muốn xem số dư trong lúc chờ whitelist: chạy `php artisan zns:balance` **trên staging**,
hoặc gọi `GetBalance` bằng curl từ staging. KHÔNG nên sửa script giám sát để đọc số dư qua
staging — production sẽ phụ thuộc staging, và thành code chết ngay khi whitelist xong.

**Chưa verify được đường "dưới ngưỡng" từ production** vì Abenla đang chặn IP nên không đọc
nổi số dư. Đã verify: parse đúng phản hồi thật (`{"Balance":24890.0000,"Code":106}` gọi từ
staging) + 3 unit test cho 3 nhánh exit code.

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
| Queue worker | `greenca-queue.service` (systemd, `www-data`) — dựng 2026-08-09 |
| Scheduler | `/etc/cron.d/greenca-scheduler` — dựng 2026-08-09 |
| Reverb | `greenca-reverb.service` (systemd, `127.0.0.1:8081`) — dựng 2026-08-09 |

⚠️ **Staging là server DÙNG CHUNG** với nhiều site khác (`amd.io.vn`,
`amdnewtech.shop`, `chuyennhataman.net`…). Sửa `nginx.conf` hay restart PHP-FPM
là ảnh hưởng cả các site đó — chỉ đụng đúng 3 vhost `*webco.io.vn`.

### ⚠️ Bẫy 2026-08-09: hai queue worker "ma" chạy bằng root

Trước 2026-08-09, staging có **2 worker do supervisor quản lý**
(`/etc/supervisor/conf.d/laravel-worker.conf`, `user=root`, `numprocs=2`) mà
không tài liệu nào nhắc tới. Hậu quả:

- Chúng **giành job** với worker mới, và vì khởi động từ trước lần deploy nên
  giữ config CŨ trong bộ nhớ → job broadcast bị xử lý bằng driver `log`,
  báo thành công, không có gì tới Reverb. Nhìn từ ngoài: realtime "im lặng
  không chạy", `queue:failed` trống, không lỗi ở đâu cả.
- Chạy `user=root` là đúng cái bẫy đã ghi ở mục production: file `storage/` và
  `bootstrap/cache/` thành của root → PHP-FPM mất quyền ghi → 500 không dấu vết.

Đã tắt (`conf` đổi tên thành `.disabled-<ngày>`) và gom về một `greenca-queue`
systemd duy nhất, giống production. **Khi nghi realtime/notification không chạy,
việc đầu tiên là đếm worker:**

```bash
ps -o user,pid,args -C php --no-headers | grep queue:work   # phải CHỈ 1, user www-data
supervisorctl status 2>/dev/null                            # phải trống
```

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
`MAIL_MAILER=log` là ĐÚNG, không phải tạm bợ: cả 12 notification đều dùng kênh
`['database', WebPushChannel]`, không có notification nào gửi mail — production không cần SMTP.

#### 💰 Nạp điểm tài xế: THỦ CÔNG (quyết định 2026-08-06)

Chủ app chọn nạp tay trước, **chưa dùng webhook SePay tự động**. Nghĩa là:

- App tài xế VẪN hiện màn nạp điểm với mã QR VietQR (`GET /driver/wallet/topup-info`)
  trỏ vào VCB `1017588888`. Tài xế quét QR và chuyển khoản thật.
- **Không có gì tự cộng điểm.** Webhook SePay (`POST /api/webhooks/sepay`) chưa được trỏ
  về production, nên tiền vào tài khoản mà điểm không tăng, và **không có thông báo nào cả**.
- Admin phải **tự đối chiếu sao kê ngân hàng rồi cộng tay** qua
  `POST /admin/drivers/{user}/topup`. Nội dung chuyển khoản trong QR là `payment_code`
  của tài xế (dạng `GCA000123` — derive từ `config('app.code_prefix')` + user id),
  dùng nó để biết ai vừa chuyển.

⚠️ Rủi ro vận hành: nếu không ai theo dõi sao kê, tài xế chuyển tiền xong sẽ chờ mãi.
Khi nào muốn bật tự động: trỏ webhook SePay về `https://greenca.vn/api/webhooks/sepay`,
đối chiếu `SEPAY_WEBHOOK_API_KEY` với dashboard SePay, và kiểm `FEATURE_AUTO_TOPUP`
(mặc định `true`, chỉ được đọc trong `SepayWebhookService`).

### 3. Verify sau deploy

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://webco.io.vn/            # 200
curl -s https://webco.io.vn/api/pages/terms                              # JSON điều khoản
curl -s https://driver.webco.io.vn/ | grep -o '<title>[^<]*</title>'     # GreenCA Tài Xế
curl -s https://admin.webco.io.vn/ | grep -o '<title>[^<]*</title>'      # GreenCA Admin
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
- Domain chính thức là `greenca.vn` (production, đã có DNS + SSL — xem mục PRODUCTION ở đầu file). Staging vẫn dùng `webco.io.vn` + `driver.webco.io.vn` + `admin.webco.io.vn`. Domain cũ `savego.com.vn` đã bỏ hẳn.

### TODO
- ~~Tắt dev bypass `000000`~~ — xong ở commit `3c50f33` (chỉ còn `local`/`testing`).
- ~~Backup DB tự động~~ — xong trên production (cron 03:15 hằng ngày). **Staging vẫn chưa có.**
- ~~Queue worker~~ — không cần: repo không có Job/Notification/Command nào đẩy vào queue.
- ~~DB + env riêng cho production~~ — xong.
- ~~Tài khoản admin production~~ — xong, đã tạo `0868968312` (id=1, role=admin, có mật khẩu).
- ~~DNS + SSL cho `driver.` / `admin.`~~ — xong, cả 3 app đã chạy HTTPS.
- **Nên làm:** đổi mật khẩu admin production (mật khẩu khởi tạo đã đi qua log phiên deploy) — sau khi deploy màn Admin thì làm ngay trong UI: tab **Admin** → "Đổi mật khẩu của tôi".
- **Nên tách credential bên thứ 3 khỏi staging** — hiện production dùng chung tài khoản ZNS Abenla / SePay / VAPID với staging. Test trên staging có thể đốt quota SMS của production, và thu hồi key vì lý do gì cũng làm chết cả hai.
- ~~`VAPID_SUBJECT` / `MAIL_FROM_ADDRESS` sai domain~~ — xong: `mailto:admin@greenca.vn` và `noreply@greenca.vn` (trước đó là `greencar.vn` và `greencarairport.vn`).
- **Redis `maxmemory=0` + `maxmemory-policy noeviction`** — không giới hạn bộ nhớ. `noeviction` là ĐÚNG cho queue (đổi sang `allkeys-lru` sẽ khiến job bị xoá = mất thông báo), nhưng nên đặt `maxmemory` có giới hạn và theo dõi, hoặc tách cache/session sang Redis DB khác với queue.
- ~~Giám sát `failed_jobs` + cảnh báo~~ — xong 2026-08-07, xem mục "Giám sát". Telegram đã nối, đã test chuỗi thật (dừng worker → nhận cảnh báo → khôi phục → nhận tin hồi phục).
- Dọn `VITE_FIREBASE_*` + `VITE_ZALO_APP_ID` khỏi `frontend/.env` / `.env.example` nếu không định dùng — đang là config chết gây hiểu nhầm.
- Test `SsePublisherTest::trip accept publishes trip taken` đang FAIL sẵn trên `main` (assert sai channel: mong `driver.trips.events`, thực tế `customer.1.events`) — không liên quan deploy, nhưng nên sửa.
- ⚠️ **Lỗ hổng test: suite chạy sqlite in-memory nhưng production là MySQL.** Mọi query dùng hàm riêng của MySQL (`DATE_FORMAT`, `groupByRaw`…) hoặc phụ thuộc hành vi MySQL (`only_full_group_by`, cột nhập nhằng sau `join`) **không được test che phủ** — bug 500 trang Doanh thu lọt lên production đúng vì lý do này. Nên có 1 job CI chạy suite trên MySQL. Trong lúc chưa có, chạy tay:

  ```bash
  docker compose exec -T mysql mysql -uroot -psecret -e "CREATE DATABASE IF NOT EXISTS green_car_airport_test; GRANT ALL ON green_car_airport_test.* TO 'laravel'@'%';"
  docker compose exec -T -e DB_CONNECTION=mysql -e DB_HOST=mysql -e DB_DATABASE=green_car_airport_test \
    app php artisan test
  ```
