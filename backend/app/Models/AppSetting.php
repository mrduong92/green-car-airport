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

    public const APP_VERSION_PLATFORMS = ['android'];

    public const APP_VERSION_APPS = ['customer', 'driver'];

    public const FREE_UNLOCK_FEE_VND = 'free_unlock_fee_vnd';

    protected $fillable = ['key', 'value'];

    /** vd appVersionKey('android', 'driver', 'min') → 'app_version_android_driver_min' */
    public static function appVersionKey(string $platform, string $app, string $kind): string
    {
        return "app_version_{$platform}_{$app}_{$kind}";
    }

    public static function appVersion(string $platform, string $app, string $kind): string
    {
        return static::get(static::appVersionKey($platform, $app, $kind), config('app_versions.default'));
    }

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

    public static function get(string $key, ?string $default = null): ?string
    {
        return static::where('key', $key)->first()?->value ?? $default;
    }

    public static function set(string $key, ?string $value): void
    {
        static::updateOrCreate(['key' => $key], ['value' => $value]);
    }
}
