# Cuốc Free — Giai đoạn 5: Quản lý nick trên admin, thông báo đẩy, thống kê nhóm, AI OpenAI — Design

Ngày: 10/10/2026. Nối tiếp giai đoạn 4 (`2026-10-09-zalo-free-rides-admin-design.md`) và backlog (`2026-10-09-zalo-free-rides-backlog.md`). Làm chung PR #13.

## 1. Phạm vi (đã chốt với người dùng 09–10/10)

1. **Đăng nhập nick Zalo phụ ngay trên trang admin** bằng mã QR; đăng nhập lại; gỡ nick.
2. **Danh sách nick**: tên Zalo, UID, trạng thái, lỗi gần nhất, số nhóm, lúc đăng nhập.
3. **Thông báo đẩy cuốc Free theo bộ lọc tài xế đã lưu** (như app Lịch Xe).
4. **Thống kê nhóm**: số cuốc 24 giờ / 7 ngày mỗi nhóm, lọc "không ra cuốc 7 ngày" để admin tắt.
5. **AI dùng OpenAI**, mặc định `gpt-4.1-mini`, đổi model qua cấu hình.

**Không làm:** bật/tắt nhóm theo từng nick (nghe mọi nhóm của nick, AI + bật/tắt nhóm toàn cục lọc rác).

## 2. Đăng nhập / gỡ nick trên admin

Giữ nguyên nguyên tắc **Laravel không gọi vào service**; phiên đăng nhập (cookie) **không rời VPS** — chỉ ảnh QR đi qua Laravel.

- Laravel: bảng `zalo_account_requests` (`id`, `type` = `login` | `remove`, `account_id` (`^[a-z0-9-]{1,32}$`), `status` = `pending` → `qr_ready` → `done` | `expired` | `failed`, `qr_image` (base64 PNG, xoá khi xong), `qr_expires_at`, `zalo_uid`, `zalo_name`, `error`, `requested_by`, timestamps).
- Service hỏi `GET /api/internal/zalo/account-requests` (có ký) **mỗi 5 giây** (JSON nhỏ, rỗng gần như mọi lúc) — QR Zalo sống ~1–2 phút nên không đợi `/config` 60 giây.
- **login**: service chạy `loginQR` (như `scripts/login.ts`) → mỗi lần có QR (kể cả tạo lại khi hết hạn, tối đa 3 lần) `POST .../account-requests/{id}` `{ status: 'qr_ready', qr_image, qr_expires_at }` → người dùng quét bằng app Zalo của nick phụ → service lưu `data/accounts/<account_id>.json` (quyền 0600), gọi `AccountManager.add()` để chạy nick ngay (không restart), báo `{ status: 'done', zalo_uid, zalo_name }`. Hết 3 lần QR không quét → `expired`. Lỗi → `failed` + lý do. Nếu `account_id` đã tồn tại → đây là **đăng nhập lại**: dừng nick cũ, thay file phiên, chạy lại.
- **remove**: service dừng listener nick đó, xoá khỏi `AccountManager`, đổi tên file phiên thành `<id>.json.removed-<ts>` (không xoá hẳn — phòng gỡ nhầm), báo `done`; lượt quét nhóm sau tự dọn `group_accounts` của nick.
- Một yêu cầu tại một thời điểm cho mỗi `account_id`; yêu cầu `pending/qr_ready` quá 10 phút → Laravel đánh `expired`.
- Admin UI (tab mới **"Nick Zalo"** trong trang Cuốc Free): danh sách nick + nút **"Thêm nick"** (gợi ý tên `accN` kế tiếp, sửa được) → hộp thoại hiện QR, tự làm mới mỗi 2 giây, hướng dẫn "Mở Zalo trên điện thoại của nick phụ → Quét mã QR"; xong → "Đã đăng nhập: <tên Zalo>". Mỗi nick: **Đăng nhập lại**, **Gỡ** (hỏi xác nhận).

## 3. Danh sách nick

- Heartbeat thêm cho mỗi nick: `zalo_uid`, `zalo_name` (lấy 1 lần sau đăng nhập, `getUserInfo` của chính mình — chỉ đọc), `logged_in_at` (ms), `groups` (số nhóm từ `group_accounts`).
- Tab "Nick Zalo": thẻ từng nick — tên Zalo + UID, chấm trạng thái (Đang kết nối / Mất kết nối / Không rõ khi service im), lỗi gần nhất, số nhóm, đăng nhập lúc; nút như mục 2. Tab "Tình trạng" giữ phần tổng quan.

## 4. Thông báo đẩy theo bộ lọc

- Laravel: bảng `driver_free_ride_alerts` (`driver_id` unique, `enabled`, `direction` null|to_airport|from_airport|other, `seats` null|int, `keywords` null|string ≤ 100 (khớp điểm đón/điểm đến/nội dung, như ô tìm), `last_pushed_at`).
- Tài xế: trên tab Free, nút **"Báo khi có cuốc phù hợp"** → lưu bộ lọc đang chọn (chiều, số chỗ, từ khoá) làm cảnh báo; bật/tắt; nếu chưa cho phép thông báo trên trình duyệt thì xin quyền (dùng luồng push sẵn có của app tài xế). Mỗi tài xế 1 cảnh báo.
- Khi `POST /internal/zalo/rides` lưu **cuốc mới** (không phải cập nhật), xếp job `NotifyFreeRideAlerts` (gom như tín hiệu realtime: duy nhất mỗi ~10 giây) → tìm cuốc mới từ lần chạy trước khớp từng cảnh báo đang bật (tài xế active, có đăng ký push, không bị ẩn người bắn/nhóm tắt/chặn — dùng chung điều kiện `visibleTo`) → gửi **WebPush** (không lưu bảng notifications, như `NewBookingAvailableNotification`): 1 cuốc → "Cuốc Free: <đón> → <đến> · <giờ/Đi luôn> · <giá>"; nhiều cuốc → "N cuốc Free mới phù hợp". Bấm → mở `/driver/free`.
- Chống làm phiền: mỗi tài xế tối đa 1 push / 2 phút (cuốc dồn trong khoảng đó gộp vào push sau).

## 5. Thống kê nhóm

- `GET /api/admin/free-rides/groups` thêm `rides_24h`, `rides_7d` (đếm `free_rides` theo `zalo_group_id`, giữ 8 ngày từ giai đoạn 4), lọc mới `status=no_rides_7d` (đang bật, chưa rời, 0 cuốc 7 ngày) và sắp xếp được theo `rides_7d`. Thêm index `free_rides.zalo_group_id`.
- UI tab Nhóm: cột "Cuốc 24h / 7 ngày", bộ lọc "Không ra cuốc 7 ngày" kèm gợi ý "Có thể tắt các nhóm này để đỡ chi phí AI".

## 6. AI dùng OpenAI, tách cuốc bằng AI trước (chốt 10/10)

- **Mọi tin không trùng đều gửi AI tách** (bỏ bước quy tắc đứng trước). Luồng: tin mới → lọc trùng (giữ nguyên) → AI → mã QR → Laravel. Lý do: quy tắc chỉ tách được ~23% tin và từng phải sửa nhiều lần vì hiểu sai; `gpt-4.1-mini` tự đoán đúng chiều đi 95–98%.
- **Quy tắc chỉ còn là dự phòng** khi AI lỗi (hết lượt thử) hoặc chạm trần ngân sách ngày: tách được thì dùng, không thì cuốc nguyên văn — không mất cuốc. Không có bước "suy chiều đi bằng code".
- `OpenAiExtractor implements Extractor` dùng SDK `openai` chính thức, structured outputs (cùng schema hiện có), `AI_PROVIDER=openai|anthropic` (mặc định `openai`), `AI_MODEL` mặc định **`gpt-4.1-mini`**, `OPENAI_API_KEY`. Bảng giá theo model trong code để tính ngân sách (`gpt-4.1-mini` $0.40/$1.60, `gpt-4.1` $2/$8, `gpt-4o-mini` $0.15/$0.60, `gpt-4.1-nano` $0.10/$0.40, `gpt-5-nano` $0.05/$0.40 mỗi 1M token; model lạ → giá cao nhất bảng để không vượt trần). Đổi model chỉ cần sửa `.env`.
- Prompt thêm luật dạng "A → B / A - B / A đi B / A về B": A là điểm đón, B là điểm đến; sân bay ở A là đón ở sân bay, ở B là tiễn ra sân bay.
- **Giãn nhịp (chấp nhận trễ 30–60 giây)**: gom AI ≤ 20 tin hoặc mỗi **30 giây** (`AI_FLUSH_MS=30000`); đẩy cuốc sang Laravel mỗi **30 giây** (`RIDES_FLUSH_MS=30000`). Realtime tab Free (Reverb) **giữ nguyên**.
- Cơ sở chọn model mặc định: so sánh 09/10 trên 60 tin khó thật (tham chiếu `gpt-4.1`): `gpt-4.1-mini` 100% nhận đúng cuốc, 95–98% đúng chiều; `gpt-4o-mini` sai chiều 80–88%; `gpt-4.1-nano` có lần bỏ sót 44% cuốc; `gpt-5-nano` bỏ sót ~2/3. Chi phí ước tính ~$0,8/ngày ở 300 nhóm (≈ 6.000 tin không trùng/ngày).

## 7. Kiểm thử

- Service: luồng đăng nhập với `loginQR` giả (QR → hết hạn → QR mới → thành công / hết lượt), `AccountManager.add/remove` không ảnh hưởng nick khác, `OpenAiExtractor` với client giả (đúng schema, usage, lỗi), luồng AI-trước (tin chưa trùng vào thẳng hàng chờ AI; AI hỏng/hết ngân sách → quy tắc dự phòng → nguyên văn).
- Laravel: endpoint account-requests (ký HMAC, chuyển trạng thái, hết hạn 10 phút, quyền admin), cảnh báo đẩy (khớp bộ lọc, chống làm phiền 2 phút, bỏ tài xế không active / không đăng ký push / bị ẩn), thống kê nhóm (MySQL-safe).
- Frontend: typecheck/lint/build; e2e: admin thêm nick (giả lập service bằng request có ký: pending → qr_ready → done), tài xế lưu cảnh báo.
- Không gọi Zalo/OpenAI thật trong test tự động.

## 8. Rủi ro

- QR đăng nhập là thông tin nhạy cảm (ai quét cũng đăng nhập nick của **người quét** vào service): chỉ admin xem, xoá ảnh khi xong/hết hạn.
- Đăng nhập nick mới từ IP VPS có thể bị Zalo yêu cầu xác minh trên điện thoại — hướng dẫn trong hộp thoại.
- Push quá dày làm tài xế tắt thông báo → giới hạn 1 push / 2 phút / tài xế.
