# Phase 2 — App native Android / iOS

Cửa vào cho toàn bộ tài liệu phase 2. Đọc file này trước.

## Trạng thái: CHƯA KHỞI ĐỘNG

Đang chờ khách hàng tất toán phase 1. **Không triển khai phase 2 trước khi phase 1 được thanh toán xong** — xem mục "Vì sao chờ" bên dưới.

Những gì **đã** làm (nằm ngoài phạm vi tính phí phase 2, hoặc thuộc phase 1):

| Việc | Trạng thái |
|---|---|
| Bản POC Capacitor cho app khách hàng | Chạy được trên emulator Android, gọi API staging thành công |
| Sửa lỗi session token Goong | **Đã deploy production** — giảm chi phí bản đồ, thuộc bảo trì phase 1 |
| Toàn bộ tài liệu trong thư mục này | Xong |
| Tài khoản Apple / Google | Chưa có |
| 26 file cần sửa trong source | Chưa làm (2/26 đã xong trên nhánh POC) |

**Code POC nằm trên nhánh `poc/capacitor-android`, CHƯA merge vào main** — cố ý, để không đưa thay đổi của một dự án chưa khởi động vào nhánh chính. Nhánh gồm: vỏ Capacitor app khách hàng, `api/base.ts` + sửa `axios.ts`, sửa `echo.ts`.

---

## Chỉ mục

| File | Nội dung |
|---|---|
| `01-thiet-ke.md` | Thiết kế kỹ thuật đầy đủ — kiến trúc, push FCM/APNs, xoá tài khoản, buộc cập nhật, điều kiện duyệt store, rủi ro |
| `02-proxy-goong.md` | Thiết kế proxy Goong qua backend — bịt rò rỉ khoá API, thêm cache, đo lường |
| `03-thiet-bi-va-cong-cu.md` | Thiết bị và công cụ cần cho iOS/Android, cái gì test được trên máy ảo |
| `04-build-tren-ubuntu.md` | Hướng dẫn tự chứa để build app Android trên máy Ubuntu |
| `05-checklist-phat-hanh.md` | Checklist thực thi: Google/Apple, và **Track D — 26 file phải sửa** |
| `06-phieu-thong-tin-khach-hang.md` | Phiếu thu thập thông tin cho D-U-N-S. **Đã lỗi thời** khi chọn tài khoản cá nhân — giữ lại nếu quay về phương án doanh nghiệp |

Báo giá gửi khách nằm ngoài thư mục này và ngoài git: `docs/Bao_gia_App_Native.md`.

---

## Sổ quyết định

Các quyết định đã chốt trong quá trình bàn thảo. Ghi lại vì phần lớn không suy ra được từ code.

| # | Quyết định | Lý do |
|---|---|---|
| 1 | **Dùng Capacitor**, không viết lại bằng React Native hay Flutter | Tái sử dụng ~95% code, team React hiện tại làm được, ~4 tuần thay vì 3–5 tháng. Flutter cũng tự vẽ UI lên canvas nên không "native" hơn về bản chất giao diện |
| 2 | appId **`vn.greenca.customer`** / **`vn.greenca.driver`** | Thương hiệu là GreenCA (`brand.ts`), không còn Save Go. **appId không đổi được sau khi phát hành** |
| 3 | Đặt **hostname riêng cho WebView** (`app.greenca.vn`) trong `capacitor.config.ts` | Origin mặc định của Capacitor có host `localhost`, khớp `SANCTUM_STATEFUL_DOMAINS` mặc định → Sanctum bắt CSRF → mọi request trả 419. Đã gặp thật ở POC |
| 4 | **FCM làm cổng duy nhất** cho cả Android và iOS | Firebase nhận khoá APNs và chuyển tiếp sang Apple → backend chỉ một bộ mã gửi, một loại token |
| 5 | Tài khoản store: **cá nhân của AMD** | Đã chốt với khách. Bỏ đường doanh nghiệp vì D-U-N-S mất 30 ngày trở lên. Xem mục "Cần xem lại" |
| 6 | Thứ tự phát hành: **Google trước, Apple song song** | Tài khoản cá nhân trên Google bị buộc 12 người thử nghiệm trong 14 ngày liên tục → Google thành bên chậm (4–5 tuần) so với Apple (1–2 tuần) |
| 7 | **Không** làm theo dõi vị trí realtime trong đợt này | Hệ thống hiện chỉ dùng GPS một lần để điền điểm đón. Nếu làm thì **bó vào cửa sổ đón** để dùng quyền "khi đang dùng app" thay vì "luôn luôn" |
| 8 | Proxy Goong: **chỉ 4 lệnh REST**, không proxy khoá bản đồ | `goong-js` vẽ tile trong trình duyệt nên bắt buộc có khoá ở client |
| 9 | **Cơ chế buộc cập nhật phải có ở bản phát hành ĐẦU TIÊN** | Nó chỉ bảo vệ được những bản đã chứa nó. Thêm ở bản 2 thì đúng người không cập nhật lại là người không có nó |
| 10 | **App Admin không lên store** | Admin dùng desktop; Apple thường từ chối app chỉ dành cho nội bộ |

## Những phát hiện quan trọng khi làm POC

Không có trong thiết kế ban đầu, phát hiện khi chạy thật:

- **Lỗi 419 CSRF** do origin Capacitor trùng `localhost` trong `SANCTUM_STATEFUL_DOMAINS` mặc định. Hỏng im lặng, dễ chẩn đoán sai thành lỗi CORS.
- **`echo.ts` có 3 chỗ suy ra sai** trong app native: hostname, giao thức (iOS trả `capacitor:` nên tưởng không TLS), và `authEndpoint` tương đối. Cả ba đều **hỏng im lặng** — API vẫn chạy, chỉ realtime không tới.
- **`vite-plugin-pwa` tự chèn `registerSW.js`** vào index.html, không có dòng code nào gọi. Native mà service worker vẫn chạy thì **thông báo hiện hai lần**.
- **Khoá Goong nằm trong bundle** — đã kiểm chứng khoá thật trong `dist/assets/*.js`. Lấy được từ web hoặc từ file APK.
- **CORS không phải vấn đề** — server trả `Access-Control-Allow-Origin: *`.
- **Reverb `allowed_origins` đã là `['*']`** — không cần sửa.
- **Capacitor hiện là bản 8** (cần compileSdk 36), không phải 7 như thiết kế ban đầu giả định.
- `avdmanager` của bản cmdline-tools mới **bị lỗi** không đọc được system image — phải dùng CLI mới `android emulator create`.

---

## Vì sao chờ thanh toán mới triển khai

Phase 2 khác phase 1 ở chỗ nó **buộc AMD bỏ tiền và đứng tên trước**:

- **Chi phí không thu lại được:** 99 USD/năm Apple + 25 USD Google, trả bằng thẻ của AMD. Phí Google **không hoàn lại**.
- **Nghĩa vụ dài hạn:** tài khoản Apple phải gia hạn hàng năm hoặc app bị gỡ. Tài khoản Google dưới 1.000 lượt cài phải đăng nhập trong vòng 180 ngày để không bị đóng.
- **Tài khoản đứng tên cá nhân của AMD** (quyết định #5) nghĩa là AMD là nhà phát hành chịu trách nhiệm trước Apple/Google cho một hoạt động kinh doanh mà AMD không vận hành và chưa được trả tiền.
- **Tiêu uy tín cá nhân:** quy định 12 người thử nghiệm buộc AMD đi mời người thật cài app và giữ họ 14 ngày.

Thêm phạm vi khi hoá đơn cũ còn treo là tăng phơi nhiễm. Vị thế gọn và không gây căng thẳng: **phase 2 khởi động khi phase 1 tất toán.**

Riêng những việc vẫn nên làm dù chưa kick off, vì chúng giảm chi phí đang phát sinh:

- **Proxy Goong** (`02-proxy-goong.md`) — bản đồ là khoản chi hàng tháng lớn nhất, lớn hơn cả phí vận hành. AMD đang ứng trước khoản này.
- Lỗi session token — **đã làm và đã deploy**.

## Cần xem lại: quyết định #5

Lý do chọn tài khoản cá nhân là **để không phải chờ D-U-N-S của khách 30 ngày**. Nhưng nếu dự án chưa kick off thì áp lực thời gian đó không còn.

Khi khách thanh toán và dự án khởi động thật, nên cân nhắc lại đường doanh nghiệp: nó đặt nghĩa vụ và trách nhiệm lên khách, tài khoản Google doanh nghiệp **được miễn** quy định 12 người thử nghiệm, và tránh được việc AMD đứng tên phát hành app của khách. Thời gian xin D-U-N-S có thể chạy song song với 4 tuần lập trình.
