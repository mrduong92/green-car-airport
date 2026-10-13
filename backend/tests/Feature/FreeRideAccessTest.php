<?php

namespace Tests\Feature;

use App\Models\DriverProfile;
use App\Models\FreeRide;
use App\Models\ZaloQrRefreshRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class FreeRideAccessTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-10-16 03:00:00'));
    }

    private function profile(?Carbon $until): DriverProfile
    {
        $user = User::factory()->create(['role' => 'driver']);

        return DriverProfile::create([
            'user_id' => $user->id, 'vehicle_make' => 'Toyota', 'vehicle_model' => 'Vios',
            'vehicle_plate' => '30A-'.random_int(10000, 99999), 'vehicle_year' => 2021,
            'vehicle_color' => 'Trắng', 'vehicle_type' => 'sedan_4', 'status' => 'active',
            'free_unlocked_until' => $until,
        ]);
    }

    public function test_has_free_access_only_while_unlocked_until_is_in_the_future(): void
    {
        $this->assertFalse($this->profile(null)->hasFreeAccess());
        $this->assertFalse($this->profile(now()->subSecond())->hasFreeAccess());
        $this->assertFalse($this->profile(now())->hasFreeAccess());
        $this->assertTrue($this->profile(now()->addDay())->hasFreeAccess());
    }

    private function driverWith(?Carbon $until): User
    {
        return $this->profile($until)->user;
    }

    private function ride(array $overrides = []): FreeRide
    {
        return FreeRide::create(array_merge([
            'ride_uid' => 'r-1', 'sender_uid' => '111', 'sender_name' => 'Đức', 'qr_code' => 'QRDUC',
            'zalo_group_id' => 'g1', 'group_name' => 'Nhóm Một', 'direction' => 'to_airport',
            'pickup' => 'Phố Cổ', 'destination' => 'Sân bay Nội Bài',
            'pickup_at' => now()->addHour(), 'pickup_time_text' => '11h', 'seats' => 4, 'price' => 200000,
            'is_free' => false, 'is_raw' => false, 'raw_text' => 'tiễn 11h phố cổ đi sân bay 200k', 'group_count' => 1,
            'posted_at' => now(), 'expires_at' => now()->addHours(2),
        ], $overrides));
    }

    public function test_locked_driver_gets_no_contact_or_qr_in_page_and_since_branches(): void
    {
        $this->ride();
        $driver = $this->driverWith(null);

        $page = $this->actingAs($driver, 'sanctum')->getJson('/api/driver/free-rides')->assertOk();
        $this->assertNull($page->json('data.0.contact_url'));
        $this->assertNull($page->json('data.0.qr_code'));
        $this->assertFalse($page->json('access.unlocked'));
        $this->assertNull($page->json('access.expires_at'));
        $this->assertSame(config('business.free_unlock_instructions'), $page->json('access.instructions'));
        $this->assertStringNotContainsString('QRDUC', $page->getContent());

        $since = $this->actingAs($driver, 'sanctum')->getJson('/api/driver/free-rides?since=0')->assertOk();
        $this->assertNull($since->json('data.0.contact_url'));
        $this->assertNull($since->json('data.0.qr_code'));
        $this->assertFalse($since->json('access.unlocked'));
        $this->assertStringNotContainsString('QRDUC', $since->getContent());
    }

    public function test_unlocked_driver_gets_contact_url_and_expiry(): void
    {
        $this->ride();
        $until = now()->addDays(30);
        $driver = $this->driverWith($until);

        $res = $this->actingAs($driver, 'sanctum')->getJson('/api/driver/free-rides')->assertOk();
        $this->assertSame('zalo://qr/p/QRDUC', $res->json('data.0.contact_url'));
        $this->assertSame('QRDUC', $res->json('data.0.qr_code'));
        $this->assertTrue($res->json('access.unlocked'));
        $this->assertSame($until->getTimestampMs(), $res->json('access.expires_at'));
        $this->assertNull($res->json('access.instructions'));
    }

    public function test_expired_unlock_is_locked_again(): void
    {
        $driver = $this->driverWith(now()->addDay());
        $this->travelTo(now()->addDays(2));
        $this->ride();

        $res = $this->actingAs($driver, 'sanctum')->getJson('/api/driver/free-rides')->assertOk();
        $this->assertFalse($res->json('access.unlocked'));
        $this->assertNull($res->json('data.0.contact_url'));
    }

    public function test_locked_driver_cannot_request_broken_link_refresh(): void
    {
        $this->ride();
        $this->actingAs($this->driverWith(null), 'sanctum')
            ->postJson('/api/driver/free-rides/r-1/broken-link')
            ->assertStatus(403)->assertJson(['code' => 'free_locked']);
        $this->assertSame(0, ZaloQrRefreshRequest::count());
    }

    public function test_locked_driver_can_still_hide_a_sender_by_uid_only(): void
    {
        $this->ride();
        $driver = $this->driverWith(null);

        $this->actingAs($driver, 'sanctum')->postJson('/api/driver/free-rides/hidden-senders', ['sender_uid' => '111', 'qr_code' => null])->assertOk();

        $this->assertSame([], $this->actingAs($driver, 'sanctum')->getJson('/api/driver/free-rides')->json('data'));
    }

    public function test_locked_driver_sees_raw_text_with_phone_numbers_masked(): void
    {
        $this->ride(['raw_text' => 'tiễn 11h phố cổ 200k lh 0912.345.678 hoặc +84 987 654 321']);

        $locked = $this->actingAs($this->driverWith(null), 'sanctum')->getJson('/api/driver/free-rides')->json('data.0.raw_text');
        $this->assertSame('tiễn 11h phố cổ 200k lh ••••••••• hoặc •••••••••', $locked);

        $open = $this->actingAs($this->driverWith(now()->addYear()), 'sanctum')->getJson('/api/driver/free-rides')->json('data.0.raw_text');
        $this->assertStringContainsString('0912.345.678', $open);
    }

    public function test_masking_keeps_prices_and_times(): void
    {
        $this->assertSame('4h15 phố cổ 280,000đ xe 5 TK 0.25 1tr2 200k', \App\Models\FreeRide::maskPhones('4h15 phố cổ 280,000đ xe 5 TK 0.25 1tr2 200k'));
    }

    public function test_masking_covers_numbers_followed_by_punctuation_and_parenthesised_country_code(): void
    {
        foreach ([
            'lh 0912345678.' => 'lh •••••••••.',
            'Gọi 0912345678. Cảm ơn' => 'Gọi •••••••••. Cảm ơn',
            'lh 0912.345.678.' => 'lh •••••••••.',
            '(+84) 912 345 678' => '(•••••••••',
            'zalo: 0912345678, 200k' => 'zalo: •••••••••, 200k',
        ] as $in => $out) {
            $masked = \App\Models\FreeRide::maskPhones($in);
            $this->assertStringNotContainsString('912', $masked, $in);
            $this->assertStringNotContainsString('345', $masked, $in);
        }
        $this->assertSame('giá 1.200.000đ, 0.25 ck', \App\Models\FreeRide::maskPhones('giá 1.200.000đ, 0.25 ck'));
    }
}
