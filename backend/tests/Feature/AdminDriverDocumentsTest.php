<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\DriverProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminDriverDocumentsTest extends TestCase
{
    use RefreshDatabase;

    private function makeAdmin(): User
    {
        return User::factory()->create(['role' => 'admin']);
    }

    private function makeDriverWithDocs(): User
    {
        $driver = User::factory()->create(['role' => 'driver']);
        DriverProfile::create([
            'user_id'                   => $driver->id,
            'vehicle_make'              => 'Toyota',
            'vehicle_model'             => 'Camry',
            'vehicle_plate'             => '51G-99999',
            'vehicle_year'              => 2022,
            'vehicle_color'             => 'Trắng',
            'vehicle_type'              => 'sedan_4',
            'status'                    => 'pending',
            'is_verified'               => false,
            'cccd_number'               => '079123456789',
            'gplx_number'               => '012345678910',
            'vehicle_reg_number'        => '29A-99999',
            'vehicle_inspection_number' => 'DK999999',
            'vehicle_inspection_expiry' => now()->addYear()->format('Y-m-d'),
            'insurance_number'          => 'BH999999',
            'insurance_expiry'          => now()->addYear()->format('Y-m-d'),
        ]);
        return $driver;
    }

    public function test_admin_driver_list_includes_document_fields(): void
    {
        $admin  = $this->makeAdmin();
        $driver = $this->makeDriverWithDocs();

        $response = $this->actingAs($admin)
            ->getJson('/api/admin/drivers')
            ->assertOk();

        $driverData = collect($response->json())->firstWhere('id', $driver->id);

        $this->assertNotNull($driverData);
        $this->assertEquals('079123456789', $driverData['cccd_number']);
        $this->assertEquals('012345678910', $driverData['gplx_number']);
        $this->assertEquals('29A-99999',    $driverData['vehicle_reg_number']);
        $this->assertEquals('DK999999',     $driverData['vehicle_inspection_number']);
        $this->assertNotNull($driverData['vehicle_inspection_expiry']);
        $this->assertEquals('BH999999',     $driverData['insurance_number']);
        $this->assertNotNull($driverData['insurance_expiry']);
    }

    public function test_admin_can_toggle_driver_vip_flag(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $driver = User::factory()->create(['role' => 'driver']);
        $driver->driverProfile()->create([
            'vehicle_make' => 'Toyota',
            'vehicle_model' => 'Camry',
            'vehicle_plate' => '51G-12345',
            'vehicle_year' => 2020,
            'vehicle_color' => 'Trắng',
            'vehicle_type' => 'sedan_4',
            'status' => 'active',
        ]);

        $this->actingAs($admin, 'sanctum')
            ->putJson("/api/admin/drivers/{$driver->id}", ['is_vip' => true])
            ->assertOk()
            ->assertJsonPath('is_vip', true);

        $this->assertTrue($driver->driverProfile->fresh()->is_vip);
    }
}
