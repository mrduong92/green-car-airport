<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AppSetting extends Model
{
    public const CONTACT_HOTLINE = 'contact_hotline';

    public const CONTACT_EMAIL = 'contact_email';

    public const CONTACT_ZALO_PHONE = 'contact_zalo_phone';

    public const APP_FEE_PERCENT = 'app_fee_percent';

    public const REFERRAL_VOUCHER_VALUE = 'referral_voucher_value';

    public const REFERRAL_DRIVER_POINTS = 'referral_driver_points';

    public const FREE_UNLOCK_FEE_VND = 'free_unlock_fee_vnd';

    public const FREE_SHOW_SENDER_INFO = 'free_show_sender_info';

    protected $fillable = ['key', 'value'];

    /** Phí app dạng hệ số (vd 0.2), admin chỉnh được. */
    public static function appFeeRate(): float
    {
        return static::appFeePercent() / 100;
    }

    public static function appFeePercent(): float
    {
        return (float) static::get(self::APP_FEE_PERCENT, (string) config('business.app_fee_percent'));
    }

    public static function referralVoucherValue(): int
    {
        return (int) static::get(self::REFERRAL_VOUCHER_VALUE, (string) config('business.referral_voucher_value'));
    }

    public static function referralDriverPoints(): int
    {
        return (int) static::get(self::REFERRAL_DRIVER_POINTS, (string) config('business.referral_driver_points'));
    }

    /** Phí mở khóa Nhận cuốc tab Free (1 năm), VND. 0 = QR không điền sẵn số tiền. */
    public static function freeUnlockFeeVnd(): int
    {
        return (int) static::get(self::FREE_UNLOCK_FEE_VND, (string) config('business.free_unlock_fee_vnd'));
    }

    /** Tab Free có hiện tên người bắn, tên nhóm và tin gốc cho tài xế không (lo ngại lộ thông tin cá nhân). */
    public static function freeShowSenderInfo(): bool
    {
        return filter_var(
            static::get(self::FREE_SHOW_SENDER_INFO, config('business.free_show_sender_info') ? '1' : '0'),
            FILTER_VALIDATE_BOOLEAN,
        );
    }

    public static function get(string $key, ?string $default = null): ?string
    {
        return static::where('key', $key)->first()?->value ?? $default;
    }

    public static function set(string $key, ?string $value): void
    {
        static::updateOrCreate(['key' => $key], ['value' => $value]);
    }
}
