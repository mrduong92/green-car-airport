<?php
// backend/tests/Feature/PriceConfigUniqueTest.php

namespace Tests\Feature;

use App\Models\PriceConfig;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PriceConfigUniqueTest extends TestCase
{
    use RefreshDatabase;

    private function makeAdmin(): User
    {
        return User::factory()->create(['role' => 'admin']);
    }

    private function validPayload(): array
    {
        return [
            'service_type' => 'airport',
            'trip_type'    => 'one_way',
            'vehicle_type' => 'sedan_4',
            'price_type'   => 'range',
            'min_price'    => 200_000,
            'max_price'    => 300_000,
        ];
    }

    public function test_store_rejects_duplicate_of_an_active_config(): void
    {
        PriceConfig::create($this->validPayload() + ['is_active' => true]);

        $this->actingAs($this->makeAdmin(), 'sanctum')
            ->postJson('/api/admin/price-configs', $this->validPayload())
            ->assertStatus(422)
            ->assertJsonValidationErrors(['service_type']);

        $this->assertDatabaseCount('price_configs', 1);
    }

    public function test_store_allows_duplicate_combo_when_existing_one_is_hidden(): void
    {
        PriceConfig::create($this->validPayload() + ['is_active' => false]);

        $this->actingAs($this->makeAdmin(), 'sanctum')
            ->postJson('/api/admin/price-configs', $this->validPayload())
            ->assertCreated();

        $this->assertDatabaseCount('price_configs', 2);
    }

    public function test_store_allows_different_vehicle_type(): void
    {
        PriceConfig::create($this->validPayload() + ['is_active' => true]);

        $this->actingAs($this->makeAdmin(), 'sanctum')
            ->postJson('/api/admin/price-configs', array_merge($this->validPayload(), ['vehicle_type' => 'suv_5']))
            ->assertCreated();
    }

    /**
     * Dòng giá VIP KHÔNG được coi là trùng dòng thường cùng tổ hợp. Thiếu
     * is_vip trong Rule::unique thì admin không tạo nổi bảng giá VIP và nhận
     * thông báo "Đã có bảng giá..." — sai hoàn toàn so với nguyên nhân.
     */
    public function test_store_allows_vip_row_alongside_normal_row(): void
    {
        PriceConfig::create($this->validPayload() + ['is_active' => true]);

        $this->actingAs($this->makeAdmin(), 'sanctum')
            ->postJson('/api/admin/price-configs', $this->validPayload() + ['is_vip' => true])
            ->assertCreated();

        $this->assertDatabaseCount('price_configs', 2);
    }

    public function test_store_rejects_duplicate_vip_row(): void
    {
        PriceConfig::create($this->validPayload() + ['is_active' => true, 'is_vip' => true]);

        $this->actingAs($this->makeAdmin(), 'sanctum')
            ->postJson('/api/admin/price-configs', $this->validPayload() + ['is_vip' => true])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['service_type']);

        $this->assertDatabaseCount('price_configs', 1);
    }
}
