# Tài xế đăng cuốc trong tab Free — thiết kế

- Ngày: 17/10/2026
- Nhánh: `feat/driver-post-ride`
- Bối cảnh: thay nguồn cuốc tự đọc từ nhóm Zalo (đã tắt vì rủi ro pháp lý, xem `docs/Phap_ly_Cuoc_Free.md`)
  bằng cuốc do chính tài xế đăng. Plan gốc của chủ app: `docs/GreenCA_plan_thay_the_dong_bo_cuoc_Zalo.md`.

## 1. Mục tiêu

Tài xế đăng cuốc **giống hệt thói quen trên Zalo**: gõ một đoạn tin vào khung chat ở cuối tab Free, bấm
**Gửi**, xong. Cuốc hiện ngay cho mọi tài xế, ai cần thì Gọi/Zalo người đăng. Sau khi đăng, người đăng
bấm **Chia sẻ** để tự dán tin sang nhóm Zalo.

Thành công khi:
- Từ lúc bấm Gửi tới khi tài xế khác thấy cuốc: vài giây (realtime sẵn có).
- Không bước duyệt/sửa nào giữa "gõ" và "gửi".
- AI hỏng/hết quota không làm hỏng việc đăng.
- Không lộ số điện thoại nào trong nội dung tin (kể cả số khách nếu lỡ gõ).

## 2. Quyết định đã chốt

| # | Quyết định |
|---|---|
| 1 | Mọi tài xế đã duyệt (`driver.active`) được đăng, kể cả người điều phối/chủ lịch đăng hộ khách. |
| 2 | Liên hệ trên cuốc **luôn là SĐT người đăng** (đã xác minh OTP lúc đăng ký). Không có trường nhập SĐT người khác. |
| 3 | Nút liên hệ: **Gọi** (`tel:`) + **Zalo** (`https://zalo.me/<sđt>`, ẩn nếu người đăng tắt). |
| 4 | **Khoá xem liên hệ, mở bằng xin admin duyệt — không thu tiền.** Ai cũng đăng và đọc nội dung cuốc; nút Gọi/Zalo chỉ mở khi tài xế được mở khoá (`free_unlocked_until`, cơ chế sẵn có). Tài xế bấm ổ khoá → gửi yêu cầu → admin liên hệ kiểm tra xe, hướng dẫn rồi duyệt tay. Popup QR 300k bị thay bằng popup xin mở khoá (áp cho mọi cuốc, cả Zalo cũ). |
| 5 | AI: **chỉ OpenAI**, model cấu hình qua env. |
| 6 | Người đăng quản lý: **Đã có xe** + **Xoá**. Không sửa. |
| 7 | Dữ liệu: **dùng chung bảng `free_rides`** (phương án A). |
| 8 | Đồng ý "Quy định đăng cuốc" **một lần** ở lần đăng đầu, không checkbox mỗi lần. |

## 3. Ngoài phạm vi

- Trang công khai cho link chia sẻ + ảnh xem trước (thẻ OG) trên Zalo — bước 2.
- Gỡ hẳn code thanh toán 300k (`FreeUnlockPayment`, cài đặt phí, `access.payment`), gỡ admin nhóm/nick Zalo, tắt `zalo-service`, xoá dữ liệu Zalo — bước 3.
- Sửa cuốc đã đăng; "chủ cuốc" khác người đăng (làm sau nếu cần: chủ cuốc phải là tài khoản GreenCA và bấm đồng ý).
- Plugin share native (`@capacitor/share`) — nằm ở nhánh `feat/android-native`; bước này dùng Web Share + sao chép.

## 4. Dữ liệu

### 4.1 Migration `free_rides`

| Cột | Thay đổi |
|---|---|
| `posted_by_user_id` | MỚI, `foreignId` nullable → `users`, `nullOnDelete`, index |
| `closed_at` | MỚI, timestamp nullable — "Đã có xe" |
| `contact_zalo` | MỚI, boolean default `true` |
| `parse_status` | MỚI, string(16) nullable: `null` (cuốc Zalo), `pending`, `done`, `failed` |
| `qr_code` | → nullable |
| `zalo_group_id` | → nullable |

Cuốc tài xế đăng:
- `ride_uid` = `gca-<ULID>` (chữ thường).
- `sender_uid` = `gca_<user_id>` — để **ẩn người đăng / báo cáo / admin chặn** chạy nguyên trạng
  (khớp regex route admin `[A-Za-z0-9_-]{1,32}`).
- `sender_name` = tên người đăng; `group_name` = `''`; `qr_code`, `zalo_group_id` = `null`.
- `is_raw` = `true` (thẻ hiển thị nguyên văn tin), `raw_text` = tin đã che SĐT, `group_count` = 1.
- `posted_at` = now; `expires_at` = now + 3h (sửa lại sau khi AI tách được giờ đón).
- `parse_status` = `pending`.

### 4.2 Yêu cầu mở khoá liên hệ

Migration `driver_profiles.free_unlock_requested_at` (timestamp nullable). Mở khoá vẫn là `free_unlocked_until`
(admin bấm "Mở khoá" sẵn có ở trang Tài xế = +1 năm); duyệt xong thì xoá `free_unlock_requested_at`.
Thu hồi không đụng cột yêu cầu.

### 4.3 Đồng ý quy định đăng cuốc

Migration `driver_profiles.ride_post_terms_accepted_at` (timestamp nullable). Đăng khi cột này null → 409
`code: ride_post_terms_required`; app hiện popup quy định, bấm Đồng ý gọi endpoint ghi mốc rồi gửi lại.
Nội dung quy định (ngắn, hiển thị trong popup; chuỗi đặt ở frontend):
- Bạn chịu trách nhiệm về nội dung cuốc mình đăng.
- Chỉ đăng cuốc có thật, bạn trực tiếp phụ trách hoặc được khách nhờ điều phối.
- Không đăng số điện thoại/thông tin cá nhân của người khác; số điện thoại trong tin sẽ tự bị che.
- Liên hệ hiển thị cho tài xế khác là số điện thoại tài khoản của bạn.
- Cuốc sai sự thật/spam có thể bị gỡ và khoá quyền đăng.

## 5. Hiển thị (backend)

### 5.1 `FreeRide::scopeVisibleTo` — dùng chung cho danh sách và cảnh báo đẩy

- Mọi `whereNotIn` trên `qr_code` / `zalo_group_id` phải **chấp nhận cột null**
  (`where(fn => whereNull(col)->orWhereNotIn(col, …))`). Không làm thế thì `NULL NOT IN (…)` = UNKNOWN →
  **mọi cuốc tài xế đăng biến mất**. Có test riêng.
- `scopeExcludingLiveDuplicates` cũng vậy với `zalo_group_id`.
- Thêm: `whereNull('closed_at')`.
- Thêm: cuốc có `posted_by_user_id` chỉ hiện khi người đăng còn là tài xế `active`
  (`whereNull(posted_by_user_id)->orWhereIn(posted_by_user_id, <driver_profiles active>)`).
- `FreeRide::filterSafe` cho qua cuốc có `qr_code` null.

### 5.2 `FreeRideController::format`

Thêm cho mọi cuốc: `source` (`zalo` | `driver`), `is_mine`.
Cuốc `driver`:
- `contact` = `{ phone, zalo_url }` — `zalo_url` = `https://zalo.me/<sđt dạng 0…>` khi `contact_zalo`, ngược lại null.
  **Chỉ trả khi người xem đã mở khoá** (khoá ở server, giống cuốc Zalo). Chưa mở khoá hoặc cuốc của chính mình:
  `contact` = null.
- `raw_text` trả nguyên (đã che SĐT lúc lưu); `sender_name` luôn trả (tên tài khoản người đăng, không phụ
  thuộc cài đặt `free_show_sender_name` — đó là cài đặt cho tên Zalo).
- `qr_code`, `contact_url` = null.
Cuốc `zalo`: giữ nguyên hành vi hiện tại.

`access` thêm `requested_at` (ms | null) — app hiện "Đã gửi yêu cầu, chờ admin". `access.payment` giữ nguyên trong
API (gỡ ở bước 3) nhưng app không dùng nữa.

### 5.3 Cảnh báo đẩy (`NotifyFreeRideAlerts`)

Job chốt mốc theo **id**. Cuốc tài xế đăng chưa tách xong (`parse_status = pending`) chưa có chiều đi/số chỗ
nên chưa so được bộ lọc; nếu job chạy qua nó thì mốc vượt và cuốc **không bao giờ được push**. Vì vậy:
- `maxId` = min(`max(id)`, (id nhỏ nhất của cuốc `pending` còn "mới") − 1).
  "Mới" = `posted_at` trong 2 phút gần nhất — quá 2 phút coi như hỏng, không chặn mốc nữa.
- Job tách cuốc xong (done/failed) xếp `NotifyFreeRideAlerts` như ingest Zalo.
- Không push cuốc cho chính người đăng (`posted_by_user_id != alert.driver_id`).

## 6. API (nhóm route `driver.active` + `free-rides.enabled`)

| Route | Việc | Giới hạn |
|---|---|---|
| `POST /driver/free-rides` | `{ text (1–1000 ký tự), contact_zalo? }` → lưu, trả cuốc đã format | `throttle:10,1`; **20 cuốc/ngày/tài xế** (đếm theo `posted_by_user_id` + ngày VN) → 429 `code: daily_post_limit` |
| `POST /driver/free-rides/terms` | Ghi `ride_post_terms_accepted_at` | – |
| `POST /driver/free-rides/unlock-request` | Ghi `free_unlock_requested_at = now` (gửi lại thì cập nhật mốc). Đã mở khoá → 409 | `throttle:5,1` |
| `GET /driver/free-rides/mine` | Cuốc tôi đăng: đang mở + đã đóng/hết hạn trong 7 ngày | – |
| `PATCH /driver/free-rides/{uid}/close` | Đã có xe (`closed_at = now`) | chủ cuốc, 403 nếu không |
| `DELETE /driver/free-rides/{uid}` | Xoá hẳn | chủ cuốc, 403 nếu không |

`POST /driver/free-rides`:
1. Validate; kiểm đồng ý quy định; kiểm giới hạn ngày.
2. Ghi trong khoá `Cache::lock('zalo:ingest')` (cùng khoá với ingest Zalo — id commit tuần tự cho job cảnh báo).
3. Che SĐT (`FreeRide::maskPhones`), lưu như mục 4.1.
4. `BroadcastFreeRidesSignal` (realtime) + `ParseDriverRide` (job nền).
5. Người đăng lấy từ `$request->user()`; không nhận `user_id` từ client.

Close/Delete: thêm `BroadcastFreeRidesSignal` để danh sách các máy khác cập nhật.

## 7. AI tách cuốc (job nền)

- `App\Services\RideParser\OpenAiRideParser`: `Http::withToken()->timeout(15)->post('https://api.openai.com/v1/chat/completions')`,
  `response_format: json_schema` (strict). Không thêm thư viện.
- Env: `OPENAI_API_KEY`, `OPENAI_RIDE_MODEL` (mặc định `gpt-5-mini`), `OPENAI_RIDE_DAILY_LIMIT` (mặc định 2000, đếm
  bằng cache theo ngày VN; vượt → bỏ qua gọi AI, đánh `failed`).
- Prompt: port `zalo-service/src/ai/prompt.ts` (thuật ngữ tiễn/đón/T1/T2/1tr2/ck/free/freect/csct…), sửa cho **một**
  tin, kèm ngày giờ hiện tại (giờ VN) để hiểu "mai", "4/10". Tin người dùng đặt trong message user dưới dạng JSON
  (`{"text": …}`); output bị ràng buộc schema → câu "bỏ qua hướng dẫn…" trong tin không đổi được hành vi.
- Schema: `{ is_ride, direction, pickup, destination, pickup_time, pickup_date, seats, vehicle_note, price_vnd, is_free }`
  (một cuốc; tin nhiều cuốc thì lấy cuốc đầu — tin vẫn hiện nguyên văn đầy đủ).
- Hậu xử lý PHP: cắt khoảng hợp lệ (seats 1–60, giá 0–50tr, chuỗi ≤ 255), tính `pickup_at` theo giờ VN (port
  `resolvePickupAt`), `pickup_time_text`. `expires_at` = `pickup_at + 30 phút` nếu có giờ, giữ `posted_at + 3h` nếu không.
- `ParseDriverRide` (`ShouldQueue`, `tries = 2`, `timeout = 30`): thành công → điền cột + `done`; `is_ride=false`,
  lỗi HTTP/timeout/JSON sai/hết quota/vượt trần → `failed` (cuốc giữ nguyên dạng tin, vẫn hiện, vẫn liên hệ được).
  Cuốc đã bị xoá/đóng trong lúc chờ → bỏ qua. Xong thì `BroadcastFreeRidesSignal` + `NotifyFreeRideAlerts`.
- Log: user id, ride id, trạng thái, token usage. **Không** log nội dung tin, không log key.

## 8. Xoá tài khoản

`AccountDeletionService::delete` đóng mọi cuốc đang mở của người xoá (`closed_at = now`). FK `nullOnDelete` lo
trường hợp xoá cứng.

## 9. Giao diện (app tài xế)

### 9.1 Tab Free (`FreeRidesPage`)
- **Khung soạn tin** cố định đáy trang (trên thanh tab): ô nhập nhiều dòng tự giãn (tối đa ~5 dòng) + nút Gửi;
  placeholder "Gõ cuốc như trên Zalo: Tiễn Mỹ Đình 15h mai xe 5 250k". Gửi xong xoá ô, cuộn lên đầu, cuốc mới hiện.
- Lỗi: 409 quy định → popup quy định (Đồng ý → gửi lại tự động); 429 → toast "Bạn đã đăng 20 cuốc hôm nay";
  lỗi mạng → toast, **giữ nguyên nội dung ô**.
- Lối vào **"Cuốc tôi đăng"** ở đầu trang.

### 9.0 Xin mở khoá liên hệ
- Tài xế chưa mở khoá: chỗ nút liên hệ (mọi cuốc) là nút **🔒 Mở khoá liên hệ**. Bấm → popup:
  "Liên hệ admin để được kiểm tra xe và hướng dẫn, admin sẽ mở khoá cho bạn." + nút **Gửi yêu cầu mở khoá** +
  nút **Nhắn Zalo admin** (số hỗ trợ từ `/settings/contact`, sẵn có).
- Đã gửi: popup/nút hiện "Đã gửi yêu cầu lúc HH:mm, admin sẽ liên hệ bạn" (vẫn có nút Nhắn Zalo admin).
- Popup QR 300k (`FreeRideUnlockSheet`) thay bằng popup này.

### 9.0b Admin (trang Tài xế)
- Bộ lọc **"Xin mở khoá"** (tài xế có `free_unlock_requested_at`, chưa mở khoá), sắp theo thời điểm xin; số lượng
  hiện dạng badge cạnh bộ lọc.
- Mỗi dòng hiện "Xin mở khoá lúc …"; admin bấm nút **Mở khoá** sẵn có → duyệt (xoá cờ yêu cầu).
- `GET /admin/drivers` nhận `free_unlock_requested=1` và trả `free_unlock_requested_at`.

### 9.2 Thẻ cuốc (`FreeRideCard`) — cuốc `source = driver`
- Nhãn "Tài xế đăng", tên người đăng, giờ đăng, nội dung tin nguyên văn.
- Đã mở khoá: nút **Gọi** + **Zalo** (nếu có) thay cho "Nhận cuốc". Chưa mở khoá: nút ổ khoá (mục 9.0).
- Cuốc của mình: nhãn "Cuốc của bạn", thay nút liên hệ bằng **Chia sẻ** · **Đã có xe** · **Xoá**.
- Menu "…" (báo cáo / ẩn người đăng) giữ như cuốc Zalo.

### 9.3 Chia sẻ
`navigator.share({ text })` với nội dung: tin nguyên văn + dòng "Nhận cuốc trên GreenCA: <origin>/driver/free".
Không hỗ trợ → `navigator.clipboard.writeText` + toast "Đã sao chép, dán vào nhóm Zalo". `AbortError` = người dùng
huỷ, im lặng. Không bao giờ báo "đã gửi Zalo".

### 9.4 Trang "Cuốc tôi đăng" (`/driver/free/mine`)
Danh sách từ `GET /mine`, mỗi cuốc: nội dung, trạng thái (Đang mở / Đã có xe / Hết hạn), nút Chia sẻ · Đã có xe · Xoá
(xoá có hộp xác nhận) cho cuốc đang mở.

## 10. Kiểm thử

Backend (PHPUnit, OpenAI giả lập bằng `Http::fake`):
- Đăng: validate độ dài; chưa đồng ý quy định → 409; đồng ý xong đăng được; che SĐT; người đăng lấy từ token
  (bỏ qua `user_id` gửi kèm); giới hạn 20/ngày; tài xế chưa duyệt/tab tắt → bị chặn.
- Hiển thị: **cuốc tài xế đăng hiện trong danh sách dù `qr_code`/`zalo_group_id` null**; `contact` đúng, không phụ
  `contact` chỉ có khi người xem đã mở khoá; `contact_zalo=false` → không có `zalo_url`; cuốc của mình không có `contact`, `is_mine=true`;
  đã đóng / người đăng bị khoá → không hiện; ẩn người đăng `gca_…` và admin chặn `gca_…` chạy.
- Chủ cuốc: close/delete được; người khác → 403; `/mine` chỉ trả cuốc của mình.
- Job tách: thành công điền cột + `expires_at`; `is_ride=false`, HTTP 429/500, timeout, JSON sai, vượt trần → `failed`,
  cuốc vẫn hiện; tin chứa câu chèn lệnh không đổi schema kết quả.
- Cảnh báo: cuốc `pending` chặn mốc; tách xong được push đúng bộ lọc; không push cho chính người đăng; `pending`
  quá 2 phút không chặn mốc.
- Xin mở khoá: ghi mốc; đã mở khoá → 409; admin lọc `free_unlock_requested=1` đúng danh sách; admin mở khoá xoá
  cờ yêu cầu; thu hồi không tạo lại yêu cầu.
- Xoá tài khoản đóng cuốc đang mở.
- Toàn bộ test Cuốc Free cũ vẫn xanh.

Frontend: `tsc`, eslint, `build:driver`. E2E (Playwright, nếu fixture sẵn có cho phép): gõ tin → Gửi → thẻ "Cuốc của bạn" hiện.

## 11. Phát hành

- Env mới: `OPENAI_API_KEY` (chủ app nạp tiền), `OPENAI_RIDE_MODEL`, `OPENAI_RIDE_DAILY_LIMIT`.
- Production đang `ZALO_FREE_RIDES_ENABLED=false` → phải bật lại để tab Free hiện. An toàn: `zalo-service` không đẩy
  cuốc mới, cuốc Zalo cũ đã hết hạn.
- Cần queue worker chạy (đã có `greenca-queue@1..4`).
