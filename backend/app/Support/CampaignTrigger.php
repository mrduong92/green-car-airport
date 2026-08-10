<?php

namespace App\Support;

/**
 * Danh sách event có thể kích hoạt một campaign — NGUỒN DUY NHẤT.
 *
 * `campaigns.trigger` là cột `string`, KHÔNG phải `enum` MySQL, có chủ ý: thêm giá trị
 * vào cột `enum` phải ALTER TABLE trên bảng đang chạy; dùng `string` + validate bằng
 * hằng số PHP thì thêm loại event mới chỉ là sửa code (thêm 1 const + 1 nhánh trong
 * CampaignService), không đụng schema. Xem
 * docs/superpowers/specs/2026-08-10-campaign-voucher-design.md.
 */
class CampaignTrigger
{
    public const CUSTOMER_REGISTERED = 'customer_registered';
    // Khách đăng nhập trong khoảng starts_at/ends_at của campaign được nhận — dùng cho
    // các chương trình theo dịp (Tết, ...). Không tự kích hoạt gì khác ngoài đăng nhập.
    public const CUSTOMER_LOGGED_IN = 'customer_logged_in';

    public const ALL = [self::CUSTOMER_REGISTERED, self::CUSTOMER_LOGGED_IN];
}
