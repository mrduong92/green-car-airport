# GreenCA microservice Zalo (Cuốc Free)

Service **chỉ đọc** (TypeScript, SQLite): dùng N tài khoản Zalo phụ (thư viện không chính thức
`zca-js`) nghe tin mới trong các nhóm bắn cuốc, **lưu ngay** vào `data/zalo.sqlite` (bỏ tin trùng),
gửi heartbeat cho Laravel. Không gửi tin, không kết bạn. Giai đoạn 5: mọi tin không trùng gửi AI (mặc định
OpenAI gpt-4.1-mini) tách cuốc trước; quy tắc chỉ còn là dự phòng khi AI hỏng/hết ngân sách → nguyên văn.
Gửi cuốc của người bắn có mã QR sang Laravel (tab Free).
Spec: `docs/superpowers/specs/2026-10-04-zalo-free-rides-design.md`, `docs/superpowers/specs/2026-10-10-zalo-free-rides-phase5-design.md`.

## Phát triển

Cần Node 22 (`nvm use` đọc `.nvmrc`). `better-sqlite3` có bản dựng sẵn cho Node 22; Node 20 đã hết hạn hỗ trợ.

```bash
npm install
npm test
npm run typecheck
```

## Đăng nhập tài khoản phụ

**Từ giai đoạn 5: thêm nick bằng trang admin, không cần `npm run login` + copy file thủ công nữa**
(xem mục "Giai đoạn 5" bên dưới) — `admin.greenca.vn/free-rides` → tab "Nick Zalo" → "Thêm nick" →
quét QR ngay trên màn hình admin. Service đang chạy tự nhận yêu cầu, tự ghi `data/accounts/<id>.json`
(chmod 600) và tự thêm tài khoản vào vòng lặp đang chạy — **không cần restart service**.

`npm run login -- <id>` (dưới đây) vẫn còn, dùng khi cần tạo file phiên **trước khi service chạy
lần đầu** (vd. cài đặt ban đầu trên máy cá nhân, chưa có service nào polling để nhận yêu cầu từ
admin) hoặc khi gỡ lỗi cục bộ không muốn đụng tới Laravel:

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
scp data/accounts/*.json <vps>:/opt/greenca-zalo-service/data/accounts/   # chỉ cần nếu đã có phiên đăng nhập sẵn (npm run login cục bộ);
                                                                           # cài mới có thể bỏ qua — thêm nick đầu tiên bằng trang admin sau khi service đã chạy
sudo cp .env.example .env && sudo nano .env           # API_BASE_URL, BOT_SECRET, SERVICE_ID, DATA_DIR
sudo chown -R zalobot:zalobot /opt/greenca-zalo-service
sudo chmod 600 /opt/greenca-zalo-service/.env /opt/greenca-zalo-service/data/accounts/*.json
sudo timedatectl set-ntp true                         # lệch giờ > 5 phút → Laravel trả 401
sudo cp deploy/greenca-zalo-service.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now greenca-zalo-service
tail -f /var/log/greenca-zalo-service.log             # phải thấy "đăng nhập OK" và "listener đã kết nối" cho từng tài khoản
sudo cp deploy/logrotate-greenca-zalo-service /etc/logrotate.d/greenca-zalo-service   # xoay log hằng ngày, giữ 14 bản nén
sudo logrotate -d /etc/logrotate.d/greenca-zalo-service                              # chạy thử (không đổi gì)
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
3. Tạo `zalo-service/.env` cho local (gitignore; `npm run dev` tự nạp file này):
   ```bash
   API_BASE_URL=http://localhost:8080
   BOT_SECRET=dev-secret          # trùng ZALO_BOT_SECRET trong backend/.env
   DATA_DIR=./data
   ALLOWED_GROUP_IDS=             # trống = nghe mọi nhóm; điền ID để chỉ nghe vài nhóm khi thử
   ```
   rồi `npm run dev`.
4. Xem tin đã lưu kèm deeplink: `npm run build && npm run latest -- --limit=20`

Mỗi người gửi mới được lấy mã QR trang cá nhân (`getQR`, cách nhau 2 giây), giải mã và lưu **đoạn mã** vào
`senders.qr_code`. Deeplink mở trang Zalo người gửi: `zalo://qr/p/<qr_code>`. Người gửi tắt chia sẻ QR →
`qr_status = 'empty'` (không có deeplink).

```bash
sqlite3 data/zalo.sqlite "select m.content, s.display_name, 'zalo://qr/p/' || s.qr_code from messages m join senders s on s.uid = m.sender_uid order by m.id desc limit 10"
```

## Giai đoạn 2/5: tách cuốc bằng AI, gửi sang Laravel

Biến môi trường (đầy đủ kèm mặc định trong `.env.example`):

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `AI_PROVIDER` | `openai` | `openai` hoặc `anthropic` |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | (trống) | Khoá của provider đang chọn. Trống (provider đó) = không gọi AI, quy tắc dự phòng tự xử lý |
| `AI_MODEL` | `gpt-4.1-mini` (`claude-haiku-4-5` nếu `AI_PROVIDER=anthropic`) | Model tách cuốc — đổi model chỉ cần sửa biến này |
| `AI_DAILY_BUDGET_USD` | `5` | Trần dự phòng khi chưa hỏi được Laravel; giá trị thật là `ZALO_AI_DAILY_BUDGET_USD` bên Laravel |
| `AI_BATCH_SIZE` / `AI_FLUSH_MS` | `20` / `30000` | Gom tin mỗi lần gọi AI (giãn nhịp, chấp nhận trễ 30–60 giây) |
| `RIDES_BATCH_SIZE` / `RIDES_FLUSH_MS` | `100` / `30000` | Lô gửi cuốc (tối đa 100) |
| `CONFIG_POLL_MS` / `GROUPS_SYNC_MS` | `60000` / `600000` | Hỏi cấu hình / gửi danh sách nhóm |
| `RIDE_EXPIRE_AFTER_PICKUP_MS` | `1800000` | Cuốc hết hạn sau giờ đón 30 phút |
| `RIDE_EXPIRE_WITHOUT_TIME_MS` | `10800000` | Cuốc không ghi giờ hết hạn sau 3 giờ; tin chưa xử lý cũ hơn mức này bị bỏ khi khởi động |
| `QR_INTERVAL_MS` / `QR_REFRESH_DAYS` | `2000` / `7` | Nhịp gọi `getQR`, hạn làm mới mã |

Bên Laravel (`backend/.env`): `ZALO_SERVICE_ENABLED=true`, `ZALO_BOT_SECRET` (trùng `BOT_SECRET`),
`ZALO_AI_DAILY_BUDGET_USD`.

- **Mọi tin không trùng đều gửi AI tách trước** (quy tắc chỉ còn là dự phòng — xem
  `docs/superpowers/specs/2026-10-10-zalo-free-rides-phase5-design.md` mục 6). Bảng giá theo model nằm
  trong `src/ai/prices.ts`; model lạ (gõ sai/không có trong bảng) được tính theo giá cao nhất bảng để
  không vô tình vượt trần ngân sách.
- Chỉ cuốc của người bắn **đang có mã QR** (`senders.qr_code` khác null) mới được gửi; lần `getQR` lỗi tạm
  thời giữ mã cũ nên vẫn gửi. Người tắt "Mã QR của tôi" → cuốc bị giữ lại rồi tự xoá khi hết hạn.
- AI lỗi 3 lần liên tiếp hoặc hết ngân sách ngày → quy tắc dự phòng xử lý: tách được thì tạo cuốc, không
  tách được thì vẫn hiển thị nguyên văn — không mất cuốc.
- Heartbeat báo `held_back_rides` (cuốc bị giữ vì thiếu mã) và `qr_ok_24h` / `qr_empty_24h` / `qr_error_24h`;
  `php artisan zalo:service-status` cảnh báo khi tỷ lệ không lấy được mã > 80% hoặc cuốc bị giữ > 200.
- Laravel loại cuốc sai dữ liệu → log service có cảnh báo "Laravel loại N cuốc", lý do nằm trong log Laravel.

## Giai đoạn 4: quét toàn bộ nhóm của nick phụ

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `GROUP_SCAN_MS` | `1800000` (30 phút) | Nhịp quét `getAllGroups` + `getGroupInfo` của mọi nick đang đăng nhập |

- Chỉ đọc: `getAllGroups` (toàn bộ nhóm nick đang ở) rồi `getGroupInfo` theo lô tối đa 20 ID, nghỉ 1 giây giữa
  các lô — chỉ tra tên/số thành viên của nhóm chưa biết, không hỏi lại nhóm đã có tên.
- Quét lần đầu khi mọi nick đã đăng nhập xong hoặc đã báo lỗi (chờ tối đa 2 phút sau khi khởi động, cần
  ít nhất 1 nick đăng nhập), sau đó mỗi `GROUP_SCAN_MS`.
- Một nhóm được coi là "đã rời" khi không còn nick nào (trong số các nick quét **thành công** ở lượt đó) thấy
  nó nữa; một nick quét lỗi không làm nhóm của nick đó bị đánh dấu rời. Nick đang có nhóm mà bỗng trả về
  0 nhóm cũng bị coi là quét lỗi.
- Khi khởi động, service xoá dấu "nick đang ở nhóm" của các nick không còn file tài khoản — nhóm chỉ nick
  đã gỡ ở sẽ thành "đã rời" ở lượt quét đầu.
- Danh sách nhóm gửi lên Laravel theo lô ≤ 500 nhóm/lần.
- `POST /api/internal/zalo/groups` nay kèm `member_count`, `accounts` (danh sách nick đang ở nhóm) và `left`
  cho admin bật/tắt nhóm mà không phải nhập ID bằng tay.
- **Production: để `ALLOWED_GROUP_IDS` rỗng.** Trước giai đoạn 4 phải liệt kê thủ công từng ID nhóm
  (sửa `.env` + restart service mỗi khi thêm/bớt nhóm); từ giai đoạn 4, service quét và gửi lên mọi
  nhóm nick phụ đang ở, còn việc bật/tắt chuyển hẳn sang trang admin (`admin.greenca.vn/free-rides`,
  tab "Nhóm Zalo") — không cần đụng `.env` nữa. `ALLOWED_GROUP_IDS` vẫn hữu ích khi test cục bộ chỉ
  muốn nghe đúng 1 nhóm (xem "Bộ khung thông luồng" ở trên).
- **Thêm một nhóm mới**: thêm bất kỳ nick phụ nào (tài khoản service đang đăng nhập) vào nhóm Zalo đó
  như thành viên bình thường — không cần quyền quản trị nhóm. Service tự thấy nhóm ở lượt quét kế
  tiếp (≤ `GROUP_SCAN_MS`, cộng thêm lượt quét ngay sau khi nick đăng nhập) và nhóm xuất hiện ở tab
  "Nhóm Zalo" của admin, mặc định **đang bật**.

## Giai đoạn 5: thêm/gỡ nick từ trang admin (QR), tài xế báo cuốc phù hợp

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `ACCOUNT_REQUESTS_POLL_MS` | `5000` | Nhịp hỏi `GET /api/internal/zalo/account-requests` để nhận yêu cầu đăng nhập/gỡ nick mới từ admin |

- **Service chủ động hỏi, Laravel không bao giờ gọi vào service** (giữ đúng nguyên tắc từ giai đoạn
  1): admin bấm "Thêm nick"/"Gỡ" ở `admin.greenca.vn/free-rides` (tab "Nick Zalo") chỉ tạo một hàng
  `zalo_account_requests` ở Laravel; service tự thấy nó ở lượt hỏi kế tiếp (≤ `ACCOUNT_REQUESTS_POLL_MS`),
  xử lý rồi báo tiến độ bằng `POST /api/internal/zalo/account-requests/{id}`
  (`qr_ready` kèm ảnh QR → `done`/`expired`/`failed`). Mỗi lượt hỏi chỉ xử lý **một** yêu cầu — đang
  đăng nhập dở (chờ quét QR, tối đa vài phút) thì các lượt hỏi khác tạm bỏ qua, không timeout.
- **Phiên đăng nhập thật (cookie/imei) không bao giờ rời VPS** — thứ duy nhất gửi sang Laravel là ảnh
  QR (để admin quét) và UID/tên Zalo (sau khi đăng nhập xong, hiển thị cho dễ nhận diện nick). File
  phiên vẫn ghi `data/accounts/<id>.json` (chmod 600) đúng như `npm run login` làm, chỉ khác là service
  tự ghi thay vì chạy tay trên máy cá nhân.
- **Gỡ nick**: đổi tên file phiên thành `<id>.json.removed-<epoch ms>` (không xoá hẳn, phòng gỡ nhầm)
  và dừng listener của nick đó ngay — không cần restart service.
- **Đây là cách chính để thêm nick từ giờ trở đi**, thay cho `npm run login -- <id>` + `scp` thủ công
  lên VPS (mục "Đăng nhập tài khoản phụ" ở trên) — lệnh đó vẫn còn, chỉ dùng khi chưa có service nào
  chạy để nhận yêu cầu (cài đặt lần đầu) hoặc gỡ lỗi cục bộ.
- **Service khởi động được với 0 tài khoản** (`data/accounts/` rỗng) — không có nick nào để nghe tin
  thì service vẫn chạy bình thường, chỉ chờ yêu cầu đăng nhập đầu tiên từ admin qua cơ chế trên.
- Tài xế bật "Báo khi có cuốc phù hợp" ở tab Free (app tài xế) không liên quan tới service này — đó
  là thông báo đẩy Web Push do Laravel tự gửi khi có cuốc mới khớp bộ lọc đã lưu
  (`App\Jobs\NotifyFreeRideAlerts`), service chỉ cần tiếp tục gửi cuốc sang Laravel như bình thường.

## Dọn dữ liệu cũ

Chạy trong vòng prune mỗi giờ của service (cùng lúc xoá tin thô quá `RETENTION_DAYS` và cuốc hết hạn
quá 1 ngày), log tiếng Việt chỉ khi có xoá:

| Biến | Mặc định | Xoá gì |
| --- | --- | --- |
| `REMOVED_SESSION_RETENTION_DAYS` | `7` | File `data/accounts/<id>.json.removed-<ms>` của nick đã gỡ (còn cookie đăng nhập sống), tính theo `<ms>` trong tên file |
| `LEFT_GROUP_RETENTION_DAYS` | `30` | Nhóm đã rời (`chat_groups.left_at`) cùng dòng `group_accounts` còn sót |
| `STALE_SENDER_DAYS` | `30` | Người bắn không thấy tin nào (`senders.last_seen_at`) quá N ngày **và** không còn cuốc còn hạn trong `rides` |

`npm run login` xoá ảnh `data/login-qr-<id>.png` khi đăng nhập xong hoặc lỗi.

Laravel dọn phần của nó bằng `zalo:prune-data` (03:20 hằng ngày, xem `docs/DEPLOY.md`). Log service
(`/var/log/greenca-zalo-service.log`) xoay vòng bằng `deploy/logrotate-greenca-zalo-service` (xem mục
"Cài lên VPS").
