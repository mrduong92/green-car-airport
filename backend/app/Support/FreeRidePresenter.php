<?php

namespace App\Support;

use App\Models\AppSetting;
use App\Models\FreeRide;

/**
 * JSON một cuốc tab Free — dùng chung cho danh sách (FreeRideController) và đăng/quản lý cuốc
 * (RidePostController). Khoá liên hệ nằm ở đây (server), không phải ở app.
 */
class FreeRidePresenter
{
    /** @return array{sender_name: bool, group_name: bool, raw_text: bool} */
    public static function showSettings(): array
    {
        return [
            'sender_name' => AppSetting::freeShow(AppSetting::FREE_SHOW_SENDER_NAME),
            'group_name' => AppSetting::freeShow(AppSetting::FREE_SHOW_GROUP_NAME),
            'raw_text' => AppSetting::freeShow(AppSetting::FREE_SHOW_RAW_TEXT),
        ];
    }

    public static function present(FreeRide $r, bool $unlocked, array $show, int $viewerId): array
    {
        $base = [
            'ride_uid' => $r->ride_uid,
            'sender_uid' => $r->sender_uid,
            'direction' => $r->direction,
            'pickup' => $r->pickup,
            'destination' => $r->destination,
            'pickup_at' => $r->pickup_at?->getTimestampMs(),
            'pickup_time_text' => $r->pickup_time_text,
            'seats' => $r->seats,
            'vehicle_note' => $r->vehicle_note,
            'price' => $r->price,
            'is_free' => $r->is_free,
            'is_raw' => $r->is_raw,
            'posted_at' => $r->posted_at->getTimestampMs(),
            'expires_at' => $r->expires_at->getTimestampMs(),
            'closed_at' => $r->closed_at?->getTimestampMs(),
        ];

        if ($r->posted_by_user_id !== null) {
            $mine = $r->posted_by_user_id === $viewerId;

            return $base + [
                'source' => 'driver',
                'is_mine' => $mine,
                // Tên tài khoản người đăng — cài đặt free_show_sender_name chỉ áp cho tên Zalo.
                'sender_name' => $r->sender_name,
                'group_name' => null,
                // Đã che SĐT lúc lưu (RidePostController::store) — tin nguyên văn chính là nội dung cuốc.
                'raw_text' => $r->raw_text,
                'group_count' => 1,
                'qr_code' => null,
                'contact_url' => null,
                'contact' => $unlocked && ! $mine && $r->poster
                    ? ['phone' => $r->poster->phone, 'zalo' => $r->contact_zalo]
                    : null,
            ];
        }

        return $base + [
            'source' => 'zalo',
            'is_mine' => false,
            // Admin tắt từng mục (Cài đặt): tên người bắn / nhóm / tin gốc bị tắt thì không rời server.
            'sender_name' => $show['sender_name'] ? $r->sender_name : null,
            'group_name' => $show['group_name'] ? $r->group_name : null,
            // Cuốc nguyên văn (is_raw) thì tin gốc chính là nội dung cuốc nên vẫn phải gửi.
            'raw_text' => $show['raw_text'] || $r->is_raw ? ($unlocked ? $r->raw_text : FreeRide::maskPhones($r->raw_text)) : null,
            'group_count' => $r->displayedGroupCount(),
            // Tài xế chưa mở khóa không nhận mã hồ sơ lẫn link — khóa ở server, không chỉ ẩn nút.
            'qr_code' => $unlocked ? $r->qr_code : null,
            'contact_url' => $unlocked ? "zalo://qr/p/{$r->qr_code}" : null,
            'contact' => null,
        ];
    }
}
