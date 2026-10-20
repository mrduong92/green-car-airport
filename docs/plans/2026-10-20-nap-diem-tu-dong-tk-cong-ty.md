# Kế hoạch: bật nạp điểm tự động qua Pay2S, nhận tiền bằng tài khoản công ty

**Ngày:** 20/10/2026 (cập nhật sau trao đổi)
**Tài khoản nhận tiền mới:** MBBank · STK **328328688688** · **CONG TY TNHH CONG NGHE DI CHUYEN THONG MINH SAVE GO**
**Cổng đối soát:** **Pay2S** (pay2s.vn) thay SePay (SePay phí cao). Tài khoản Pay2S do **AMD** quản lý.
**Hiện tại (production):** QR nạp điểm + QR mở khoá tab Free trỏ vào Techcombank 190\*\*\*022 (cá nhân); admin nạp tay (41 lần / 30 ngày). Webhook SePay có sẵn trong code nhưng chưa từng chạy (0 sự kiện).

## 1. Quyết định đã chốt
- Chuyển cổng sang **Pay2S**; webhook SePay giữ trong code nhưng không dùng (không xoá để có thể quay lại).
- Thông tin tài khoản nhận tiền chuyển vào **Cài đặt admin** (không còn sửa `.env` mỗi lần đổi).
- **Mở khoá tab Free vẫn duyệt tay** — QR mở khoá chỉ đổi sang tài khoản công ty, không tự mở khoá.
- Tài khoản cá nhân cũ: **thôi dùng ngay**; chỉ theo dõi ngắn để xử lý tiền chuyển nhầm (mục 5).

## 2. Pay2S gửi gì (theo tài liệu docs.pay2s.vn)
- `POST` tới URL của mình, header `Authorization: Bearer <token của webhook>` (token Pay2S cấp khi tạo webhook). Mình so token trước khi xử lý.
- Body JSON, hai dạng tài liệu ghi nhận — code phải nhận **cả hai**:
  - Hook thường: **một giao dịch / request** `{ id, gateway, transactionDate, transactionNumber, accountNumber, content, transferType: "IN"|"OUT", transferAmount, checksum }`.
  - Partner webhook: `{ "transactions": [ { ...cùng các trường... } ] }`.
- Không có trường mã thanh toán riêng → lấy mã **`GCA` + 6 số** từ `content` (code hiện có đã làm việc này).
- Trả **HTTP 200 `{"success": true}`** trong 30 giây; khác 200 → Pay2S ghi lỗi và có thể gửi lại (thủ công qua lịch sử webhook) → xử lý phải **idempotent** theo `id`/`transactionNumber`.
- `checksum`: tài liệu không mô tả cách tính → chỉ lưu lại để đối soát, không dùng để xác thực (xác thực bằng Bearer token).

## 3. Việc dev (1 PR)
1. **Endpoint `POST /api/webhooks/pay2s`**: xác thực Bearer token (`PAY2S_WEBHOOK_TOKEN` trong `.env`, so sánh hằng thời gian); nhận cả hai dạng body; chỉ cộng giao dịch `IN` vào **đúng số tài khoản đang cài đặt**; mỗi giao dịch xử lý độc lập (một giao dịch lỗi không làm hỏng cả lô); luôn trả 200 `{"success":true}` cho request hợp lệ.
2. **Tách lõi xử lý chung khỏi SePay**: một service "nạp điểm từ chuyển khoản" dùng cho cả Pay2S và SePay — tìm `GCA` + 6 số → cộng `floor(số tiền / 1000)` điểm → push "Nạp điểm thành công". Lưu sự kiện vào bảng chung có cột **cổng** (`pay2s`/`sepay`) + **mã giao dịch của cổng** (duy nhất theo cổng) → không cộng trùng khi gửi lại. (Bảng SePay hiện có 0 dòng nên đổi sang bảng chung không mất dữ liệu.)
3. **Màn admin "Giao dịch chuyển khoản"**: danh sách sự kiện (đã cộng / không khớp / bỏ qua), lọc theo trạng thái + ngày; giao dịch **không khớp** (ghi sai/thiếu nội dung, kể cả `MOKHOA <sđt>` để admin đối chiếu khi duyệt mở khoá Free) → admin chọn tài xế → **gán & cộng điểm** một lần, ghi người thao tác.
4. **Chống cộng trùng tay + tự động**: hộp "Nạp điểm thủ công" cảnh báo nếu tài xế vừa được cộng tự động cùng số tiền trong 24 giờ.
5. **Cảnh báo admin** khi có giao dịch không khớp (dùng kênh cảnh báo hệ thống hiện có).
6. **Cài đặt admin → "Tài khoản nhận tiền"**: ngân hàng (mã VietQR, vd `MB`), số tài khoản, tên chủ tài khoản (viết hoa không dấu). QR nạp điểm + QR mở khoá Free đọc từ đây (`.env` chỉ còn là giá trị dự phòng). Hiện xem trước QR ngay trên trang Cài đặt.
7. Tài liệu `docs/DEPLOY.md` (cấu hình Pay2S, tắt khẩn cấp) + test: hai dạng payload, sai token → 401, giao dịch OUT/sai số TK/ < 1.000đ → bỏ qua, gửi lại cùng `id` → không cộng 2 lần, không khớp → hiện ở màn admin và gán được.

## 4. Việc phía AMD trên Pay2S
1. Liên kết **MBBank 328328688688** (tài khoản công ty) vào Pay2S.
2. Tạo webhook: URL **`https://greenca.vn/api/webhooks/pay2s`**, loại **IN** (tiền vào), chọn đúng tài khoản MB.
3. Gửi **token của webhook** cho dev qua kênh riêng (không gửi trong nhóm chat).
4. Kiểm tra gói Pay2S đủ số giao dịch/tháng (hiện ~40–100 lần nạp/tháng, sẽ tăng).

## 5. Các bước chuyển đổi
1. Merge + deploy PR (chưa có token → endpoint từ chối mọi request; QR vẫn như cũ cho tới bước 2).
2. Trên prod: thêm `PAY2S_WEBHOOK_TOKEN`, `FEATURE_AUTO_TOPUP=true`; vào **Cài đặt admin** nhập MB · 328328688688 · CONG TY TNHH CONG NGHE DI CHUYEN THONG MINH SAVE GO; kiểm xem trước QR.
3. Kiểm tra:
   - Quét QR trong app tài xế (Nạp điểm + Mở khoá Free) bằng app ngân hàng thật → hiện đúng tên công ty.
   - Pay2S "gửi thử" → server nhận 200, sự kiện hiện ở màn admin.
   - **Chuyển thật 10.000đ** nội dung `GCA<mã tài xế test>` → trong ~1 phút ví +10 điểm, có push.
   - Chuyển thử nội dung sai → hiện "không khớp", admin nhận cảnh báo, gán thủ công được.
4. Thông báo tài xế (push + nhóm Zalo): tài khoản nhận tiền đổi sang công ty SAVE GO – MBBank, điểm tự cộng trong ~1 phút, **giữ nguyên nội dung chuyển khoản (mã GCA…)**.

## 6. Tài khoản cá nhân cũ — vì sao vẫn theo dõi một thời gian ngắn
Không còn dùng làm kênh nhận tiền: QR trong app đổi sang tài khoản công ty ngay khi lưu Cài đặt. Nhưng tài xế đã **lưu số tài khoản cũ trong app ngân hàng** (người nhận gần đây) vẫn có thể chuyển nhầm — mình không chặn được việc đó. Nếu không ai xem tài khoản cũ, tài xế chuyển tiền thật mà không được cộng điểm, không ai biết. Đề xuất: chủ tài khoản cũ để ý sao kê **khoảng 2 tuần** sau khi đổi; có tiền vào thì admin nạp tay (hoặc chuyển trả) và nhắc tài xế dùng tài khoản mới. Sau đó thôi theo dõi.

## 7. Rủi ro & phương án
| Rủi ro | Phương án |
| --- | --- |
| Webhook không tới / Pay2S lỗi | Pay2S có lịch sử + gửi lại thủ công; admin xem màn giao dịch; tạm nạp tay |
| Cộng trùng (gửi lại / nạp tay) | Idempotent theo mã giao dịch của cổng; cảnh báo trong hộp nạp tay |
| Tài xế ghi sai nội dung | Màn "không khớp" + cảnh báo admin |
| Request giả mạo | Bearer token chỉ trong `.env` prod; chỉ cộng tiền vào đúng số TK đang cài đặt |
| Cần tắt gấp | `FEATURE_AUTO_TOPUP=false` + `config:cache` → chỉ ghi nhận, quay về nạp tay |
