<?php
// backend/tests/Feature/VipBookingCreateTest.php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class VipBookingCreateTest extends TestCase
{
    use RefreshDatabase;

    private function payload(array $extra = []): array
    {
        return array_merge([
            'pickup' => 'Hà Nội',
            'destination' => 'Sân bay Nội Bài',
            'date' => now()->addDay()->format('Y-m-d'),
            'time' => '08:00',
            'distance_km' => 30,
            'price' => 500_000,
            'vehicle_type' => 'sedan_4',
        ], $extra);
    }

    public function test_creates_vip_booking_when_flag_sent(): void
    {
        Notification::fake();
        $customer = User::factory()->create(['role' => 'customer']);

        $response = $this->actingAs($customer, 'sanctum')
            ->postJson('/api/bookings', $this->payload(['is_vip' => true]))
            ->assertCreated();

        $this->assertTrue($response->json('is_vip'));
        $this->assertDatabaseHas('bookings', ['id' => $response->json('id'), 'is_vip' => true]);
    }

    public function test_defaults_to_non_vip_when_flag_absent(): void
    {
        Notification::fake();
        $customer = User::factory()->create(['role' => 'customer']);

        $response = $this->actingAs($customer, 'sanctum')
            ->postJson('/api/bookings', $this->payload())
            ->assertCreated();

        $this->assertFalse($response->json('is_vip'));
        $this->assertDatabaseHas('bookings', ['id' => $response->json('id'), 'is_vip' => false]);
    }

    public function test_rejects_non_boolean_is_vip(): void
    {
        Notification::fake();
        $customer = User::factory()->create(['role' => 'customer']);

        $this->actingAs($customer, 'sanctum')
            ->postJson('/api/bookings', $this->payload(['is_vip' => 'có']))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['is_vip']);
    }
}
