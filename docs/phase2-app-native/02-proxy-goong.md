# Proxy Goong qua backend — Design Spec

**Date:** 2026-08-09
**Scope:** Chuyển 4 lệnh gọi REST tới Goong từ client sang gọi qua backend Laravel. Server giữ khoá API, thêm cache, giới hạn tần suất và đo lường. Khoá bản đồ (tile) giữ nguyên ở client.

---

## Vấn đề

`frontend/src/api/goong.ts` gọi thẳng `https://rsapi.goong.io` với `api_key` nhúng trong URL, lấy từ `VITE_GOONG_API_KEY`. Biến `VITE_*` được nướng vào bundle lúc build — đã kiểm chứng: khoá thật xuất hiện trong `frontend/dist/assets/*.js`.

Bốn hệ quả:

1. **Ai cũng lấy được khoá.** Xem mã nguồn trang web, hoặc giải nén file APK/IPA khi lên app native. Họ gọi, dự án trả tiền.
2. **Không cache được gì.** Mỗi lượt tra cứu là một lượt tính tiền, kể cả khi trùng hệt lượt trước.
3. **Không đo được.** Không tách được số lượt theo loại lệnh, nên không thể cam kết mức giảm chi phí cụ thể với khách hàng.
4. **Không giới hạn được tần suất.** Khoá bị lạm dụng thì chỉ có trần quota của Goong chặn lại.

Mức độ quan trọng: dịch vụ bản đồ là **khoản chi hàng tháng lớn nhất** (1.500.000–3.000.000đ, lớn hơn cả phí vận hành hệ thống 2.500.000đ). Và app native làm vấn đề nặng thêm — lấy khoá từ file APK còn dễ hơn xem mã nguồn web.

## Mục tiêu

- Khoá REST của Goong **không rời khỏi server**.
- Cache các kết quả bất biến, tận dụng đặc thù đưa đón sân bay: tập địa điểm lặp lại rất cao (sân bay, khách sạn, quận trung tâm).
- Giới hạn tần suất theo người dùng.
- **Đo được số lượt theo từng loại lệnh** — đây là điều kiện để cam kết mức giảm chi phí với khách hàng.
- Trải nghiệm người dùng không đổi; độ trễ tăng thêm không đáng kể.

## Ngoài phạm vi

- **Khoá bản đồ `VITE_GOONG_MAP_KEY`.** `goong-js` vẽ tile ngay trong trình duyệt nên bắt buộc phải có khoá ở client — không proxy được theo cách có ý nghĩa. Xử lý riêng: tách khoá theo kênh (web / Android / iOS), giới hạn theo tên miền nếu Goong hỗ trợ, và giảm số lần dựng bản đồ.
- **Thay bản đồ tương tác bằng ảnh tĩnh** ở màn xem lại chuyến đã hoàn tất — là hướng giảm chi phí riêng, không thuộc spec này.
- **Đổi nhà cung cấp bản đồ.**
- **Cache phía client.** Nếu sau này cần thì thêm ở tầng TanStack Query, không thuộc spec này.

---

## 1. Bốn endpoint

Ánh xạ một-một với 4 hàm hiện có trong `api/goong.ts`. Đặt trong nhóm `auth:sanctum` của `routes/api.php`.

| Hàm client hiện tại | Endpoint mới | Tham số |
|---|---|---|
| `goongAutocomplete` | `GET /api/places/autocomplete` | `input`, `sessiontoken` |
| `goongPlaceDetail` | `GET /api/places/detail` | `place_id`, `sessiontoken` |
| `goongReverseGeocode` | `GET /api/places/reverse-geocode` | `lat`, `lng` |
| `goongDistanceMatrix` | `GET /api/places/distance` | `origin_lat`, `origin_lng`, `dest_lat`, `dest_lng` |

Controller: `app/Http/Controllers/PlacesController.php` (nhóm dùng chung, không thuộc `Customer/` vì sau này app tài xế cũng có thể cần).

Gọi Goong qua một service riêng `app/Services/GoongClient.php` — controller không tự dựng URL. Tách ra để phần cache, đo lường và xử lý lỗi nằm một chỗ, và để test thay được bằng giả lập.

**Đặt sau `auth:sanctum` là bắt buộc.** Để công khai thì chỉ là dời cái cửa mở từ Goong sang server mình, còn tệ hơn vì giờ chính dự án trả cả tiền băng thông. Màn đặt xe (`BookingFormPage`) vốn đã nằm sau `RequireRole role="customer"` nên không vướng gì.

**Dùng `GET` cho cả bốn.** Tham số tra cứu sẽ nằm trong log truy cập của nginx, nhưng địa chỉ đón/đến vốn đã được lưu thẳng vào bảng `bookings` — không phát sinh loại dữ liệu mới cần bảo vệ. Đổi lại được sự đơn giản và khả năng thêm cache ở tầng HTTP về sau.

## 2. Cache

Dùng Redis qua `Cache` facade, giống phần còn lại của dự án.

| Lệnh | Cache? | Khoá | TTL | Lý do |
|---|---|---|---|---|
| Place Detail | **Có** | `place_id` | 30 ngày | Toạ độ và địa chỉ của một `place_id` không đổi |
| Reverse geocode | **Có** | toạ độ làm tròn 4 chữ số thập phân | 7 ngày | 4 chữ số ≈ 11m, đủ mịn mà vẫn trúng cache cao |
| Distance Matrix | **Có** | cặp toạ độ làm tròn 4 chữ số | 7 ngày | Quãng đường đường bộ giữa hai điểm rất ít đổi |
| Autocomplete | **Không** | — | — | Phụ thuộc chuỗi gõ dở và session token; cache vào sẽ trả kết quả của phiên khác |

Không dùng cơ chế version key như `AvailableTripsCache` — dữ liệu ở đây bất biến theo khoá nên TTL là đủ, không có tình huống phải xoá hàng loạt.

**Vì sao cache đáng giá ở đây:** mô hình đưa đón sân bay có tập điểm đến cực kỳ tập trung — Tân Sơn Nhất, Nội Bài, một nhóm khách sạn và quận trung tâm. `place_id` của sân bay sẽ được tra đi tra lại hàng nghìn lần mỗi tháng, và hiện mỗi lần là một lần trả tiền.

## 3. Session token phải chuyển nguyên vẹn

Goong gom các lượt gõ phím autocomplete và lượt Place Detail **có cùng `sessiontoken`** thành một phiên tính tiền. Proxy phải chuyển tham số này lên nguyên vẹn, **tuyệt đối không tự sinh mới**.

Đây đúng là lỗi vừa được sửa ở commit `fd8402b`: `AddressInput` từng gọi `goongPlaceDetail(placeId, crypto.randomUUID())`, làm phiên autocomplete và lượt Place Detail bị tính thành hai khoản. Proxy mà tái phạm thì khoản tiết kiệm đó mất trắng.

Validate `sessiontoken` khớp định dạng UUID trước khi ghép vào URL gửi lên Goong — chặn việc chèn tham số lạ vào request đi ra.

## 4. Giới hạn tần suất

Dự án **hiện chưa dùng `throttle` ở bất kỳ route nào**, nên đây là chỗ đầu tiên. Dùng middleware `throttle` chuẩn của Laravel, tính theo người dùng đã đăng nhập:

| Endpoint | Hạn mức |
|---|---|
| autocomplete | 60 lượt/phút |
| các endpoint còn lại | 30 lượt/phút |

Autocomplete được nới rộng hơn vì người dùng gõ liên tục — dù đã có debounce 300ms ở client, một địa chỉ dài vẫn sinh hơn chục lượt. Mức 60 đủ thoáng cho người dùng thật và vẫn chặn được kịch bản lạm dụng.

Vượt hạn mức trả **429** kèm thông báo tiếng Việt. Client phải **hỏng mềm**: autocomplete trả danh sách rỗng thay vì ném lỗi làm vỡ màn hình.

## 5. Đo lường

Bảng `goong_api_calls`, chỉ ghi đúng phần cần cho đối soát:

| Cột | Ghi chú |
|---|---|
| `type` | `autocomplete` / `detail` / `reverse_geocode` / `distance` |
| `cached` | boolean — phân biệt lượt trúng cache và lượt thật sự gọi Goong |
| `user_id` | nullable, để truy khi có lạm dụng |
| `created_at` | |

**Không ghi nội dung tra cứu.** Không cần cho việc đối soát, và tránh tạo thêm một nơi lưu dữ liệu vị trí cá nhân phải bảo vệ theo Nghị định 13/2023.

Job dọn bản ghi cũ hơn 90 ngày.

Bảng này trả lời được đúng câu hỏi đang cần: mỗi tháng gọi bao nhiêu lượt theo từng loại, tỉ lệ trúng cache bao nhiêu, và mức giảm sau khi triển khai là bao nhiêu — cơ sở để cam kết con số với khách hàng thay vì hứa suông.

## 6. Xử lý lỗi

- **Timeout gọi Goong:** 5 giây cho autocomplete (nhạy độ trễ), 10 giây cho Distance Matrix.
- **Goong lỗi hoặc timeout** → trả **502** kèm thông báo tiếng Việt, **không để thành 500**. Lỗi của nhà cung cấp bên ngoài không được hiện ra như lỗi hệ thống.
- **Thiếu khoá trong cấu hình** → ghi log cảnh báo, trả **503**. Không được im lặng trả kết quả rỗng, vì như vậy trông giống "không tìm thấy địa chỉ" và rất khó truy.
- **Client hỏng mềm ở mọi trường hợp**: autocomplete trả rỗng, reverse geocode trả lại chuỗi toạ độ như hành vi hiện tại (`api/goong.ts:29`). Riêng Distance Matrix thất bại thì vẫn phải báo lỗi rõ cho người dùng vì nó quyết định giá cuốc.

## 7. Thay đổi phía client

`frontend/src/api/goong.ts` viết lại: bỏ `fetch` thẳng, chuyển sang dùng instance `api` trong `src/api/axios.ts`.

Đổi như vậy được thêm hai thứ miễn phí:

- Tự động đính Bearer token và xử lý 401 theo interceptor sẵn có.
- **Tự động chạy đúng trong app native**, vì instance `api` đã dùng `API_BASE` (xem spec app native mục 2.1). Nếu giữ `fetch` với URL tương đối thì app native lại hỏng thêm một chỗ nữa.

Chữ ký bốn hàm giữ nguyên → `AddressInput`, `useGoongAutocomplete` và `BookingFormPage` **không phải sửa gì**.

Gỡ `VITE_GOONG_API_KEY` khỏi `frontend/.env` và `.env.example`; giữ `VITE_GOONG_MAP_KEY`. Thêm `GOONG_API_KEY` vào `backend/.env`.

**Lưu ý deploy:** script `deploy/monitoring/greenca-quota-check.sh` đang tìm khoá theo thứ tự `GOONG_API_KEY` → `frontend/.env`. Sau thay đổi này thì nhánh đầu tiên là nhánh đúng, cần cập nhật ghi chú trong script cho khớp.

## 8. Xoay khoá

Khoá REST hiện tại đã nằm trong các bundle phát hành công khai một thời gian dài, phải coi như đã lộ:

1. Triển khai proxy, xác nhận chạy ổn trên production.
2. Cấp khoá REST **mới** trong Goong console, chỉ đặt trong `backend/.env`.
3. Huỷ khoá cũ.
4. Tách khoá bản đồ riêng cho web / Android / iOS.

Không đảo thứ tự — huỷ khoá cũ trước khi proxy chạy ổn sẽ làm chết chức năng tìm địa chỉ trên bản web đang phục vụ khách.

---

## 9. Kiểm thử

**Pest:**

- Bốn endpoint đều trả 401 khi chưa đăng nhập.
- Lượt gọi thứ hai cùng `place_id` **không** gọi lên Goong (dùng client giả lập, đếm số lần gọi).
- `sessiontoken` được chuyển lên Goong nguyên vẹn, không bị sinh mới.
- `sessiontoken` sai định dạng bị từ chối.
- Goong trả lỗi → endpoint trả 502, không phải 500.
- Thiếu khoá → 503 kèm log cảnh báo.
- Vượt hạn mức → 429.
- Bảng `goong_api_calls` ghi đúng `type` và `cached`, và **không** chứa nội dung tra cứu.

**Playwright:** luồng đặt xe hiện có vẫn chạy — gõ địa chỉ, chọn gợi ý, tính được quãng đường và giá.

**Thủ công sau khi lên production:** đối chiếu số lượt gọi trong Goong console trước và sau, cùng tỉ lệ trúng cache trong bảng đo, để có số liệu thật báo cho khách hàng.

## 10. Rủi ro

| Rủi ro | Mức | Xử lý |
|---|---|---|
| Độ trễ autocomplete tăng do thêm một chặng | Trung bình | Đo thực tế; kỳ vọng thêm 20–50ms khi server cùng khu vực. Nếu vượt 150ms thì xem lại. Phần trúng cache sẽ nhanh hơn hiện tại |
| Cache trả địa chỉ sai | Thấp | Chỉ cache theo khoá bất biến (`place_id`, toạ độ làm tròn). Tuyệt đối không cache autocomplete |
| Huỷ khoá cũ trước khi proxy ổn định | Cao nếu xảy ra | Thứ tự bắt buộc ở mục 8; đưa vào danh sách kiểm khi deploy |
| Proxy thành điểm chết đơn lẻ | Thấp | Nó cùng số phận với API — API chết thì đằng nào cũng không đặt được xe. Không phát sinh rủi ro mới |
| Hạn mức tần suất chặn nhầm người dùng thật | Thấp | Mức 60/phút cao hơn nhiều so với hành vi gõ thật; theo dõi số lượt 429 trong tháng đầu |

## 11. Ước lượng

Khoảng **1–1,5 ngày**: controller và service khoảng nửa ngày, cache và đo lường khoảng nửa ngày, viết lại phía client và test khoảng nửa ngày.

Nên làm **trước khi phát hành app native**, vì sau khi proxy xong thì app không cần khoá REST nữa — chỉ còn khoá bản đồ, giảm hẳn một nửa bề mặt phơi nhiễm ngay từ bản phát hành đầu tiên.
