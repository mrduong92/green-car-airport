<?php

namespace Tests\Feature;

use App\Models\Campaign;
use App\Models\User;
use App\Services\CampaignService;
use App\Support\CampaignTrigger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * CampaignService::grant() dùng UNIQUE(campaign_id, phone) + UPDATE ... WHERE
 * grants_count < max_grants nguyên tử — hành vi DB thật, sqlite in-memory (mặc định
 * của suite, xem phpunit.xml) không đủ để test chuẩn. Đây đúng lỗ hổng đã làm lọt bug
 * 500 trang Doanh thu (xem docs/BACKLOG.md P2, và AdminRevenueTest).
 *
 * Chạy bộ test này bằng MySQL:
 *   docker compose exec mysql mysql -u laravel -psecret -e "CREATE DATABASE IF NOT EXISTS green_car_airport_test"
 *   docker compose run --rm --no-deps -e DB_CONNECTION=mysql -e DB_HOST=mysql \
 *     -e DB_DATABASE=green_car_airport_test app php artisan test --filter=CampaignServiceTest
 */
class CampaignServiceTest extends TestCase
{
    use RefreshDatabase;

    private CampaignService $service;

    protected function setUp(): void
    {
        parent::setUp();

        if (\DB::connection()->getDriverName() !== 'mysql') {
            $this->markTestSkipped('Cần MySQL cho UNIQUE + UPDATE nguyên tử — xem docblock class.');
        }

        $this->service = app(CampaignService::class);
    }

    private function customer(array $overrides = []): User
    {
        return User::factory()->create(array_merge(['role' => 'customer'], $overrides));
    }

    private function campaign(array $overrides = []): Campaign
    {
        return Campaign::create(array_merge([
            'name'         => 'Test campaign',
            'trigger'      => CampaignTrigger::CUSTOMER_REGISTERED,
            'reward'       => ['voucher_count' => 4, 'voucher_value' => 50000, 'voucher_expires_days' => 90],
            'starts_at'    => null,
            'ends_at'      => null,
            'max_grants'   => null,
            'grants_count' => 0,
            'is_active'    => true,
        ], $overrides));
    }

    public function test_running_campaign_grants_correct_vouchers(): void
    {
        $campaign = $this->campaign();
        $user     = $this->customer();

        $this->service->runOnCustomerRegistered($user);

        $vouchers = \App\Models\Voucher::where('user_id', $user->id)->get();
        $this->assertCount(4, $vouchers);
        foreach ($vouchers as $v) {
            $this->assertSame(50000, $v->value);
            $this->assertSame('specific', $v->target);
            $this->assertSame($user->id, $v->user_id);
            $this->assertSame($campaign->id, $v->campaign_id);
            $this->assertTrue($v->expires_at->isSameDay(now()->addDays(90)));
        }
    }

    public function test_no_campaign_grants_no_voucher(): void
    {
        $user = $this->customer();

        $this->service->runOnCustomerRegistered($user);

        $this->assertSame(0, \App\Models\Voucher::where('user_id', $user->id)->count());
    }

    public function test_inactive_campaign_does_not_grant(): void
    {
        $this->campaign(['is_active' => false]);
        $user = $this->customer();

        $this->service->runOnCustomerRegistered($user);

        $this->assertSame(0, \App\Models\Voucher::where('user_id', $user->id)->count());
    }

    public function test_outside_date_window_does_not_grant(): void
    {
        $this->campaign(['starts_at' => now()->addDay()]);
        $user = $this->customer();

        $this->service->runOnCustomerRegistered($user);

        $this->assertSame(0, \App\Models\Voucher::where('user_id', $user->id)->count());
    }

    public function test_reached_max_grants_does_not_grant_and_count_unchanged(): void
    {
        $campaign = $this->campaign(['max_grants' => 1, 'grants_count' => 1]);
        $user     = $this->customer();

        $this->service->runOnCustomerRegistered($user);

        $this->assertSame(0, \App\Models\Voucher::where('user_id', $user->id)->count());
        $this->assertSame(1, $campaign->fresh()->grants_count);
    }

    public function test_same_phone_re_registering_does_not_grant_twice(): void
    {
        $this->campaign();
        $user = $this->customer(['phone' => '0911222333']);

        $this->service->runOnCustomerRegistered($user);
        $user->delete();

        $user2 = $this->customer(['phone' => '0911222333']);
        $this->service->runOnCustomerRegistered($user2);

        $this->assertSame(0, \App\Models\Voucher::where('user_id', $user2->id)->count());
    }

    public function test_grant_failure_does_not_throw(): void
    {
        $campaign = $this->campaign();
        $user     = $this->customer();

        $this->mock(\App\Services\VoucherIssuer::class, function ($mock) {
            $mock->shouldReceive('issue')->andThrow(new \RuntimeException('boom'));
        });
        $service = app(CampaignService::class); // resolve lại để lấy mock qua constructor

        $service->runOnCustomerRegistered($user); // không throw ra ngoài — đây là điều kiểm

        $this->assertSame(0, \App\Models\Voucher::where('user_id', $user->id)->count());
        $this->assertSame(0, $campaign->fresh()->grants_count); // transaction rollback vì lỗi trước khi commit
    }

    public function test_grants_count_increments_by_one_per_grant(): void
    {
        $campaign = $this->campaign();

        $this->service->runOnCustomerRegistered($this->customer());
        $this->assertSame(1, $campaign->fresh()->grants_count);

        $this->service->runOnCustomerRegistered($this->customer());
        $this->assertSame(2, $campaign->fresh()->grants_count);
    }

    public function test_max_grants_one_only_first_of_two_users_gets_it(): void
    {
        $campaign = $this->campaign(['max_grants' => 1]);
        $userA    = $this->customer();
        $userB    = $this->customer();

        $this->service->runOnCustomerRegistered($userA);
        $this->service->runOnCustomerRegistered($userB);

        $this->assertSame(4, \App\Models\Voucher::where('user_id', $userA->id)->count());
        $this->assertSame(0, \App\Models\Voucher::where('user_id', $userB->id)->count());
        $this->assertSame(1, $campaign->fresh()->grants_count);
    }
}
