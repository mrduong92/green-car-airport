# Script vận hành production

Bản sao của những file đang chạy trên server `45.124.95.47`, để lỡ mất server thì
dựng lại được. **Sửa ở đây KHÔNG tự áp lên server** — phải `scp` lên rồi reload.

| File trong repo | Vị trí trên server | Chạy bởi |
|---|---|---|
| `greenca-queue.service` | `/etc/systemd/system/greenca-queue.service` | systemd, user `www-data` |
| `greenca-healthcheck.sh` | `/usr/local/bin/greenca-healthcheck.sh` | cron `/etc/cron.d/greenca-monitor`, 5 phút/lần |
| `backup-db.sh` | `/usr/local/bin/backup-db.sh` | cron `/etc/cron.d/greenca-db-backup`, 03:15 hằng ngày |

Các file chỉ có trên server, **không** để trong git vì chứa bí mật hoặc quá ngắn:

| Trên server | Nội dung |
|---|---|
| `/etc/greenca-monitor.conf` | Token Telegram + ngưỡng cảnh báo (chmod 600) |
| `/etc/cron.d/greenca-scheduler` | `schedule:run` mỗi phút, user `www-data` |
| `/etc/cron.d/greenca-monitor` | Gọi `greenca-healthcheck.sh` mỗi 5 phút |
| `/etc/cron.d/greenca-certbot-renew` | Gia hạn SSL dự phòng (02:17 + 14:17) |
| `/etc/logrotate.d/greenca` | Xoay vòng 5 file log của GreenCA |

⚠️ Queue worker và scheduler **phải chạy bằng `www-data`**. Chạy root thì file cache/log
sinh ra thuộc root, PHP-FPM mất quyền ghi → mọi request trả 500 mà không để lại vết.

Chi tiết đầy đủ: `docs/DEPLOY.md`, mục PRODUCTION.
