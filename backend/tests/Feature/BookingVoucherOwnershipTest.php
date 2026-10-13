<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Voucher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BookingVoucherOwnershipTest extends TestCase
{
    use RefreshDatabase;

    private function personalVoucher(User $owner, string $code): Voucher
    {
        return Voucher::create([
            'code' => $code, 'type' => 'fixed', 'value' => 50_000,
            'target' => 'specific', 'user_id' => $owner->id,
            'expires_at' => now()->addMonth(),
            'usage_limit' => 1, 'usage_count' => 0, 'is_active' => true,
        ]);
    }

    private function payload(string $voucherCode): array
    {
        return [
            'pickup'       => 'Hà Nội',
            'destination'  => 'Sân bay Nội Bài',
            'date'         => now()->addDay()->format('Y-m-d'),
            'time'         => '08:00',
            'vehicle_type' => 'sedan_4',
            'distance_km'  => 30,
            'price'        => 500_000,
            'voucher_code' => $voucherCode,
        ];
    }

    public function test_cannot_redeem_someone_elses_personal_voucher(): void
    {
        $owner    = User::factory()->create(['role' => 'customer']);
        $stranger = User::factory()->create(['role' => 'customer']);
        $voucher  = $this->personalVoucher($owner, 'REF-OWNER-1');

        $this->actingAs($stranger, 'sanctum')
            ->postJson('/api/bookings', $this->payload($voucher->code))
            ->assertCreated()
            ->assertJson(['discount' => 0, 'final_price' => 500_000]);

        $this->assertNull($stranger->bookingsAsCustomer()->first()?->voucher_id);
        $this->assertSame(0, $voucher->fresh()->usage_count);
    }

    public function test_owner_can_redeem_own_personal_voucher(): void
    {
        $owner   = User::factory()->create(['role' => 'customer']);
        $voucher = $this->personalVoucher($owner, 'REF-OWNER-2');

        $this->actingAs($owner, 'sanctum')
            ->postJson('/api/bookings', $this->payload($voucher->code))
            ->assertCreated()
            ->assertJson(['discount' => 50_000, 'final_price' => 450_000]);

        $this->assertSame(1, $voucher->fresh()->usage_count);
    }

    public function test_public_voucher_still_works_for_anyone(): void
    {
        $voucher = Voucher::create([
            'code' => 'AIRPORT50K', 'type' => 'fixed', 'value' => 50_000,
            'target' => 'all', 'expires_at' => now()->addMonth(),
            'usage_limit' => 100, 'usage_count' => 0, 'is_active' => true,
        ]);

        $this->actingAs(User::factory()->create(['role' => 'customer']), 'sanctum')
            ->postJson('/api/bookings', $this->payload($voucher->code))
            ->assertCreated()
            ->assertJson(['discount' => 50_000]);
    }
}
