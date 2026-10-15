# Cuốc Free: rủi ro pháp lý và rủi ro khi lên App Store / CH Play

*Tài liệu để trao đổi với chủ app GreenCA. Ngày 15/10/2026.*

> **Lưu ý:** đây là đánh giá rủi ro của đội phát triển, **không phải tư vấn pháp lý**. Trước khi phát hành chính thức, nên nhờ luật sư về bảo vệ dữ liệu cá nhân xem lại các điểm ở mục 2 và mục 5.

---

## 1. Tóm tắt

- Tab **Cuốc Free** lấy bài đăng cuốc xe trong các nhóm Zalo rồi hiển thị trên app. Tài xế bấm "Nhận cuốc" để liên hệ người đăng qua Zalo. Tài xế phải trả **300.000đ/năm** để mở khoá phần liên hệ.
- Tính năng có **rủi ro thật nhưng ở mức kiểm soát được**. Nhiều app trên thị trường (ví dụ Lịch Xe) làm tương tự và vẫn hoạt động.
- Có **3 điểm cần sửa trước khi lên store**:
  1. Thu 300k bằng mã QR chuyển khoản **ngay trong app** sẽ bị Apple/Google từ chối, vì họ bắt thanh toán qua cổng của họ.
  2. **Mọi thông tin khai với Apple/Google phải trung thực.** Khai sai có thể bị khoá vĩnh viễn tài khoản nhà phát triển của công ty.
  3. Cần **nội quy nhóm Zalo** và **chính sách bảo mật** ghi rõ việc bài đăng được hiển thị trên GreenCA.
- Làm đủ các mục ở phần 5 thì kịch bản xấu nhất chỉ là **bị yêu cầu gỡ bài hoặc gỡ tính năng**, không ảnh hưởng tới công ty hay tài khoản phát hành app.

---

## 2. Rủi ro pháp lý tại Việt Nam

### 2.1. Thông tin người đăng là dữ liệu cá nhân

Tên Zalo, trang cá nhân Zalo, số điện thoại trong bài và nội dung cuốc của một người cụ thể đều là **dữ liệu cá nhân** theo Luật Bảo vệ dữ liệu cá nhân 2025 (hiệu lực từ 01/01/2026) và Nghị định 13/2023.

Luật yêu cầu khi dùng dữ liệu của ai thì người đó phải **biết và đồng ý**. Người đăng bài trong nhóm chỉ chia sẻ cho thành viên nhóm. Nếu nhóm không có thông báo gì thì họ chưa đồng ý cho một app bên ngoài dùng lại bài của mình.

### 2.2. Khoản thu 300k/năm

Người ta xét **trả tiền thì nhận được gì**, không xét tên gọi. Hiện tại, trả 300k là để **xem được liên hệ** của người đăng, còn chưa trả thì liên hệ bị che. Cách này dễ bị hiểu là **bán quyền tiếp cận dữ liệu cá nhân**. Luật 2025 cấm mua bán dữ liệu cá nhân, mức phạt có thể tới 10 lần khoản thu từ vi phạm.

Nếu 300k là phí cho **tính năng**, ví dụ nhận thông báo cuốc tức thì, bộ lọc tuyến, ưu tiên, và liên hệ thì cho xem miễn phí, thì đó là **phí nền tảng** đúng nghĩa và rất khó bắt bẻ.

### 2.3. Điều khoản của Zalo

Hệ thống đọc tin trong nhóm bằng **công cụ không chính thức của Zalo**. Đây không phải hack, nhưng điều khoản của Zalo không cho phép. Hậu quả thực tế là **tài khoản Zalo dùng để lấy tin có thể bị khoá** bất cứ lúc nào, và tab Cuốc Free mất nguồn dữ liệu. Đây là rủi ro vận hành nhiều hơn rủi ro pháp lý.

### 2.4. Gửi dữ liệu ra nước ngoài

Nội dung bài đăng được gửi cho dịch vụ trí tuệ nhân tạo ở Mỹ (OpenAI hoặc Anthropic) để tự động đọc ra điểm đón, điểm đến, giờ và giá. Theo luật 2025, chuyển dữ liệu cá nhân ra nước ngoài cần **hồ sơ đánh giá tác động** nộp Bộ Công an. Phần này là thủ tục giấy tờ, nên nhờ luật sư.

### 2.5. Rủi ro đến từ đâu

Khả năng cơ quan nhà nước tự kiểm tra **không cao**. Kịch bản thường gặp hơn là **một người đăng bài phát hiện thông tin của mình nằm trên một app có thu phí**, rồi khiếu nại hoặc đăng lên mạng xã hội. Ngoài ra, **đối thủ có thể báo cáo nhau** với Apple/Google.

---

## 3. Rủi ro khi lên App Store / CH Play

### 3.1. Apple/Google có kiểm tra nguồn dữ liệu không?

**Lúc duyệt thì gần như không.** Người duyệt chỉ xem giao diện vài phút bằng tài khoản thử. Rủi ro thật đến **sau khi app đã lên store**: khi có người khiếu nại hoặc báo cáo, họ mới xem xét lại.

Apple có quy định (mục 5.1.2) cấm app tổng hợp thông tin cá nhân không do chính người dùng cung cấp, kể cả từ nguồn công khai. Đây là quy định cần lưu ý nhất.

### 3.2. Thu 300k bằng mã QR trong app: chắc chắn bị bắt lỗi

Apple và Google bắt **mọi khoản thu cho tính năng dùng trong app** phải đi qua cổng thanh toán của họ (In-App Purchase), phí 15–30%. Hiện mã QR chuyển khoản ngay trong app là vi phạm rõ ràng nhất và dễ bị phát hiện nhất.

Tiền **nạp điểm để trả phí cho cuốc xe thật** thì khác: đó là dịch vụ ngoài đời, vẫn được thu ngoài store, giống Grab thu chiết khấu tài xế.

Có hai cách thu 300k hợp lệ:

| | **Bán ngoài app** (đề xuất) | **Bán trong app** |
|---|---|---|
| Cách làm | Tài xế mua qua web hoặc qua admin trên Zalo, chuyển khoản, admin duyệt như hiện tại. App chỉ hiện "Gói đang còn hạn đến…" | Mua thẳng trong app qua Apple/Google |
| Phí | 0% | Mất 15% (còn khoảng 255k/300k) |
| Điều kiện | Trong app **không được** hiện giá, nút mua hay lời nhắc chuyển khoản | Phải tích hợp cổng thanh toán của store |

Với 300 nhóm Zalo trong tay, việc bán ngoài app không khó.

### 3.3. Điều nghiêm trọng nhất: bị coi là lừa người duyệt

Một app có tính năng chưa đúng quy định thường chỉ bị **từ chối, gỡ tính năng hoặc gỡ app**, sửa xong nộp lại là được. Nhưng nếu có bằng chứng **cố ý lừa người duyệt**, Apple/Google sẽ **khoá vĩnh viễn tài khoản nhà phát triển**. Tài khoản này gắn với mã D-U-N-S của công ty, rất khó lập lại.

**Những việc KHÔNG nên làm:**
- Ẩn tab Cuốc Free lúc chờ duyệt rồi **tự bật lại từ máy chủ** sau khi được duyệt.
- Làm một nút "Đăng chuyến" **chỉ để làm cảnh**, trong khi thực chất cuốc vẫn lấy từ Zalo. Nếu nút này là tính năng thật, người dùng đăng được và cuốc hiện ra thật, thì hoàn toàn được.
- Khai với Apple/Google hoặc ghi trong chính sách bảo mật rằng **"admin nhập cuốc thủ công"** khi thực tế là tự động. Lời khai này dễ bị lật: hàng nghìn cuốc mỗi ngày, mỗi cuốc lên app vài giây sau khi đăng, và dữ liệu trong hệ thống cho thấy rõ nguồn.

**Những việc làm được:**
- Ẩn tên người đăng, tên nhóm, nhãn "Zalo" trên giao diện. Đây là việc tốt vì giảm lộ thông tin.
- Chính sách bảo mật chỉ cần ghi **nguồn** ("tổng hợp từ các nhóm Zalo GreenCA quản lý hoặc tham gia"), **không cần** nói cách kỹ thuật lấy dữ liệu.
- Nếu tab Cuốc Free bị ẩn ở bản đầu, sau này **mở lại bằng một bản cập nhật nộp duyệt bình thường**. Cách này không bị khoá.

---

## 4. Trả lời một số lập luận

**"300k là phí nền tảng, không phải phí mua bán dữ liệu."**
Đúng, *nếu* 300k trả cho tính năng chứ không phải để mở khoá liên hệ. Xem mục 2.2.

**"Tôi chỉ là thành viên nhóm. Thấy cuốc thì tôi cũng có thể share cho người quen."**
Luật phân biệt **cá nhân chia sẻ lẻ tẻ** với **doanh nghiệp thu thập có hệ thống, lưu trữ, phân phối cho người lạ và có thu tiền**. Cùng một hành động, nhưng khi tự động, ở quy mô 300 nhóm và gắn với doanh thu, thì thành hoạt động xử lý dữ liệu của doanh nghiệp.

**"Giống baomoi.com tổng hợp tin từ nhiều báo."**
Có hai khác biệt. Các báo **chủ động mở nguồn tin** để trang khác lấy về và có thoả thuận với baomoi, còn nhóm Zalo thì không. Ngoài ra, bài báo là nội dung của tổ chức, còn bài đăng cuốc có **thông tin liên hệ của cá nhân**.

**"App Lịch Xe làm vậy vẫn lên được cả iOS và Android."**
Lên được store chỉ có nghĩa là **chưa bị phát hiện hoặc chưa bị khiếu nại**, không có nghĩa là đúng quy định. Lịch Xe còn có nút Đăng chuyến thật, nên app trông như một bảng tin cộng đồng.

---

## 5. Phương án giảm rủi ro (đề xuất)

### 5.1. Nội quy nhóm Zalo: quan trọng nhất

Nội quy biến chuyện "người đăng không biết" thành "người đăng đã được thông báo khi vào nhóm". Muốn có tác dụng:
- Ghi rõ tên **GreenCA**, những gì được hiển thị, và cách yêu cầu gỡ bài.
- **Ghim** trong nhóm, và **thông báo một lần** cho thành viên cũ.
- Chỉ áp dụng được cho **nhóm GreenCA là trưởng nhóm**. Với nhóm GreenCA chỉ là thành viên, cần xin trưởng nhóm đồng ý, hoặc ngừng lấy cuốc từ nhóm đó.

Mẫu nội quy:

> 📌 Bài đăng cuốc xe trong nhóm sẽ được hiển thị trên ứng dụng **GreenCA** (greenca.vn), gồm nội dung cuốc và tên/link Zalo của người đăng, để tài xế liên hệ nhận cuốc. Không muốn bài của mình hiển thị trên GreenCA? Nhắn [Zalo/hotline] để được gỡ trong 72 giờ.

### 5.2. Chính sách bảo mật

Đội phát triển đã soạn bản chi tiết, ghi đúng nguồn dữ liệu và có kênh gỡ bài. Chủ app cần cung cấp: **tên công ty đầy đủ, mã số thuế, địa chỉ, email liên hệ, ngày hiệu lực**.

### 5.3. Kênh gỡ bài

Người đăng nhắn Zalo hoặc hotline, admin chặn người đăng đó trong trang quản trị. Cam kết xử lý trong 72 giờ.

### 5.4. Đổi cách thu 300k

Cho xem liên hệ miễn phí và thu 300k cho **gói tính năng**, ví dụ "Tài xế Pro": thông báo cuốc tức thì kèm âm báo riêng, lọc theo tuyến, tài xế thường thấy cuốc chậm hơn 5–10 phút. Bán **ngoài app** như mục 3.2.

### 5.5. Hướng mới đang cân nhắc: GreenCA trả lời trong nhóm thay cho tài xế

Tài xế bấm "Nhận cuốc" thì app **không đưa liên hệ của người đăng** cho tài xế. Thay vào đó, GreenCA tự trả lời bài đăng trong nhóm: *"@Người đăng: có tài xế GreenCA nhận cuốc này: Anh A, 09xx…"*. Người đăng tự liên hệ lại với tài xế.

- **Được:** thông tin người đăng không ra khỏi nhóm, nên giảm mạnh rủi ro pháp lý và rủi ro với store. Thông tin được chia sẻ là của tài xế, và tài xế tự đồng ý khi bấm nút. Khoản 300k thành phí dịch vụ kết nối đúng nghĩa.
- **Mất:**
  - Gửi tin tự động hàng loạt **dễ khiến tài khoản Zalo bị khoá** hơn nhiều so với chỉ đọc tin.
  - Nhóm có thể bị loãng vì tin trả lời.
  - Tài xế nhận cuốc **chậm hơn** so với nhắn thẳng cho người đăng.
- **Đề xuất:** thử trên 3–5 nhóm GreenCA là trưởng nhóm trong 1–2 tuần, xem tài khoản có bị Zalo cảnh báo không, người đăng có liên hệ lại không, nhóm phản ứng thế nào.

---

## 6. Các câu hỏi cần chủ app chốt

1. **Nội quy nhóm:** đồng ý thêm nội quy (mục 5.1) vào các nhóm GreenCA là trưởng nhóm không? Với các nhóm GreenCA chỉ là thành viên thì: xin trưởng nhóm đồng ý, hay ngừng lấy cuốc?
2. **Khoản 300k:** giữ là phí mở khoá liên hệ, hay đổi thành gói tính năng (mục 5.4)?
3. **Cách thu 300k:** bán ngoài app (0% phí), hay trong app qua Apple/Google (mất 15%)?
4. **Hướng "GreenCA trả lời trong nhóm"** (mục 5.5): có muốn thử nghiệm không?
5. **Thông tin công ty** cho chính sách bảo mật: tên đầy đủ, mã số thuế, địa chỉ, email, ngày hiệu lực.
6. **Luật sư:** có muốn nhờ luật sư xem lại phần dữ liệu cá nhân và hồ sơ chuyển dữ liệu ra nước ngoài (mục 2.4) không?
7. Chủ app **đã nắm và chấp nhận** rủi ro còn lại sau khi làm đủ các mục trên: có thể bị yêu cầu gỡ bài, gỡ tính năng, hoặc tài khoản Zalo bị khoá.
