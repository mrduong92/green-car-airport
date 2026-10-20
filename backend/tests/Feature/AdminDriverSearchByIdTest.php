<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminDriverSearchByIdTest extends TestCase
{
    use RefreshDatabase;

    public function test_search_by_driver_id_matches_exactly(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $target = User::factory()->create(['id' => 453, 'role' => 'driver', 'name' => 'Nguyen A', 'phone' => '0911111111']);
        $other = User::factory()->create(['id' => 1453, 'role' => 'driver', 'name' => 'Tran B', 'phone' => '0922222222']);

        foreach ([(string) $target->id, "#{$target->id}"] as $term) {
            $res = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/drivers?search='.urlencode($term))->assertOk();
            $ids = collect($res->json())->pluck('id')->all();
            $this->assertContains($target->id, $ids);
            $this->assertNotContains($other->id, $ids);
        }
    }
}
