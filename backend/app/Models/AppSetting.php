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

    public static function get(string $key, ?string $default = null): ?string
    {
        return static::where('key', $key)->first()?->value ?? $default;
    }

    public static function set(string $key, ?string $value): void
    {
        static::updateOrCreate(['key' => $key], ['value' => $value]);
    }
}
