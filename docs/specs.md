**1\. Bối cảnh & Bài toán cần giải quyết**

Hiện nay, dịch vụ xe tiện chuyến sân bay đang được vận hành thủ công 100% qua các nhóm Zalo kín - tài xế nhắn tin, thỏa thuận miệng, chủ nhóm thu phí bằng cách ghi nhớ hoặc sổ tay. Mô hình này có nhiều hạn chế nghiêm trọng:

- Không minh bạch: Dễ xảy ra tranh chấp phí giữa tài xế và chủ nhóm vì không có bằng chứng rõ ràng
- Khó scale: Khi số lượng tài xế và khách tăng lên, nhóm chat trở nên hỗn loạn, khó quản lý
- Không lưu lịch sử: Không biết tài xế nào đã chạy bao nhiêu cuốc, doanh thu thực tế là bao nhiêu
- Trải nghiệm khách hàng kém: Khách không biết tiến trình đặt xe, không có xác nhận rõ ràng
- Phụ thuộc cá nhân: Nếu chủ nhóm bận hoặc không online, cả hệ thống bị đình trệ.

_Mục tiêu: Số hoá toàn bộ quy trình trên thành một nền tảng web chuyên nghiệp, tự động hoá việc tính phí, giúp chủ app quản lý dễ dàng và nâng cao trải nghiệm cho cả khách hàng lẫn tài xế._

**2\. Giải pháp đề xuất - Green Car Airport PWA**

AMD AI Solutions đề xuất xây dựng Green Car Airport dưới dạng Progressive Web App (PWA) - một giải pháp web hiện đại có thể cài đặt trên điện thoại như app thông thường, không cần qua App Store hay Google Play.

**Tại sao chọn PWA?**

- Không cần chờ duyệt App Store - ra mắt nhanh, sẽ phù hợp giai đoạn đầu tối ưu chi phí
- Khách hàng và tài xế cài đặt dễ dàng: chỉ cần mở link trên điện thoại, bấm "Thêm vào màn hình chính"
- Chi phí phát triển thấp hơn app native 40-50%, dễ cập nhật tính năng
- Khi đã có công ty và lượng user đủ lớn, có thể nâng cấp lên app native (Phase 3)

**Kiến trúc tổng quan**

Hệ thống được chia thành 3 lớp:

- Giao diện người dùng (PWA): Khách hàng đặt xe | Tài xế nhận cuốc | Admin quản lý - mỗi nhóm có màn hình riêng biệt, tối ưu cho mobile
- Backend API (Máy chủ xử lý): Tiếp nhận yêu cầu, áp dụng quy tắc nghiệp vụ, tính toán phí, quản lý điểm tài xế
- Cơ sở dữ liệu & Realtime Engine: Lưu trữ toàn bộ dữ liệu + đẩy thông báo cuốc xe mới đến tài xế ngay lập tức

**3\. Phạm vi tính năng**

**Phase 1 - MVP (Bản hoạt động thực tế)**

Đây là gói cần thiết tối thiểu để hệ thống đi vào vận hành thực tế:

| **Tính năng**              | **Mô tả chi tiết**                                                                                                                                                                                                                                               | **Đối tượng**            |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Đăng ký / Đăng nhập        | Xác thực OTP qua SMS, email + mật khẩu - áp dụng cho cả khách và tài xế                                                                                                                                                                                          | Khách & Tài xế           |
| Đặt xe (Khách)             | Điền form: điểm đi, điểm đến, ngày giờ, số km, giá mong muốn. Gợi ý bảng giá chuẩn của nhà xe                                                                                                                                                                    | Khách hàng               |
| Danh sách cuốc tức thì     | Tài xế thấy ngay cuốc mới và cũ chưa có tài xế nhận vừa được tạo - không cần F5. Tự động lọc theo số dư điểm tài xế.                                                                                                                                             | Tài xế                   |
| Định vị - Cuốc gần nhất    | Tài xế bật định vị, danh sách cuốc tự sắp xếp theo khoảng cách gần nhất.                                                                                                                                                                                         | Tài xế                   |
| Nhận & Thực hiện cuốc      | Tài xế có thể nhận tối đa 3 cuốc. Sau khi kết thúc chuyến mới được nhận thêm cuốc mới chờ. Cập nhật trạng thái: Đang chờ → Đã nhận → Hoàn thành.                                                                                                                 | Tài xế                   |
| Hệ thống điểm & phí app    | Tài xế nạp điểm (Auto nạp điểm khi tiền được chuyển vào tài khoản công ty). Phí 20% tự động khấu trừ khi hoàn thành cuốc.                                                                                                                                        | Tài xế & Admin           |
| Quản lý voucher            | Admin tạo và cấp voucher giảm giá riêng cho từng khách hàng                                                                                                                                                                                                      | Admin                    |
| Huỷ cuốc & Timeout         | Khách huỷ tự do trong vòng 1h sau khi đặt chuyến, sau 1h thì sẽ bị phạt 50k tự động cộng vào cuốc xe tiếp theo và phần tiền phạt này sẽ CỘNG vào tài khoản công ty. Tài xế huỷ sau khi nhận vẫn bị trừ phí. Cuốc hết hạn sau 24h không có ai nhận sẽ tự động huỷ | Khách, Tài xế & Hệ thống |
| Blocked tài xế, khách hàng | Admin chặn tài xế vi phạm - tài khoản bị khoá, điểm bị đóng băng. Không đăng kí lại bằng sđt và thông tin XE đã bị Block được.                                                                                                                                   | Admin                    |
| Push Notification          | Gửi thông báo đẩy đến tất cả tài xế khi có cuốc mới phù hợp (PWA push notification)                                                                                                                                                                              | Tài xế                   |
| Dashboard Admin            | Quản lý cuốc xe, tài xế, khách hàng, lịch sử điểm, duyệt tài khoản tài xế mới (giao diện tinh gọn)                                                                                                                                                               | Admin                    |
| Báo cáo doanh thu          | Thống kê doanh thu, phí app thu được, lịch sử nạp điểm theo ngày/tuần/tháng                                                                                                                                                                                      | Admin                    |

**Các giai đoạn tiếp theo (Phase 2 & 3)**

Sau khi Phase 1 vận hành ổn định, hệ thống có thể được mở rộng:

- Phase 2 - Nâng cấp Maps: Thay thế định vị sort list bằng bản đồ tương tác - tài xế thấy pin các cuốc xung quanh, tap để xem chi tiết và nhận cuốc trực tiếp trên map

Phase 3 - App Native: Phát triển app iOS/Android chính thức khi lượng user đủ lớn, đưa lên App Store & Google Play.