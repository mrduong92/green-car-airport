# Cuốc Free — Giai đoạn 4: Quản trị — Design

Ngày: 09/10/2026. Nối tiếp `2026-10-04-zalo-free-rides-design.md` (mục 7, dòng "4 — Quản trị"). Làm chung PR #13.

## 1. Mục tiêu và phạm vi

Cuốc Free là tính năng miễn phí, phi lợi nhuận: chỉ cần **đủ để vận hành**, lọt một phần cuốc là chấp nhận được.

**Làm:**
1. Service tự **quét toàn bộ nhóm** mà các nick phụ đang ở → admin thấy đủ danh sách nhóm (kể cả nhóm chưa có tin), bật/tắt từng nhóm.
2. Admin xem **người bắn**, chặn / bỏ chặn toàn hệ thống.
3. Admin xem **tình trạng**: nick phụ có kết nối không, chi phí AI hôm nay / trần, số cuốc đang hiện, heartbeat cuối.

**Không làm (đã chốt với người dùng 09/10):**
- Admin nhập link mời / service tự vào nhóm — đưa nick vào nhóm làm ngoài hệ thống (người trong nhóm thêm nick, hoặc nhân viên tự vào bằng điện thoại). Service vẫn **chỉ đọc** với Zalo.
- Admin xử lý từng báo cáo, tự ẩn cuốc theo số báo cáo. Nút báo cáo/ẩn phía tài xế (giai đoạn 3) **giữ nguyên** vì App Store mục 1.2 bắt buộc khi lên app native; admin chỉ thấy số báo cáo để tham khảo khi chặn.
- Kiểm thử tải 150k tin/ngày.

## 2. Quét nhóm (service)

- `GroupScanner` chạy lúc khởi động (sau khi nick đăng nhập) và mỗi **30 phút**: với từng nick đang đăng nhập gọi `getAllGroups()` (chỉ đọc) lấy danh sách ID nhóm.
- Nhóm mới thấy, hoặc nhóm chưa biết tên → `getGroupInfo` theo lô ≤ 20 ID, nghỉ 1 giây giữa các lô (không dồn request). Lấy tên và số thành viên.
- Lưu SQLite (schema v4):
  - `chat_groups` thêm cột `member_count INTEGER`, `left_at INTEGER` (NULL = còn ở).
  - Bảng mới `group_accounts (zalo_group_id, account_id, seen_at, PRIMARY KEY (zalo_group_id, account_id))` — nick nào đang ở nhóm nào.
- Một nhóm không còn nick nào thấy trong lần quét gần nhất (của mọi nick đã quét thành công) → đặt `left_at`. Thấy lại → xoá `left_at`.
- Nick quét lỗi (mất kết nối, Zalo trả lỗi) → bỏ qua nick đó lần này, **không** đánh dấu các nhóm của nó là đã rời.
- `GroupsSync` (đã có, 10 phút/lần) gửi thêm cho mỗi nhóm: `member_count`, `accounts` (danh sách ID nick), `left` (bool). Gửi mọi nhóm đã biết, không chỉ nhóm có tin.
- Nghe tin: production để `ALLOWED_GROUP_IDS` rỗng (nghe mọi nhóm), bật/tắt bằng admin như hiện có (`disabled_group_ids` qua `/config`). `ALLOWED_GROUP_IDS` giữ cho thử nghiệm.

## 3. Laravel

- `zalo_groups` thêm cột: `member_count` (unsigned int, null), `accounts` (json, null), `left_at` (timestamp, null). `POST /api/internal/zalo/groups` nhận thêm 3 trường (tuỳ chọn, tương thích ngược), vẫn không đụng `enabled`.
- API admin (sau `auth:sanctum` → `role:admin`, trả mảng thuần):
  - `GET /api/admin/free-rides/groups?q=&status=enabled|disabled|left&page=` — tên, ID, số thành viên, số tin 24 giờ, tin gần nhất, nick đang ở, bật/tắt, đã rời. Sắp theo số tin 24 giờ giảm dần.
  - `PATCH /api/admin/free-rides/groups/{zalo_group_id}` `{ enabled: bool }`.
  - `GET /api/admin/free-rides/senders?q=&blocked=1&page=` — người đã từng đăng cuốc (gộp từ `free_rides` theo `sender_uid`): tên gần nhất, số cuốc đang hiện, tổng cuốc 7 ngày, số báo cáo (từ `free_ride_reports`), đang bị chặn hay không.
  - `POST /api/admin/free-rides/senders/{sender_uid}/block`, `DELETE .../block` — ghi/xoá `zalo_sender_blocks` (lưu admin thực hiện).
  - `GET /api/admin/free-rides/status` — từ heartbeat cache (`ZaloServiceMonitor`): từng service + nick (kết nối hay không, lỗi gần nhất), heartbeat cuối, chi phí AI hôm nay / trần, hộp thư đi tồn, thống kê mã QR 24 giờ; từ DB: số cuốc đang hiện, số nhóm đang bật / tổng.
- Tắt nhóm / chặn người bắn có hiệu lực ngay trên tab Free (đã lọc ở `visibleTo`) và ở service sau ≤ 60 giây (`/config`).

## 4. Admin UI

- Thêm mục menu admin **"Cuốc Free"** (icon `local_taxi`, không phải mục chính trên mobile — nằm trong sheet "Thêm") → trang `/free-rides` với 3 tab:
  - **Nhóm:** ô tìm kiếm, lọc Đang bật / Đã tắt / Nick đã rời; bảng (mobile: thẻ) tên nhóm, số thành viên, tin 24 giờ, tin gần nhất (giờ VN), công tắc bật/tắt. Ghi chú ngắn: "Muốn thêm nhóm: thêm nick phụ vào nhóm Zalo — hệ thống tự thấy trong ≤ 30 phút."
  - **Người bắn:** tìm kiếm, lọc Đang bị chặn; tên, cuốc đang hiện, cuốc 7 ngày, số báo cáo; nút Chặn / Bỏ chặn (Chặn có hỏi xác nhận).
  - **Tình trạng:** thẻ từng nick (xanh = kết nối, đỏ = mất kết nối + lỗi), chi phí AI hôm nay / trần, cuốc đang hiện, nhóm đang bật / tổng, heartbeat cuối ("x phút trước"). Tự làm mới 60 giây.
- Theo design token và mẫu trang admin hiện có (`DriversPage`, `CustomersPage`), responsive mobile.

## 5. Kiểm thử

- Service: `GroupScanner` với api giả — nhóm mới được tra tên theo lô 20; nhóm biến mất ở mọi nick → `left_at`; nick quét lỗi không làm nhóm "rời"; migration v4 nâng từ v3 không mất dữ liệu; `GroupsSync` gửi đủ trường mới.
- Laravel: từng endpoint admin (quyền admin, lọc, bật/tắt, chặn/bỏ chặn có hiệu lực trên `GET /api/driver/free-rides`), endpoint groups nhận trường mới và vẫn chấp nhận payload cũ.
- Frontend: typecheck/lint/build; Playwright e2e trang admin (bật/tắt nhóm, chặn người bắn → cuốc biến khỏi tab Free).
- Không gọi Zalo thật trong test. Người dùng tự kiểm với nick thật: chạy service, sau ≤ 30 phút trang admin thấy đủ nhóm của nick.

## 6. Rủi ro

- `getAllGroups` / `getGroupInfo` cho ~300 nhóm mỗi 30 phút: ~15 lô getGroupInfo chỉ cho nhóm mới/chưa có tên, còn lại chỉ 1 lời gọi `getAllGroups`/nick → tải nhẹ, vẫn chỉ đọc.
- Nhóm mới mặc định **bật** → nick bị kéo vào nhóm rác thì cuốc rác hiện cho tới khi admin tắt. Chấp nhận (phi lợi nhuận, admin tắt được ngay).
