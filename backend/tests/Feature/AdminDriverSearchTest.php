<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// Nhân viên nạp điểm thủ công theo nội dung chuyển khoản = mã tài xế (driver_profiles.payment_code).
class AdminDriverSearchTest extends TestCase
{
    use RefreshDatabase;

    private function driver(string $name, string $plate): User
    {
        $u = User::factory()->create(['role' => 'driver', 'name' => $name]);
        $u->driverProfile()->create([
            'vehicle_make' => 'Toyota', 'vehicle_model' => 'Vios', 'vehicle_plate' => $plate,
            'vehicle_year' => 2022, 'vehicle_color' => 'Trắng', 'vehicle_type' => 'sedan_4', 'status' => 'active',
        ]);

        return $u->fresh('driverProfile');
    }

    private function search(string $q): array
    {
        $admin = User::factory()->create(['role' => 'admin']);

        return $this->actingAs($admin, 'sanctum')
            ->getJson('/api/admin/drivers?search='.urlencode($q))
            ->assertOk()
            ->json();
    }

    public function test_search_by_driver_code_full_or_digits_and_list_returns_code(): void
    {
        $a = $this->driver('Tài xế A', '30A-11111');
        $b = $this->driver('Tài xế B', '30A-22222');
        $codeA = $a->driverProfile->payment_code;
        $this->assertNotEmpty($codeA);

        foreach ([$codeA, strtolower($codeA), ' '.$codeA.' ', substr($codeA, -6)] as $q) {
            $ids = collect($this->search($q))->pluck('id')->all();
            $this->assertContains($a->id, $ids, "tìm theo '$q'");
            $this->assertNotContains($b->id, $ids, "tìm theo '$q'");
        }

        $row = collect($this->search($codeA))->firstWhere('id', $a->id);
        $this->assertSame($codeA, $row['payment_code']);
    }

    public function test_existing_search_by_name_phone_plate_still_works(): void
    {
        $a = $this->driver('Nguyễn Văn Tìm', '51G-98765');

        foreach (['Văn Tìm', $a->phone, '98765'] as $q) {
            $this->assertContains($a->id, collect($this->search($q))->pluck('id')->all(), "tìm theo '$q'");
        }
    }
}
