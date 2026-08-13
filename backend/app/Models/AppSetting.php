<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AppSetting extends Model
{
    public const CONTACT_HOTLINE = 'contact_hotline';

    public const CONTACT_EMAIL = 'contact_email';

    public const CONTACT_ZALO_PHONE = 'contact_zalo_phone';

    protected $fillable = ['key', 'value'];

    public static function get(string $key, ?string $default = null): ?string
    {
        return static::where('key', $key)->first()?->value ?? $default;
    }

    public static function set(string $key, ?string $value): void
    {
        static::updateOrCreate(['key' => $key], ['value' => $value]);
    }
}
