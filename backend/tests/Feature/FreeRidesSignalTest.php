<?php

namespace Tests\Feature;

use App\Broadcasting\DriverFreeRidesChannel;
use App\Events\FreeRidesUpdated;
use App\Jobs\BroadcastFreeRidesSignal;
use App\Models\DriverProfile;
use App\Models\FreeRide;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Queue;
use Tests\Concerns\SignsZaloBotRequests;
use Tests\TestCase;

class FreeRidesSignalTest extends TestCase
{
    use RefreshDatabase;
    use SignsZaloBotRequests;

    protected function setUp(): void
    {
        parent::setUp();
        config(['zalo.enabled' => true, 'zalo.bot_secret' => 'test-secret']);
        $this->travelTo(Carbon::parse('2026-10-07 01:00:00'));
    }

    private function ridePayload(string $uid): array
    {
        return [
            'ride_uid' => $uid, 'sender_uid' => '111', 'sender_name' => '', 'qr_code' => 'QR'.strtoupper($uid), 'zalo_group_id' => 'g1', 'group_name' => '',
            'direction' => null, 'pickup' => null, 'destination' => null, 'pickup_at' => null, 'pickup_time_text' => null,
            'seats' => null, 'vehicle_note' => null, 'price' => null, 'is_free' => false, 'is_raw' => true, 'raw_text' => 'x',
            'group_count' => 1, 'posted_at' => now()->getTimestampMs(), 'expires_at' => now()->addHour()->getTimestampMs(),
        ];
    }

    public function test_signal_is_dispatched_once_per_window(): void
    {
        Queue::fake();

        $this->zaloPost('/api/internal/zalo/rides', ['rides' => [$this->ridePayload('a')]])->assertOk();
        $this->zaloPost('/api/internal/zalo/rides', ['rides' => [$this->ridePayload('b')]])->assertOk();

        Queue::assertPushed(BroadcastFreeRidesSignal::class, 1);
    }

    public function test_no_signal_when_nothing_was_stored(): void
    {
        Queue::fake();

        $this->zaloPost('/api/internal/zalo/rides', ['rides' => [['ride_uid' => 'bad']]])->assertOk();

        Queue::assertNotPushed(BroadcastFreeRidesSignal::class);
    }

    public function test_job_broadcasts_latest_mark(): void
    {
        Event::fake([FreeRidesUpdated::class]);
        FreeRide::create(['ride_uid' => 'a', 'sender_uid' => '111', 'qr_code' => 'ABC123', 'zalo_group_id' => 'g1', 'raw_text' => 'x', 'posted_at' => now(), 'expires_at' => now()->addHour()]);

        (new BroadcastFreeRidesSignal)->handle();

        Event::assertDispatched(FreeRidesUpdated::class, fn (FreeRidesUpdated $e) => $e->latest === now()->getTimestampMs());
    }

    public function test_event_shape(): void
    {
        $event = new FreeRidesUpdated(123);

        $this->assertSame('private-driver.free-rides', $event->broadcastOn()->name);
        $this->assertSame('free-rides.updated', $event->broadcastAs());
        $this->assertSame(['latest' => 123], $event->broadcastWith());
    }

    public function test_channel_allows_only_active_drivers(): void
    {
        $make = function (string $role, ?string $status) {
            $user = User::factory()->create(['role' => $role]);
            if ($status) {
                DriverProfile::create([
                    'user_id' => $user->id, 'vehicle_make' => 'Toyota', 'vehicle_model' => 'Vios', 'vehicle_plate' => '30A-'.random_int(10000, 99999),
                    'vehicle_year' => 2021, 'vehicle_color' => 'Trắng', 'vehicle_type' => 'sedan_4', 'status' => $status,
                ]);
            }

            return $user;
        };
        $channel = new DriverFreeRidesChannel;

        $this->assertTrue($channel->join($make('driver', 'active')));
        $this->assertFalse($channel->join($make('driver', 'pending')));
        $this->assertFalse($channel->join($make('customer', null)));
    }
}
