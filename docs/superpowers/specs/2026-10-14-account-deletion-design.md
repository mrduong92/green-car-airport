# Xoá tài khoản — thiết kế

**Ngày:** 2026-10-14 · **Nhánh:** `feat/account-deletion` (tách từ `main`, PR riêng)

## Mục tiêu

Google Play bắt buộc: app có tạo tài khoản phải cho người dùng **tự xoá tài khoản trong app** và có **một link web** để yêu cầu xoá mà không cần cài app. Thiếu là bị từ chối khi duyệt. Áp dụng cho cả app khách và app tài xế (bản web dùng chung code nên có luôn).

Thành công khi: người dùng tự xoá được trong vài bước; sau khi xoá không còn dữ liệu nhận dạng họ; lịch sử cuốc, doanh thu, chứng từ tiền của **người khác và của công ty** không bị sai; số điện thoại đăng ký lại được.

## Quyết định đã chốt (chủ dự án)

1. **Xoá danh tính, giữ cuốc/giao dịch ở dạng ẩn danh** — không xoá cứng (xoá cứng làm tụt doanh thu quá khứ, tài xế mất lịch sử cuốc, mất chứng từ kế toán phải lưu 10 năm).
2. **Ví còn điểm → chặn**, báo liên hệ admin quyết toán trước.
3. **Còn cuốc dở dang → chặn** tới khi hoàn thành/huỷ.
4. **Cho đăng ký lại cùng SĐT** như người mới; nhưng **tài khoản đang bị khoá** hoặc **khách còn nợ phí phạt huỷ** thì không tự xoá được (chặn lách khoá/trốn phạt).

## Ngoài phạm vi

- Nút xoá trong trang admin (admin dùng lệnh artisan — yêu cầu kiểu này hiếm).
- Hạn chờ/khôi phục sau khi xoá (xoá là ngay lập tức, không khôi phục).
- Xoá ảnh giấy tờ trên đĩa — hiện hồ sơ tài xế chỉ lưu **số** giấy tờ, không có file ảnh.

## 1. Cách xoá: ẩn danh hoá tại chỗ

Giữ dòng `users` (id không đổi) → mọi khoá ngoại (`bookings.customer_id`, `bookings.driver_id`, `wallets.user_id`, `terms_acceptances.user_id`, `users.referred_by_user_id`…) vẫn hợp lệ, **không sửa khoá ngoại nào**; mọi màn đang hiện `booking->customer->name` tự thành "Người dùng đã xoá".

**Không dùng trait `SoftDeletes`**: nó gắn global scope vào mọi truy vấn, `booking->customer` trả `null` ở mọi nơi → các trang lịch sử cuốc lỗi. Thay bằng cột `users.deleted_at` (nullable timestamp) + lọc thủ công đúng những chỗ cần.

| Dữ liệu | Xử lý |
|---|---|
| `users.name` | `Người dùng đã xoá` |
| `users.phone` | `deleted-<id>` — giải phóng SĐT, giữ unique `(phone, role)` |
| `users.password` | Hash của chuỗi ngẫu nhiên 64 ký tự (không đăng nhập được) |
| `users.referral_code` | `null` |
| `users.is_collaborator` | `false` |
| `users.deleted_at` | `now()` |
| `driver_profiles` (CCCD, GPLX, đăng ký xe, đăng kiểm, bảo hiểm, biển số, hiệu/màu/năm xe, toạ độ, mã thanh toán) | **Xoá dòng** |
| `personal_access_tokens` (tokenable = user) | Xoá |
| `device_tokens` | Xoá |
| `notifications` (notifiable = user) | Xoá |
| `otps` theo SĐT cũ | Xoá |
| `driver_free_ride_alerts`, `driver_hidden_senders`, `free_ride_reports` của tài xế | Xoá |
| `vouchers` cá nhân (`user_id` = user) **chưa dùng** | Xoá |
| `bookings` của khách: `note` | `null` (khách hay ghi SĐT/tên vào ghi chú) |
| `bookings` (địa chỉ, giá, thời gian, trạng thái) | Giữ — không còn gắn danh tính |
| `wallets`, `wallet_transactions` | Giữ (chứng từ kế toán; ví đã = 0 vì bị chặn khi còn điểm) |
| `terms_acceptances` | Giữ (chứng cứ pháp lý) |
| `campaign_grants` (khuyến mãi người mới đã nhận) | Giữ `phone` (chặn đăng ký lại để nhận lại ưu đãi), đặt `user_id = null` — không còn nối với tài khoản |

Tất cả trong **một transaction** — lỗi giữa chừng thì không đổi gì.

**Những chỗ phải lọc `deleted_at`:**
- Danh sách người dùng/tài xế trong admin (không hiện tài khoản đã xoá).
- `SendNewBookingBroadcastJob` và mọi truy vấn chọn người nhận thông báo — không cần sửa: tài xế đã xoá không còn `driver_profiles` nên đã bị loại bởi `whereHas('driverProfile')`; token push cũng đã xoá.
- Đăng nhập — không cần sửa: SĐT đã thành `deleted-<id>`, PIN ngẫu nhiên, token đã xoá.

## 2. Điều kiện chặn

Kiểm tra theo thứ tự, gặp điều kiện đầu tiên là trả **422** với thông báo cụ thể (tiếng Việt) kèm hướng dẫn liên hệ admin:

| Điều kiện | Thông báo |
|---|---|
| PIN sai | `Mã PIN không đúng.` |
| Còn cuốc dở dang — khách: `finding_driver`, `accepted`, `picking_up`, `in_progress` (theo `customer_id`); tài xế: `accepted`, `picking_up`, `in_progress` (theo `driver_id`) | `Bạn còn cuốc chưa hoàn thành. Vui lòng hoàn thành hoặc huỷ cuốc trước khi xoá tài khoản.` |
| `wallets.points > 0` (ví tài xế hoặc ví cộng tác viên — cùng bảng) | `Ví của bạn còn N điểm. Vui lòng liên hệ admin để quyết toán trước khi xoá tài khoản.` |
| `users.is_blocked` hoặc `driver_profiles.status = blocked` | `Tài khoản đang bị khoá. Vui lòng liên hệ admin.` |
| `users.pending_penalty > 0` | `Bạn còn phí phạt huỷ cuốc chưa thanh toán. Vui lòng liên hệ admin.` |

Kiểm tra lại các điều kiện **trong transaction với khoá dòng** (`lockForUpdate` trên user/ví) để không có cuốc mới hay điểm mới chen vào giữa lúc kiểm và lúc xoá.

## 3. Backend

- **`App\Services\AccountDeletionService`**
  - `blockingReason(User $user): ?string` — trả thông báo chặn (mục 2, trừ PIN) hoặc `null`.
  - `delete(User $user, bool $ignoreHolds = false): void` — trong transaction: khoá dòng, kiểm lại `blockingReason` (bỏ qua chặn khoá/nợ phạt khi `$ignoreHolds`; **cuốc dở dang và ví > 0 luôn chặn**), rồi ẩn danh hoá theo bảng mục 1. Ném `AccountDeletionBlocked` (mang thông báo) khi bị chặn.
- **Route** `DELETE /api/me` (auth:sanctum, mọi role) → `AccountController::destroy` với `DeleteAccountRequest` (`password` bắt buộc, 6 số). Sai PIN → 422. Bị chặn → 422 + thông báo. Thành công → 200 `{ message: 'Tài khoản của bạn đã được xoá.' }`.
- **Migration**: thêm `users.deleted_at` (nullable timestamp, index).
- **Lệnh** `php artisan account:delete {phone} {role} {--force}` — cùng service; `--force` = `$ignoreHolds`. In lý do khi bị chặn, hỏi xác nhận trước khi xoá.
- **Trang tĩnh** `xoa-tai-khoan` thêm vào `StaticPageSeeder` (`updateOrCreate`), deploy chạy `db:seed --class=StaticPageSeeder --force`. Nội dung: 2 cách xoá (tự xoá trên web/app; nhắn admin), dữ liệu xoá ngay, dữ liệu giữ ẩn danh và lý do (Luật Kế toán — 10 năm). URL khai báo với Google: `https://greenca.vn/pages/xoa-tai-khoan`.
- **Admin**: `GET /admin/customers` và `GET /admin/drivers` lọc `whereNull('deleted_at')`.

## 4. Frontend

- **Trang Hồ sơ** (khách `pages/customer/ProfilePage.tsx`, tài xế `pages/driver/ProfilePage.tsx`): dưới nút "Đăng xuất", dòng chữ nhỏ màu `danger-red` **"Xoá tài khoản"**.
- **Bottom sheet xác nhận** — component dùng chung `components/common/DeleteAccountSheet.tsx`:
  - Liệt kê ngắn: xoá ngay (tên, SĐT, giấy tờ, thông báo…); giữ ẩn danh (lịch sử cuốc, giao dịch); **không thể khôi phục**.
  - Ô nhập PIN 6 số, nút đỏ **"Xoá vĩnh viễn"** (khoá nút khi chưa đủ 6 số hoặc đang gửi).
  - Lỗi 422 → hiện đúng thông báo của server (`apiMessage`) ngay trong sheet, kèm link Liên hệ admin (Zalo/hotline từ cài đặt).
- **API** `src/api/auth.ts`: `deleteAccount(password)`.
- **Sau khi xoá thành công**: dọn push cục bộ (bỏ qua lỗi API — token đã bị server xoá), `clearAuth()`, về màn đăng nhập, toast **"Tài khoản của bạn đã được xoá"**. Không gọi `logoutApi()`.

## 5. Kiểm thử

**Backend (Feature tests):**
- Xoá thành công — khách và tài xế: từng dòng của bảng mục 1 đúng (ghi đè/xoá/giữ); `bookings` và `wallet_transactions` còn nguyên; ghi chú cuốc bị xoá.
- Sau khi xoá: đăng nhập bằng SĐT cũ thất bại; token cũ 401; **đăng ký lại cùng SĐT thành công** (tài khoản mới, id mới).
- Từng điều kiện chặn (PIN sai, cuốc dở dang khách/tài xế, ví > 0, bị khoá ×2, nợ phạt) → 422 đúng thông báo, **không thay đổi dữ liệu**.
- Màn tài xế xem cuốc cũ của khách đã xoá → tên "Người dùng đã xoá", không lỗi.
- Lệnh artisan: chặn như API; `--force` bỏ qua khoá/nợ nhưng vẫn chặn cuốc dở/ví > 0.
- Admin: danh sách không còn tài khoản đã xoá.

**Frontend (e2e Playwright):** khách mở Hồ sơ → Xoá tài khoản → nhập PIN → về màn đăng nhập, toast; trường hợp bị chặn hiện đúng thông báo.

## Rủi ro

- **Truy vấn quên lọc `deleted_at`** (vd. báo cáo/thống kê theo người dùng) — chấp nhận: tên đã là "Người dùng đã xoá", không lộ danh tính; chỉ lọc ở danh sách quản lý người dùng.
- **Job đang nằm trong hàng đợi** gửi thông báo cho người vừa xoá — token đã xoá nên không gửi được; thông báo `database` có thể tạo dòng mới sau khi xoá → service xoá `notifications` trong transaction, job tới muộn chỉ tạo dòng gắn tài khoản đã ẩn danh (vô hại).
