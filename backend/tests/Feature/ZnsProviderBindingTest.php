<?php

namespace Tests\Feature;

use App\Services\SouthTelecomZnsService;
use App\Services\ZaloZnsService;
use App\Services\Zns\ZnsSender;
use Tests\TestCase;

class ZnsProviderBindingTest extends TestCase
{
    public function test_southtelecom_provider_is_resolved_by_default(): void
    {
        config(['services.zns.provider' => 'southtelecom']);
        $sender = app(ZnsSender::class);
        $this->assertInstanceOf(SouthTelecomZnsService::class, $sender);
    }

    public function test_zalo_provider_is_resolved_when_configured(): void
    {
        config(['services.zns.provider' => 'zalo']);
        $sender = app(ZnsSender::class);
        $this->assertInstanceOf(ZaloZnsService::class, $sender);
    }
}
