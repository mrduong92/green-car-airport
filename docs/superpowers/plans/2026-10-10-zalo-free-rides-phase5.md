# Cuốc Free — Giai đoạn 5 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tách cuốc bằng AI OpenAI cho mọi tin (quy tắc chỉ dự phòng), đăng nhập/gỡ nick Zalo trên trang admin, danh sách nick, thông báo đẩy cuốc Free theo bộ lọc tài xế, thống kê nhóm.

**Architecture:** Service: `OpenAiExtractor` + Processor "AI trước"; `AccountRequestsPoller` hỏi Laravel mỗi 5 giây, chạy `loginQR` / gỡ nick, `AccountManager.add/remove` không cần restart; heartbeat gửi thêm thông tin nick. Laravel: bảng `zalo_account_requests` (+ endpoint nội bộ có ký và endpoint admin), bảng `driver_free_ride_alerts` + job `NotifyFreeRideAlerts` (WebPush), thống kê nhóm từ `free_rides`. Frontend: tab "Nick Zalo" + cột thống kê ở admin; nút "Báo khi có cuốc phù hợp" ở tab Free tài xế.

**Tech Stack:** Node 22 TS, `openai` SDK, zca-js 2.2.0 (`loginQR`), better-sqlite3; Laravel 13 (queue, WebPushChannel sẵn có); React 19 + TanStack Query.

**Spec:** `docs/superpowers/specs/2026-10-10-zalo-free-rides-phase5-design.md`. Nhánh `feat/zalo-free-rides-phase3` (PR #13).

## Global Constraints

- Laravel không gọi vào service; mọi endpoint nội bộ ký HMAC như cũ. Phiên đăng nhập Zalo (cookie/imei) **không bao giờ** gửi sang Laravel — chỉ ảnh QR.
- Service chỉ đọc với Zalo, ngoài việc đăng nhập (`loginQR`) do admin chủ động.
- `account_id` khớp `^[a-z0-9-]{1,32}$`. File phiên `data/accounts/<id>.json` quyền 0600; gỡ nick = đổi tên `<id>.json.removed-<epoch ms>`.
- AI: mặc định `AI_PROVIDER=openai`, `AI_MODEL=gpt-4.1-mini`; `AI_FLUSH_MS` mặc định 30000, `RIDES_FLUSH_MS` mặc định 30000. Realtime Reverb giữ nguyên.
- Mọi tin không trùng vào hàng chờ AI; AI hỏng hết lượt / vượt ngân sách → `parseRides` dự phòng → nguyên văn. Không mất cuốc.
- Push: chỉ WebPush (không lưu bảng notifications); ≤ 1 push / 2 phút / tài xế; chỉ tài xế active; áp cùng điều kiện hiển thị như `GET /api/driver/free-rides` (chặn người bắn, nhóm tắt, người bắn đã ẩn, mã QR an toàn, còn hạn).
- UI tiếng Việt, token Tailwind; giờ VN; controller trả mảng thuần; SQL an toàn với MySQL `ONLY_FULL_GROUP_BY`.
- Không gọi Zalo/OpenAI thật trong test tự động. Không `migrate:fresh`/`db:wipe`/`make fresh`.

## Review Focus

1. **QR hết hạn khi chưa quét** → tạo QR mới tối đa 3 lần rồi `expired`; không treo service, nick khác không bị ảnh hưởng (Task 2).
2. **Đăng nhập lại nick đang chạy** → nick cũ dừng sạch (không hai kết nối cùng phiên — Zalo sẽ đá), nick mới chạy (Task 2).
3. **AI lỗi / hết ngân sách** → tin vẫn thành cuốc qua quy tắc dự phòng hoặc nguyên văn (Task 1).
4. **Push dồn dập** khi một lô nhiều cuốc khớp → 1 push gộp, tối đa 1 push/2 phút/tài xế (Task 4).
5. **Admin không phải admin / service không ký** gọi endpoint nick → 403/401 (Task 3).

---

### Task 1: Service — AI OpenAI, tách mọi tin bằng AI, giãn nhịp

**Files:** Create `zalo-service/src/ai/openai-extractor.ts`, `zalo-service/src/ai/prices.ts`, `zalo-service/src/ai/prompt.ts` (dời `SYSTEM_PROMPT` + schema dùng chung từ `extractor.ts`); Modify `zalo-service/src/ai/extractor.ts`, `zalo-service/src/ai/usage.ts` (tính phí theo model), `zalo-service/src/processor.ts`, `zalo-service/src/config.ts`, `zalo-service/src/index.ts`, `zalo-service/.env.example`, `zalo-service/README.md`, `zalo-service/package.json` (thêm `openai`). Tests: `test/ai-openai-extractor.test.ts`, cập nhật `test/processor.test.ts`, `test/ai-usage.test.ts`, `test/config*.test.ts`.

**Interfaces:**
- `class OpenAiExtractor implements Extractor` — `constructor(client: OpenAI, model: string)`; dùng `client.chat.completions.parse` (hoặc API structured outputs tương đương của SDK đã cài — **đọc d.ts của SDK, không đoán tên**) với `zodResponseFormat(ResultSchema, 'rides')`; lỗi/parsed null → `AiCallError` kèm usage như Anthropic; `max_tokens`/`max_completion_tokens` 16000; với model `gpt-5*` đặt `reasoning_effort: 'minimal'` và không gửi `temperature`.
- `priceFor(model: string): { inputPerM: number; outputPerM: number }` — bảng: gpt-4.1-mini 0.40/1.60, gpt-4.1 2/8, gpt-4o-mini 0.15/0.60, gpt-4.1-nano 0.10/0.40, gpt-5-nano 0.05/0.40, claude-haiku-4-5 1/5; model lạ → giá cao nhất bảng. `AiUsage.record(...)` dùng `priceFor(model)` (thêm tham số model hoặc truyền qua constructor — chọn cách ít thay đổi nhất, ghi rõ).
- Config: `aiProvider: 'openai' | 'anthropic'` (`AI_PROVIDER`, mặc định `openai`), `aiModel` mặc định theo provider (`gpt-4.1-mini` / `claude-haiku-4-5`), `aiEnabled` = có key của provider đang chọn (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY`), `aiFlushMs` mặc định 30000, `ridesFlushMs` mặc định 30000.
- Prompt: thêm dòng "Tin dạng "A → B", "A - B", "A đi B", "A về B": A là điểm đón, B là điểm đến. Sân bay (T1, T2, NB, sb, Nội Bài) ở A → direction=from_airport, pickup="Sân bay Nội Bài"; ở B → direction=to_airport, destination="Sân bay Nội Bài"."
- `Processor.handleStored`: chặn nhóm tắt/người bắn bị chặn như cũ → nếu có AI: **enqueue thẳng** (status `ai_pending`), không gọi `parseRides` trước; không có AI: `parseRides` → rides / not_ride / unsure→raw như cũ. `markRaw(id)` (được gọi khi AI hết ngân sách hoặc hỏng hết lượt) đổi thành **`fallback(id)`**: `parseRides` → `rides` thì tạo cuốc (status `ride`), `not_ride` thì `not_ride`, `unsure` thì cuốc nguyên văn (`raw`). Cập nhật nơi gọi (`index.ts` `onOverBudget`, `onAiFailed`).

- [ ] Step 1: Viết test trước (RED): OpenAiExtractor với client giả (map kết quả theo id, id thiếu → không phải cuốc, parsed null → AiCallError có usage, gpt-5 → có reasoning_effort, không temperature); priceFor (biết + lạ); config mặc định/provider; processor: có AI → tin thẳng vào hàng chờ (kể cả tin quy tắc tách được); fallback: tin quy tắc tách được → cuốc, tin mơ hồ → raw, tin rác → not_ride.
- [ ] Step 2: Chạy `npm test` thấy FAIL đúng lý do.
- [ ] Step 3: `npm install openai`; cài đặt.
- [ ] Step 4: `npm test && npx tsc --noEmit -p . && npm run build` PASS.
- [ ] Step 5: Commit `feat(zalo-service): AI OpenAI (mặc định gpt-4.1-mini) tách mọi tin, quy tắc chỉ dự phòng; gom AI/đẩy cuốc mỗi 30 giây`.

---

### Task 2: Service — đăng nhập/gỡ nick theo yêu cầu từ admin, thông tin nick trong heartbeat

**Files:** Create `zalo-service/src/account-requests.ts`, `zalo-service/src/zalo-login.ts`; Modify `zalo-service/src/accounts.ts` (`add`, `remove`, `info`), `zalo-service/src/heartbeat.ts`, `zalo-service/src/index.ts`, `zalo-service/scripts/login.ts` (dùng chung `zalo-login.ts`). Tests: `test/account-requests.test.ts`, `test/accounts-add-remove.test.ts`, cập nhật `test/heartbeat*.test.ts`.

**Interfaces:**
- `runQrLogin(deps: { loginQR: (onEvent) => Promise<unknown>; onQr: (pngBase64: string, expiresAt: number) => Promise<void>; maxQr?: number = 3 }): Promise<{ credentials: unknown }>` — bọc `new Zalo().loginQR(...)`: sự kiện QRCodeGenerated → `onQr`; QRCodeExpired → nếu chưa quá `maxQr` thì `actions.retry()`, không thì `actions.abort()` và ném `QrExpiredError`; GotLoginInfo → lấy credentials. (Đọc enum/kiểu sự kiện trong `node_modules/zca-js` — không đoán.)
- `AccountManager.add(account: Account): Promise<void>` (đã có id → `remove` trước rồi chạy mới), `remove(id: string): void` (dừng listener, bỏ khỏi `apis`/`states`, huỷ hẹn giờ thử lại của nick đó), `info(id)` trả `{ zaloUid, zaloName, loggedInAt }` (sau đăng nhập lấy `getOwnId()` và tên qua `getUserInfo(ownId)` — chỉ đọc; lỗi lấy tên → tên rỗng, không làm hỏng đăng nhập).
- `class AccountRequestsPoller({ get, post, manager, dataDir, login: typeof runQrLogin + factory, logger, now? })`: `poll()` mỗi 5 giây (`ACCOUNT_REQUESTS_POLL_MS`, mặc định 5000) gọi `GET /api/internal/zalo/account-requests` → `{ requests: [{ id, type: 'login'|'remove', account_id }] }`; mỗi lần xử lý **một** yêu cầu, không chạy song song yêu cầu thứ hai khi đang đăng nhập; `login`: `POST /api/internal/zalo/account-requests/{id}` các trạng thái `qr_ready {qr_image, qr_expires_at}` → `done {zalo_uid, zalo_name}` | `expired` | `failed {error}`; ghi file phiên 0600 rồi `manager.add`. `remove`: `manager.remove`, đổi tên file, `done`.
- Heartbeat mỗi nick thêm `zalo_uid`, `zalo_name`, `logged_in_at` (ms|null), `groups` (đếm `group_accounts`).

- [ ] Step 1: Test trước: runQrLogin (QR → hết hạn → QR mới → thành công; hết 3 lần → QrExpiredError); poller (login thành công: thứ tự POST, file 0600, `manager.add` được gọi; login lỗi → failed; remove → manager.remove + đổi tên file + done; đang xử lý thì poll khác không lấy thêm; GET lỗi mạng → không ném); AccountManager.add thay nick cũ (listener cũ stop, không còn 2 api cùng id), remove huỷ retry hẹn giờ; heartbeat có trường mới.
- [ ] Step 2–4: RED → cài đặt → `npm test && npx tsc --noEmit -p . && npm run build` PASS.
- [ ] Step 5: Commit `feat(zalo-service): đăng nhập/gỡ nick theo yêu cầu từ trang admin, heartbeat kèm tên/UID/số nhóm từng nick`.

---

### Task 3: Laravel — yêu cầu đăng nhập/gỡ nick + danh sách nick cho admin

**Files:** Create migration `2026_10_11_000001_create_zalo_account_requests_table.php`, `app/Models/ZaloAccountRequest.php`, `app/Http/Controllers/Admin/ZaloAccountController.php`; Modify `app/Http/Controllers/Webhooks/ZaloServiceController.php` (+ `accountRequests`, `updateAccountRequest`, heartbeat nhận trường nick mới), `app/Services/Zalo/ZaloServiceMonitor.php` (`snapshot()` trả thêm trường nick), `routes/api.php`, `routes/console.php` (dọn yêu cầu quá hạn mỗi phút hoặc lazily khi đọc). Test: `tests/Feature/ZaloAccountRequestTest.php`.

**Interfaces:**
- Nội bộ (ký HMAC): `GET /api/internal/zalo/account-requests` → `{ requests: [{id, type, account_id}] }` các yêu cầu `pending` (cũ nhất trước, ≤ 5); `POST /api/internal/zalo/account-requests/{id}` `{ status: qr_ready|done|expired|failed, qr_image?, qr_expires_at? (ms), zalo_uid?, zalo_name?, error? }` — chuyển trạng thái hợp lệ (`pending→qr_ready|failed|done`, `qr_ready→qr_ready|done|expired|failed`), `done|expired|failed` xoá `qr_image`.
- Admin: `GET /api/admin/free-rides/accounts` → `{ accounts: [{ id, zalo_uid, zalo_name, connected, logged_in, last_error, logged_in_at, groups, service_id, stale }], requests: [yêu cầu đang mở] }` (nick lấy từ heartbeat snapshot); `POST /api/admin/free-rides/accounts` `{ account_id }` → tạo yêu cầu `login` (409 nếu đã có yêu cầu mở cho id đó; 422 nếu id sai mẫu); `DELETE /api/admin/free-rides/accounts/{accountId}` → yêu cầu `remove`; `GET /api/admin/free-rides/account-requests/{id}` → `{ id, type, account_id, status, qr_image, qr_expires_at, zalo_name, error }` (admin poll mỗi 2 giây). Yêu cầu `pending|qr_ready` quá 10 phút → `expired` (khi đọc hoặc lệnh lập lịch).
- Heartbeat validate thêm `accounts.*.zalo_uid|zalo_name|logged_in_at|groups` (`sometimes`, cắt chuỗi như `last_error`, không từ chối cả gói).

- [ ] Step 1: Test trước: ký/không ký, admin/không admin, tạo yêu cầu (409, 422), luồng trạng thái hợp lệ/không hợp lệ, xoá ảnh khi xong, hết hạn 10 phút, danh sách nick từ heartbeat, heartbeat với trường nick mới + payload cũ.
- [ ] Step 2–4: RED → cài đặt → `php artisan test --filter='ZaloAccount|Zalo|FreeRide'` + full suite + pint.
- [ ] Step 5: Commit `feat(zalo): yêu cầu đăng nhập/gỡ nick Zalo từ admin, danh sách nick`.

---

### Task 4: Laravel — thông báo đẩy theo bộ lọc + thống kê nhóm

**Files:** Create migration `2026_10_11_000002_create_driver_free_ride_alerts_table.php` (+ index `free_rides.zalo_group_id`), `app/Models/DriverFreeRideAlert.php`, `app/Jobs/NotifyFreeRideAlerts.php`, `app/Notifications/FreeRideMatchNotification.php`; Modify `app/Http/Controllers/Driver/FreeRideController.php` (tách điều kiện hiển thị thành phương thức dùng chung, + `alert`/`saveAlert`), `app/Services/Zalo/ZaloRideIngestService.php` (trả danh sách cuốc **mới**), `app/Http/Controllers/Webhooks/ZaloServiceController.php` (dispatch job khi có cuốc mới), `app/Http/Controllers/Admin/FreeRideAdminController.php` (thống kê nhóm), `routes/api.php`. Tests: `tests/Feature/FreeRideAlertTest.php`, cập nhật `tests/Feature/FreeRideAdminTest.php`.

**Interfaces:**
- Tài xế (sau `driver.active`): `GET /api/driver/free-rides/alert` → `{ enabled, direction, seats, keywords }` (mặc định tắt, null); `PUT /api/driver/free-rides/alert` cùng shape (validate như bộ lọc danh sách; `keywords` ≤ 100).
- Job `NotifyFreeRideAlerts` (`ShouldBeUniqueUntilProcessing`, trễ 10 giây, như `BroadcastFreeRidesSignal`): lấy cuốc tạo sau mốc lần chạy trước (lưu cache), với mỗi cảnh báo bật của tài xế active có `DeviceToken` và `last_pushed_at` null hoặc ≤ now-2 phút: lọc cuốc khớp (chiều, số chỗ, từ khoá LIKE trên pickup/destination/raw_text) **và** điều kiện hiển thị của tài xế đó → ≥ 1 cuốc thì gửi `FreeRideMatchNotification` (WebPushChannel; 1 cuốc: "Cuốc Free: <đón> → <đến> · <giờ VN | Đi luôn> · <giá>đ"; nhiều: "<N> cuốc Free mới phù hợp"; data `{ action: 'open_url', url: '/driver/free' }` — kiểm service worker frontend xử lý `data` thế nào và dùng đúng khoá), cập nhật `last_pushed_at`. Cuốc trong khoảng chặn 2 phút được gộp vào lần sau (mốc lần chạy chỉ tiến khi đã xử lý).
- Thống kê nhóm: `GET /api/admin/free-rides/groups` thêm `rides_24h`, `rides_7d` mỗi nhóm; `status=no_rides_7d`; `sort=rides_7d`.

- [ ] Step 1: Test trước: lưu/đọc cảnh báo; job: khớp/không khớp chiều/chỗ/từ khoá; bỏ tài xế không active, không token, đã ẩn người bắn, nhóm tắt; chống làm phiền 2 phút rồi gộp; 1 vs nhiều cuốc (nội dung push; dùng `Notification::fake()`); cuốc cập nhật (không mới) không push; thống kê nhóm (đếm, lọc, sắp xếp; an toàn MySQL).
- [ ] Step 2–4: RED → cài đặt → filter `FreeRide|Zalo` + full suite + pint; chạy migrate local `--force`.
- [ ] Step 5: Commit `feat(free-rides): thông báo đẩy cuốc Free theo bộ lọc tài xế; thống kê cuốc theo nhóm cho admin`.

---

### Task 5: Admin UI — tab "Nick Zalo" + thống kê nhóm

**Files:** Create `frontend/src/components/admin/freeRides/AccountsTab.tsx`, `AddAccountDialog.tsx`; Modify `frontend/src/pages/admin/FreeRidesAdminPage.tsx` (tab mới đứng đầu, `?tab=accounts`), `GroupsTab.tsx` (cột "Cuốc 24h / 7 ngày", lọc "Không ra cuốc 7 ngày" + gợi ý), `frontend/src/api/adminFreeRides.ts`, `frontend/src/types.d.ts`.

- Thẻ nick: tên Zalo (rỗng → id) + UID, chấm trạng thái (Đang kết nối / Mất kết nối / Không rõ khi service im), lỗi gần nhất, số nhóm, đăng nhập lúc (giờ VN); nút "Đăng nhập lại", "Gỡ" (ConfirmDialog). Nút "Thêm nick" → hộp thoại: ô tên (gợi ý `accN` kế tiếp, mẫu `^[a-z0-9-]{1,32}$`) → tạo yêu cầu → poll mỗi 2 giây: `pending` "Đang tạo mã QR (≤ 10 giây)…", `qr_ready` hiện ảnh QR + đếm ngược hết hạn + hướng dẫn "Mở Zalo trên điện thoại của nick phụ → biểu tượng QR → quét", `done` "Đã đăng nhập: <tên>", `expired` "Mã QR hết hạn — thử lại", `failed` lý do. `data-testid`: `admin-free-tab-accounts`, `admin-account-card`, `admin-account-add`, `admin-account-qr`, `admin-account-relogin`, `admin-account-remove`.
- Verify: tsc, eslint file đụng tới, `npm run build:admin`.
- Commit `feat(admin): tab Nick Zalo — thêm nick bằng QR, đăng nhập lại, gỡ; thống kê cuốc theo nhóm`.

---

### Task 6: Tài xế — "Báo khi có cuốc phù hợp" + e2e + tài liệu

**Files:** Create `frontend/src/components/driver/FreeRideAlertSheet.tsx`; Modify `frontend/src/pages/driver/FreeRidesPage.tsx`, `frontend/src/api/freeRides.ts`, `frontend/src/types.d.ts`; Create `frontend/e2e/free-rides-accounts.spec.ts`, `frontend/e2e/free-rides-alert.spec.ts`; Modify `docs/DEPLOY.md`, `zalo-service/README.md`.

- Tab Free: nút chuông "Báo khi có cuốc phù hợp" (đang bật thì hiện trạng thái + bộ lọc đã lưu) → sheet: dùng bộ lọc đang chọn (chiều, số chỗ, từ khoá) làm mặc định, công tắc bật/tắt, "Lưu"; khi bật mà trình duyệt chưa cho phép thông báo → dùng luồng xin quyền/đăng ký push sẵn có của app tài xế (tìm hàm đăng ký push hiện có, không viết lại). `data-testid`: `free-alert-open`, `free-alert-toggle`, `free-alert-save`.
- E2E: (1) admin thêm nick — giả lập service bằng request có ký vào endpoint nội bộ (`pending → qr_ready` với ảnh PNG nhỏ → `done`) và kiểm UI hiện QR rồi "Đã đăng nhập"; gỡ nick tạo yêu cầu remove; (2) tài xế lưu cảnh báo, reload thấy trạng thái đã lưu. Chạy 2 lần liên tiếp + chạy lại 2 spec Cuốc Free cũ.
- Docs: DEPLOY.md "Giai đoạn 5" (migrate, `.env` service: `AI_PROVIDER`, `AI_MODEL`, `OPENAI_API_KEY`, `AI_FLUSH_MS`, `RIDES_FLUSH_MS`, `ACCOUNT_REQUESTS_POLL_MS`; thêm nick bằng trang admin thay cho `npm run login` + copy file; build admin + driver); README service tương ứng.
- Commit `feat(free-rides): tài xế đăng ký thông báo cuốc phù hợp; e2e nick Zalo và cảnh báo; tài liệu giai đoạn 5`.
