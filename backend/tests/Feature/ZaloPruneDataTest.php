<?php

namespace Tests\Feature;

use App\Models\FreeRideReport;
use App\Models\User;
use App\Models\ZaloAccountRequest;
use App\Models\ZaloGroup;
use App\Models\ZaloQrRefreshRequest;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class ZaloPruneDataTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-10-10 03:20:00'));
    }

    private function accountRequest(string $status, int $daysAgo): ZaloAccountRequest
    {
        $r = ZaloAccountRequest::create(['type' => 'login', 'account_id' => "acc-$status-$daysAgo", 'status' => $status]);
        $r->forceFill(['created_at' => now()->subDays($daysAgo), 'updated_at' => now()->subDays($daysAgo)])->saveQuietly();

        return $r;
    }

    public function test_prunes_terminal_account_requests_older_than_retention_only(): void
    {
        $oldDone = $this->accountRequest('done', 31);
        $oldExpired = $this->accountRequest('expired', 40);
        $oldFailed = $this->accountRequest('failed', 31);
        $recentDone = $this->accountRequest('done', 5);
        $oldPending = $this->accountRequest('pending', 31); // chưa kết thúc → không xoá

        $this->artisan('zalo:prune-data')->assertSuccessful();

        $this->assertEqualsCanonicalizing(
            [$recentDone->id, $oldPending->id],
            ZaloAccountRequest::pluck('id')->all(),
        );
        $this->assertNull(ZaloAccountRequest::find($oldDone->id));
        $this->assertNull(ZaloAccountRequest::find($oldExpired->id));
        $this->assertNull(ZaloAccountRequest::find($oldFailed->id));
    }

    public function test_prunes_reports_and_delivered_qr_refresh_requests_older_than_90_days(): void
    {
        $driver = User::factory()->create(['role' => 'driver']);
        $report = fn (string $uid, int $daysAgo) => tap(FreeRideReport::create([
            'free_ride_uid' => $uid, 'sender_uid' => 'S1', 'driver_id' => $driver->id, 'reason' => 'spam',
        ]))->forceFill(['created_at' => now()->subDays($daysAgo), 'updated_at' => now()->subDays($daysAgo)])->saveQuietly();
        $report('old', 91);
        $report('recent', 89);

        $qr = fn (?Carbon $deliveredAt, int $daysAgo) => tap(ZaloQrRefreshRequest::create([
            'sender_uid' => 'S'.$daysAgo.($deliveredAt ? 'd' : 'p'), 'delivered_at' => $deliveredAt,
        ]))->forceFill(['created_at' => now()->subDays($daysAgo)])->saveQuietly();
        $qr(now()->subDays(91), 92);      // giao lâu rồi → xoá
        $qr(now()->subDays(10), 92);      // tạo lâu nhưng mới giao → giữ
        $qr(null, 100);                   // chưa giao → giữ

        $this->artisan('zalo:prune-data')->assertSuccessful();

        $this->assertSame(['recent'], FreeRideReport::pluck('free_ride_uid')->all());
        $this->assertSame(2, ZaloQrRefreshRequest::count());
        $this->assertSame(1, ZaloQrRefreshRequest::whereNull('delivered_at')->count());
    }

    public function test_prunes_groups_left_more_than_30_days_ago(): void
    {
        ZaloGroup::create(['zalo_group_id' => 'old', 'name' => 'Rời lâu', 'left_at' => now()->subDays(31)]);
        ZaloGroup::create(['zalo_group_id' => 'recent', 'name' => 'Mới rời', 'left_at' => now()->subDays(29)]);
        ZaloGroup::create(['zalo_group_id' => 'active', 'name' => 'Đang ở', 'left_at' => null]);

        $this->artisan('zalo:prune-data')
            ->expectsOutputToContain('1 nhóm đã rời')
            ->assertSuccessful();

        $this->assertEqualsCanonicalizing(['active', 'recent'], ZaloGroup::pluck('zalo_group_id')->all());
    }

    public function test_retention_is_configurable(): void
    {
        config([
            'zalo.account_requests_retention_days' => 3,
            'zalo.reports_retention_days' => 10,
            'zalo.qr_refresh_requests_retention_days' => 10,
            'zalo.left_groups_retention_days' => 2,
        ]);
        $this->accountRequest('done', 4);
        ZaloGroup::create(['zalo_group_id' => 'g', 'name' => 'x', 'left_at' => now()->subDays(3)]);
        $driver = User::factory()->create(['role' => 'driver']);
        FreeRideReport::create(['free_ride_uid' => 'u', 'sender_uid' => 'S', 'driver_id' => $driver->id, 'reason' => 'spam'])
            ->forceFill(['created_at' => now()->subDays(11)])->saveQuietly();
        ZaloQrRefreshRequest::create(['sender_uid' => 'S', 'delivered_at' => now()->subDays(11)]);

        $this->artisan('zalo:prune-data')->assertSuccessful();

        $this->assertSame(0, ZaloAccountRequest::count());
        $this->assertSame(0, ZaloGroup::count());
        $this->assertSame(0, FreeRideReport::count());
        $this->assertSame(0, ZaloQrRefreshRequest::count());
    }

    public function test_command_is_scheduled_daily_at_0320(): void
    {
        $event = collect(app(Schedule::class)->events())
            ->first(fn ($e) => str_contains($e->command ?? '', 'zalo:prune-data'));

        $this->assertNotNull($event);
        $this->assertSame('20 3 * * *', $event->expression);
    }
}
