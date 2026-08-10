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

    public const ALL = [self::CUSTOMER_REGISTERED];
}
