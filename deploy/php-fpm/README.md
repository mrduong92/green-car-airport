# PHP-FPM — pool config production

| File | Copy tới | Ghi chú |
|---|---|---|
| `sse.conf` | `/etc/php/8.5/fpm/pool.d/sse.conf` | pool riêng cho 2 endpoint SSE |

Pool `www` (file mặc định của distro, không giữ trong repo) phải sửa tay:

```
pm.max_children      = 20   ; mặc định Ubuntu là 5
pm.start_servers     = 4
pm.min_spare_servers = 2
pm.max_spare_servers = 6
```

## Vì sao phải tách pool cho SSE

`Driver\StreamController` và `Customer\StreamController` giữ kết nối tới 300s,
blocking trong `$redis->subscribe()`. Trong mô hình PHP-FPM, **1 kết nối = 1
process**, nên mỗi client PWA đang mở app chiếm trọn 1 worker suốt 5 phút.

Dùng chung pool thì số client realtime đồng thời >= `pm.max_children` là mọi API
thường hết worker và phải xếp hàng trong socket backlog. Tách pool khiến SSE
không bao giờ ăn được worker của API — cô lập cơ chế hỏng thay vì chỉ dời trần.

Nginx phải trỏ 2 location stream sang `php8.5-fpm-sse.sock`
(xem `deploy/nginx/greenca-common.conf`).

## Sự cố 2026-08-08 (nguồn của config này)

| Bằng chứng | Số liệu |
|---|---|
| Pool config | `pm.max_children = 5` (mặc định Ubuntu) |
| Log FPM | `server reached pm.max_children setting (5)` |
| Tải SSE giờ cao điểm | 47 request stream/giờ × 300s = **~3,9 worker bị chiếm liên tục / tổng 5** |
| Client SSE đồng thời | 7 IP riêng biệt trong 1 giờ → 7 > 5 → cạn pool |
| Triệu chứng | `unread-count` 48,66s, `trips/{id}/status` 34,29s |
| Đánh lừa | load average **0.17**, RAM còn 6,8GB — worker nằm chờ Redis chứ không đốt CPU |

Nhìn `top`/`uptime` sẽ KHÔNG thấy gì bất thường. Dấu hiệu đúng để tìm:

```bash
grep max_children /var/log/php8.5-fpm.log
ps --no-headers -o args -C php-fpm8.5 | sed 's/php-fpm: //' | sort | uniq -c
redis-cli client list | grep -c cmd=subscribe
```

## Giới hạn còn lại

Tách pool nâng trần lên 30 client realtime đồng thời, **không xoá bỏ** ràng buộc
1 kết nối = 1 process. Vượt 30 sẽ tắc lại đúng như cũ, chỉ khác là lần này chỉ
SSE chết còn API vẫn sống. Muốn hết hẳn thì phải đưa SSE ra khỏi PHP-FPM
(Reverb / Octane / một process riêng), hoặc bỏ SSE dùng polling + web push.
