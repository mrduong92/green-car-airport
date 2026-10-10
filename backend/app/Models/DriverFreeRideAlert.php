<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DriverFreeRideAlert extends Model
{
    protected $guarded = [];

    protected $casts = [
        'enabled' => 'boolean',
        'seats' => 'integer',
        'last_pushed_at' => 'datetime',
        'last_pushed_max_id' => 'integer',
    ];

    // Các cột mà khi đổi (tạo mới / bật / đổi bộ lọc) thì mốc id phải nhảy tới cuốc mới nhất hiện có.
    private const FILTER_COLUMNS = ['enabled', 'direction', 'seats', 'keywords'];

    protected static function booted(): void
    {
        // Bật cảnh báo hoặc đổi bộ lọc → chỉ cuốc tạo SAU thời điểm này mới được push (không dội ngược
        // cuốc cũ đang hiển thị). Job NotifyFreeRideAlerts chỉ ghi last_pushed_at/last_pushed_max_id nên
        // không kích hoạt nhánh này.
        static::saving(function (self $alert) {
            if (! $alert->exists || $alert->isDirty(self::FILTER_COLUMNS)) {
                $alert->last_pushed_max_id = (int) (FreeRide::max('id') ?? 0);
            }
        });
    }
}
