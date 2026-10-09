# Cuốc Free — Việc còn lại (backlog)

Cập nhật: 09/10/2026. Bổ sung cho `2026-10-04-zalo-free-rides-design.md` và `2026-10-09-zalo-free-rides-admin-design.md`.

## Đã chốt cần làm (người dùng yêu cầu)

1. **Đăng nhập nick Zalo phụ ngay trên trang admin** (thay cho `npm run login -- accX` trên máy cá nhân rồi copy file lên VPS).
   - Admin bấm "Thêm nick" → service tạo mã QR đăng nhập → admin quét bằng app Zalo của nick phụ → phiên lưu vào `data/accounts/<id>.json` trên VPS, service tự chạy nick mới (không cần restart).
   - Kiến trúc giữ nguyên "Laravel không gọi vào service": service hỏi `/config` thấy yêu cầu đăng nhập → tạo QR → đẩy ảnh QR lên Laravel (endpoint có ký) → trang admin hiện QR, tự làm mới khi hết hạn → service báo kết quả.
   - Kèm: "Đăng nhập lại" cho nick hết phiên, "Gỡ nick".
2. **Admin biết đang có những nick nào đăng nhập**: danh sách nick (tên Zalo, UID, trạng thái kết nối, lỗi gần nhất, lần đăng nhập, số nhóm). Tab "Tình trạng" hiện đã có trạng thái từng nick — mở rộng thành trang/tab "Nick Zalo" riêng.
3. **Nhóm theo từng nick, bật/tắt**: chọn một nick → danh sách nhóm của nick đó (dữ liệu `group_accounts` đã có) với công tắc bật/tắt. Hiện bật/tắt là theo nhóm (áp cho mọi nick) — cần chốt: tắt "nhóm X ở nick A" có nghĩa là bỏ qua tin của nhóm X nhận qua nick A, hay vẫn là tắt cả nhóm.

## Gợi ý thêm (chưa chốt)

| # | Chức năng | Lợi ích | Ước lượng |
|---|---|---|---|
| A | **Thông báo đẩy cuốc Free theo bộ lọc đã lưu** (vd. "tiễn sân bay, xe 7 chỗ, quanh Hà Đông") | Tài xế không phải mở app canh — giá trị lớn nhất cho tài xế | vừa |
| B | **Thống kê nhóm**: số cuốc/ngày mỗi nhóm, gợi ý tắt nhóm 7 ngày không ra cuốc | Dọn nhóm rác, giảm chi phí AI | nhỏ |
| C | **Biểu đồ chi phí AI & tỷ lệ tách cuốc** (quy tắc / AI / nguyên văn) theo ngày | Kiểm soát ngân sách, biết khi nào cần chỉnh quy tắc | nhỏ |
| D | **Từ khoá chặn/cho phép do admin sửa** (vd. bỏ tin chứa "tuyển tài xế", "bán xe") | Lọc rác trước AI → rẻ hơn, tab Free sạch hơn | nhỏ |
| E | **Cảnh báo Telegram khi nick mất kết nối/hết phiên** kèm link trang admin để đăng nhập lại (healthcheck đã báo mất kết nối — nối với mục 1) | Giảm thời gian mất tin | nhỏ |
| F | **Tài xế bỏ ẩn người bắn** (danh sách người đã ẩn trong hồ sơ) | Sửa ẩn nhầm | nhỏ |
| G | **Danh mục khu vực / sân bay** cho bộ lọc (Nội Bài, Tân Sơn Nhất, quận…) | Lọc chính xác hơn tìm chữ | vừa |
| H | **Nhật ký thao tác admin** (ai tắt nhóm, chặn người bắn, lúc nào) | Truy vết khi nhiều admin | nhỏ |
| I | **Dự phòng nhóm quan trọng**: cảnh báo nhóm chỉ có 1 nick ở (nick đó rớt là mất tin) | Giảm rủi ro mất tin | nhỏ |
| J | **Chọn nhà cung cấp AI** (Claude Haiku / GPT-4o-mini / DeepSeek) trong cấu hình | Tối ưu chi phí | nhỏ (đã có lớp `Extractor`) |

## Nợ kỹ thuật đã ghi nhận

- Số thành viên nhóm chỉ lấy lần đầu, chưa tự làm mới.
- Ngay sau deploy, nhóm của nick đang đăng nhập dở có thể tạm hiện "Nick đã rời".
- Có thể tự ping socket mỗi 30 giây nếu đo thấy Zalo đóng kết nối 1000 định kỳ (hiện mở lại sau 3 giây).
