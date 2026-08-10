<?php

namespace Tests\Feature;

use App\Models\Campaign;
use App\Models\User;
use App\Support\CampaignTrigger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminCampaignControllerTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::factory()->create(['role' => 'admin']);
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'name'    => 'Ra mắt — tặng 200k khách mới',
            'trigger' => CampaignTrigger::CUSTOMER_REGISTERED,
            'reward'  => ['voucher_count' => 4, 'voucher_value' => 50000, 'voucher_expires_days' => 90],
        ], $overrides);
    }

    public function test_store_creates_campaign_with_defaults(): void
    {
        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/admin/campaigns', $this->payload())
            ->assertCreated()
            ->assertJsonPath('is_active', true)
            ->assertJsonPath('grants_count', 0)
            ->assertJsonPath('reward.voucher_count', 4);

        $this->assertDatabaseHas('campaigns', ['trigger' => 'customer_registered', 'is_active' => true]);
    }

    public function test_store_rejects_unknown_trigger(): void
    {
        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/admin/campaigns', $this->payload(['trigger' => 'không tồn tại']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['trigger']);
    }

    public function test_store_rejects_voucher_count_over_20(): void
    {
        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/admin/campaigns', $this->payload([
                'reward' => ['voucher_count' => 21, 'voucher_value' => 50000, 'voucher_expires_days' => 90],
            ]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['reward.voucher_count']);
    }

    public function test_store_rejects_voucher_value_under_1000(): void
    {
        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/admin/campaigns', $this->payload([
                'reward' => ['voucher_count' => 4, 'voucher_value' => 999, 'voucher_expires_days' => 90],
            ]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['reward.voucher_value']);
    }

    public function test_index_lists_grants_count_and_max_grants(): void
    {
        Campaign::create(array_merge($this->payload(), [
            'max_grants' => 1000, 'grants_count' => 5, 'is_active' => true,
        ]));

        $this->actingAs($this->admin(), 'sanctum')
            ->getJson('/api/admin/campaigns')
            ->assertOk()
            ->assertJsonPath('0.max_grants', 1000)
            ->assertJsonPath('0.grants_count', 5);
    }

    public function test_update_can_toggle_is_active(): void
    {
        $campaign = Campaign::create(array_merge($this->payload(), ['is_active' => true, 'grants_count' => 0]));

        $this->actingAs($this->admin(), 'sanctum')
            ->patchJson("/api/admin/campaigns/{$campaign->id}", ['is_active' => false])
            ->assertOk()
            ->assertJsonPath('is_active', false);
    }

    public function test_update_can_change_name(): void
    {
        $campaign = Campaign::create(array_merge($this->payload(), ['is_active' => true, 'grants_count' => 0]));

        $this->actingAs($this->admin(), 'sanctum')
            ->patchJson("/api/admin/campaigns/{$campaign->id}", ['name' => 'Tết 2027 — tặng khách cũ'])
            ->assertOk()
            ->assertJsonPath('name', 'Tết 2027 — tặng khách cũ');
    }

    public function test_store_accepts_customer_logged_in_trigger(): void
    {
        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/admin/campaigns', $this->payload(['trigger' => CampaignTrigger::CUSTOMER_LOGGED_IN]))
            ->assertCreated()
            ->assertJsonPath('trigger', 'customer_logged_in');
    }

    public function test_update_can_change_max_grants_and_reward(): void
    {
        $campaign = Campaign::create(array_merge($this->payload(), ['is_active' => true, 'grants_count' => 0]));

        $this->actingAs($this->admin(), 'sanctum')
            ->patchJson("/api/admin/campaigns/{$campaign->id}", [
                'max_grants' => 500,
                'reward'     => ['voucher_count' => 2, 'voucher_value' => 100000, 'voucher_expires_days' => 30],
            ])
            ->assertOk()
            ->assertJsonPath('max_grants', 500)
            ->assertJsonPath('reward.voucher_value', 100000);
    }

    public function test_no_destroy_route_exists(): void
    {
        $campaign = Campaign::create(array_merge($this->payload(), ['is_active' => true, 'grants_count' => 0]));

        $this->actingAs($this->admin(), 'sanctum')
            ->deleteJson("/api/admin/campaigns/{$campaign->id}")
            ->assertStatus(405);
    }
}
