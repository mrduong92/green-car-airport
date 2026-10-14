# CR 2026-10-04 — Chương trình Affiliate (hoàn điểm & giới thiệu)

**Nguồn:** ghi chú viết tay của GreenCA (ảnh `cr-2.jpg`), xác nhận lại với khách ngày 04/10/2026.
**Phạm vi áp dụng:** **toàn bộ khách hàng** — không riêng Cộng tác viên (CTV). Ghi chú gốc có chữ "CTV" là khách viết nhầm; đã xác nhận lại.
**Báo giá:** `docs/Bao_gia_CR_Affiliate.md` / `.pdf`

---

## Yêu cầu gốc (chép lại từ ghi chú)

> Về App:
> 1. 5%/chuyến CK nhận lại ┐
> 2. CK 5%/F1 đi xe cho CTV ┘ → Ví điểm CTV
> 3. Voucher 1.000k (-10%/chuyến) khách mới
> 4. Voucher 100k CTV (khách đăng ký có luôn)
> 5. CTV xem được: tổng số F1 (theo tháng, tổng cộng); DS F1 (Σ số tiền, số chuyến đặt)
> 6. Quản trị viên xem được: CTV top 10, số F1 đăng ký, doanh số F1 theo tháng

**Diễn giải sau khi xác nhận** — đọc "CTV" là "khách hàng/người giới thiệu"; **F1** = khách đăng ký bằng mã/link giới thiệu của một khách khác (chỉ 1 tầng).

## Trạng thái từng mục

| # | Yêu cầu (đã diễn giải) | Trạng thái |
| --- | --- | --- |
| 1 | Mọi khách được hoàn **5% giá mỗi chuyến** thành điểm vào ví điểm của mình | Đã làm — nhánh feat/affiliate |
| 2 | Người giới thiệu nhận **5% giá mỗi chuyến của F1** vào ví điểm | Đã làm — nhánh feat/affiliate |
| 3 | Khách mới nhận voucher tổng 1.000k, mỗi chuyến giảm tối đa 10% | **Đã có trên production** — campaign "Ra mắt — tặng 1.000k khách mới": 20 × 50.000đ, hạn 90 ngày, tự cấp khi đăng ký; trần `VOUCHER_MAX_RATE = 0.10` |
| 4 | Người giới thiệu nhận voucher 100k ngay khi F1 đăng ký | **Đã có trên production** — `ReferralService::processCustomerReferral` gọi ngay lúc đăng ký, áp dụng mọi người giới thiệu (đúng phạm vi "toàn bộ khách") |
| 5 | Mọi khách xem được F1 của mình: tổng số F1 theo tháng và tổng cộng; danh sách F1 kèm tổng chi tiêu, số chuyến | Đã làm — nhánh feat/affiliate |
| 6 | Admin xem: top 10 người giới thiệu, số F1 đăng ký, doanh số F1 theo tháng | Đã làm — nhánh feat/affiliate |

## Quyết định đã chốt

- **Cách dùng điểm hoàn/hoa hồng:** **trừ thẳng điểm vào cuốc khi đặt xe, tối đa 10% giá chuyến** (khách xác nhận lại 04/10/2026, thay cho phương án đổi điểm lấy voucher). Không rút tiền mặt.
- **Phần trùng báo giá cũ:** hạng mục "Affiliate — link giới thiệu, theo dõi & tính hoa hồng, dashboard affiliate" (2.000.000đ, `docs/Bao_gia_cap_nhat.md`) chưa làm phần dashboard và hoa hồng % → báo giá mới nêu đủ giá kèm dòng ưu đãi -2.000.000đ.

## Quy tắc nghiệp vụ đề xuất (chờ GreenCA xác nhận)

1. 5% tính trên giá chuyến **sau voucher**, không gồm phụ phí phạt huỷ và phí thu hộ (cùng cơ sở với phí app 20%). Làm tròn xuống theo điểm (1 điểm = 1.000đ).
2. Chỉ cộng khi chuyến **hoàn thành**.
3. Nguồn chi trả: trừ vào phí app, tài xế không đổi. Chuyến của F1: app còn 10% (5% hoàn F1 + 5% cho người giới thiệu); khách không được giới thiệu: app còn 15%.
4. Hoa hồng F1 áp dụng trọn đời, chỉ 1 tầng (không F2).
5. Tỷ lệ % (hoàn, hoa hồng, trần trừ điểm) admin chỉnh được ở trang Cài đặt.
6. SĐT F1 hiển thị che bớt khi người giới thiệu xem danh sách.
7. Dùng điểm: giữ điểm khi đặt, hoàn lại khi huỷ. Dùng cùng voucher: voucher ≤ 10% giá, điểm ≤ 10% phần còn lại (tổng ~19%).
8. **Phần trừ bằng điểm do app chịu, tài xế vẫn nhận 80% giá sau voucher** (khác voucher hiện tại — voucher đang giảm cả thu nhập tài xế vì phí/thu nhập tính trên giá sau voucher). Cần cơ chế bù vào quyết toán phí tài xế (phí trừ khi nhận cuốc).

## Ghi chú kỹ thuật

- CTV hiện chỉ khác khách thường ở **Thu hộ** (`collection_fee`, ví điểm CTV, đặt nhiều chuyến cùng lúc). Điểm thu hộ của CTV giữ nguyên cơ chế; điểm affiliate cần tách loại giao dịch để phân biệt điểm đổi voucher với điểm rút được.
- Khách thường hiện **chưa có ví** — mục 1 phải tạo ví cho mọi khách.
- `docs/specs/affiliate-policy.md` đã lỗi thời (mô tả mã = SĐT, thưởng sau chuyến đầu) — cập nhật khi triển khai CR này.
- Lỗi voucher cá nhân dùng được bởi người khác (phát hiện khi rà CR) đã sửa ở PR #9, không tính vào CR.
