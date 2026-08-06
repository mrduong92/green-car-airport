<?php

namespace Tests\Feature;

use App\Services\Zns\ZnsSender;
use Tests\TestCase;

class CheckZnsBalanceCommandTest extends TestCase
{
    public function test_exits_0_when_balance_above_threshold(): void
    {
        $this->mock(ZnsSender::class)->shouldReceive('getBalance')->once()->andReturn(500_000);

        $this->artisan('zns:balance --min=100000')
            ->expectsOutput('500000')
            ->assertExitCode(0);
    }

    public function test_exits_1_when_balance_below_threshold(): void
    {
        $this->mock(ZnsSender::class)->shouldReceive('getBalance')->once()->andReturn(24_890);

        $this->artisan('zns:balance --min=100000')
            ->expectsOutput('24890')
            ->assertExitCode(1);
    }

    /**
     * Không tra được PHẢI khác "hết tiền" — nếu gộp làm một, lần IP bị chặn
     * sẽ bị báo là hết tiền và người ta đi nạp tiền oan.
     */
    public function test_exits_2_when_balance_cannot_be_read(): void
    {
        $this->mock(ZnsSender::class)->shouldReceive('getBalance')->once()->andReturn(null);

        $this->artisan('zns:balance --min=100000')
            ->expectsOutput('null')
            ->assertExitCode(2);
    }
}
