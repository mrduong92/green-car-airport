<?php
// backend/tests/Feature/CollaboratorBookingTest.php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CollaboratorBookingTest extends TestCase
{
    use RefreshDatabase;

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'pickup'       => 'Khách sạn Metropole',
            'destination'  => 'Sân bay Nội Bài',
            'date'         => now()->addDay()->format('Y-m-d'),
            'time'         => '08:00',
            'vehicle_type' => 'sedan_4',
            'distance_km'  => 30,
            'price'        => 1_000_000,
        ], $overrides);
    }

    public function test_collaborator_can_submit_collection_fee(): void
    {
        $collaborator = User::factory()->create(['role' => 'customer', 'is_collaborator' => true]);

        $response = $this->actingAs($collaborator, 'sanctum')
            ->postJson('/api/bookings', $this->payload(['collection_fee' => 200_000]))
            ->assertCreated()
            ->assertJsonPath('collection_fee', 200_000);

        $this->assertDatabaseHas('bookings', [
            'collaborator_id' => $collaborator->id,
            'collection_fee'  => 200_000,
        ]);
    }

    public function test_non_collaborator_cannot_submit_collection_fee(): void
    {
        $customer = User::factory()->create(['role' => 'customer', 'is_collaborator' => false]);

        $this->actingAs($customer, 'sanctum')
            ->postJson('/api/bookings', $this->payload(['collection_fee' => 200_000]))
            ->assertStatus(422);
    }

    public function test_collection_fee_defaults_to_zero_when_omitted(): void
    {
        $customer = User::factory()->create(['role' => 'customer']);

        $this->actingAs($customer, 'sanctum')
            ->postJson('/api/bookings', $this->payload())
            ->assertCreated()
            ->assertJsonPath('collection_fee', 0);
    }

    public function test_collaborator_id_not_set_when_collection_fee_zero(): void
    {
        $collaborator = User::factory()->create(['role' => 'customer', 'is_collaborator' => true]);

        $this->actingAs($collaborator, 'sanctum')
            ->postJson('/api/bookings', $this->payload(['collection_fee' => 0]))
            ->assertCreated();

        $this->assertDatabaseHas('bookings', [
            'customer_id'     => $collaborator->id,
            'collection_fee'  => 0,
            'collaborator_id' => null,
        ]);
    }
}
