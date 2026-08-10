<?php

namespace Database\Seeders;

use App\Models\Campaign;
use App\Support\CampaignTrigger;
use Illuminate\Database\Seeder;

class CampaignSeeder extends Seeder
{
    public function run(): void
    {
        Campaign::create([
            'name'         => 'Ra mắt — tặng 200k khách mới',
            'trigger'      => CampaignTrigger::CUSTOMER_REGISTERED,
            'reward'       => ['voucher_count' => 4, 'voucher_value' => 50000, 'voucher_expires_days' => 90],
            'starts_at'    => null,
            'ends_at'      => null,
            'max_grants'   => 1000,
            'grants_count' => 0,
            'is_active'    => true,
        ]);
    }
}
