<?php

namespace Database\Seeders;

use App\Models\AppSetting;
use Illuminate\Database\Seeder;

class AppSettingSeeder extends Seeder
{
    public function run(): void
    {
        $defaults = [
            AppSetting::CONTACT_HOTLINE => '1800 6789',
            AppSetting::CONTACT_EMAIL => 'support@greenca.vn',
            AppSetting::CONTACT_ZALO_PHONE => '0931919786',
        ];

        foreach ($defaults as $key => $value) {
            AppSetting::updateOrCreate(['key' => $key], ['value' => $value]);
        }
    }
}
