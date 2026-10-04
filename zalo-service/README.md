# GreenCA microservice Zalo (Cuốc Free)

Service **chỉ đọc** (TypeScript, SQLite): dùng N tài khoản Zalo phụ (thư viện không chính thức
`zca-js`) nghe tin mới trong các nhóm bắn cuốc, **lưu ngay** vào `data/zalo.sqlite` (bỏ tin trùng),
gửi heartbeat cho Laravel. Không gửi tin, không kết bạn. Giai đoạn 1 chưa tách cuốc, chưa gọi AI.
Spec: `docs/superpowers/specs/2026-10-04-zalo-free-rides-design.md`.

## Phát triển

Cần Node 22 (`nvm use` đọc `.nvmrc`). `better-sqlite3` có bản dựng sẵn cho Node 22; Node 20 đã hết hạn hỗ trợ.

```bash
npm install
npm test
npm run typecheck
```

## Đăng nhập tài khoản phụ (trên máy cá nhân)

```bash
npm install
npm run login -- acc1        # mở ảnh QR → quét bằng tài khoản Zalo PHỤ số 1
npm run login -- acc2        # tài khoản phụ số 2 ...
# → data/accounts/acc1.json, acc2.json (chmod 600) — phiên đăng nhập, giữ bí mật như mật khẩu
```

## Cài lên VPS (Ubuntu, Node 22 LTS)

```bash
sudo useradd --system --home /opt/greenca-zalo-service --shell /usr/sbin/nologin zalobot
sudo mkdir -p /opt/greenca-zalo-service/data/accounts
# copy mã nguồn (trừ node_modules, dist, data) lên /opt/greenca-zalo-service, rồi:
cd /opt/greenca-zalo-service && sudo npm ci && sudo npm run build
scp data/accounts/*.json <vps>:/opt/greenca-zalo-service/data/accounts/
sudo cp .env.example .env && sudo nano .env           # API_BASE_URL, BOT_SECRET, SERVICE_ID, DATA_DIR
sudo chown -R zalobot:zalobot /opt/greenca-zalo-service
sudo chmod 600 /opt/greenca-zalo-service/.env /opt/greenca-zalo-service/data/accounts/*.json
sudo timedatectl set-ntp true                         # lệch giờ > 5 phút → Laravel trả 401
sudo cp deploy/greenca-zalo-service.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now greenca-zalo-service
tail -f /var/log/greenca-zalo-service.log             # phải thấy "đăng nhập OK" và "listener đã kết nối" cho từng tài khoản
```

VPS **không cần mở cổng nào** — mọi kết nối đi ra (tới Zalo và Laravel).

## Thống kê (chốt chi phí AI sau 2–3 ngày)

```bash
sudo -u zalobot env DATA_DIR=/opt/greenca-zalo-service/data npm run stats -- --hours=72
```

## Khi một tài khoản bị khoá / phiên hết hạn

Log lặp lại `Tài khoản accX: đăng nhập lỗi` mỗi 60 giây, Telegram báo "tài khoản mất kết nối: accX";
các tài khoản khác vẫn chạy. Chạy lại `npm run login -- accX` trên máy cá nhân (hoặc thay bằng tài
khoản phụ mới), copy file lên VPS, `sudo systemctl restart greenca-zalo-service`.

## Bộ khung thông luồng: 1 nhóm → SQLite + mã deeplink người gửi

1. Đăng nhập nick phụ: `npm run login -- acc1`
2. Lấy ID nhóm: `npm run groups -- acc1` (in `ID<TAB>tên nhóm`)
3. Chạy chỉ với nhóm đó:
   ```bash
   ALLOWED_GROUP_IDS=<id-nhóm> API_BASE_URL=http://localhost:8080 BOT_SECRET=dev-secret npm run dev
   ```
4. Xem tin đã lưu kèm deeplink: `npm run build && npm run latest -- --limit=20`

Mỗi người gửi mới được lấy mã QR trang cá nhân (`getQR`, cách nhau 2 giây), giải mã và lưu **đoạn mã** vào
`senders.qr_code`. Deeplink mở trang Zalo người gửi: `zalo://qr/p/<qr_code>`. Người gửi tắt chia sẻ QR →
`qr_status = 'empty'` (không có deeplink).

```bash
sqlite3 data/zalo.sqlite "select m.content, s.display_name, 'zalo://qr/p/' || s.qr_code from messages m join senders s on s.uid = m.sender_uid order by m.id desc limit 10"
```
