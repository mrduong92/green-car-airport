<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class AdminWalletAdjustmentsTest extends TestCase
{
    use RefreshDatabase;

    private function admin(string $name = 'Admin A'): User
    {
        return User::factory()->create(['role' => 'admin', 'name' => $name]);
    }

    private function driverWithWallet(int $points = 0): array
    {
        $driver = User::factory()->create(['role' => 'driver']);
        $wallet = Wallet::create(['user_id' => $driver->id, 'points' => $points]);

        return [$driver, $wallet];
    }

    public function test_topup_and_deduct_record_acting_admin(): void
    {
        Notification::fake();
        $admin = $this->admin();
        [$driver, $wallet] = $this->driverWithWallet();

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/drivers/{$driver->id}/topup", ['points' => 300])
            ->assertOk();
        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/customers/{$driver->id}/deduct-points", ['points' => 100, 'reason' => 'Sai cuốc'])
            ->assertOk();

        $this->assertSame(2, WalletTransaction::where('wallet_id', $wallet->id)->where('created_by', $admin->id)->count());
    }

    public function test_admin_kind_lists_only_admin_adjustments_newest_first(): void
    {
        Notification::fake();
        $admin = $this->admin('Admin Hà');
        [$driver, $wallet] = $this->driverWithWallet(1000);
        $customer = User::factory()->create(['role' => 'customer']);
        $booking = Booking::create([
            'customer_id' => $customer->id,
            'pickup' => 'Hà Nội',
            'destination' => 'Sân bay Nội Bài',
            'date' => now()->addDay()->format('Y-m-d'),
            'time' => '08:00',
            'vehicle_type' => 'sedan_4',
            'distance_km' => 30,
            'price' => 500_000,
            'discount' => 0,
            'surcharge' => 0,
            'status' => 'completed',
        ]);

        // Không phải thao tác của admin: phí cuốc, thưởng giới thiệu, nạp qua cổng thanh toán
        WalletTransaction::create(['wallet_id' => $wallet->id, 'booking_id' => $booking->id, 'type' => 'debit', 'description' => 'Phí app cuốc', 'points' => 100]);
        WalletTransaction::create(['wallet_id' => $wallet->id, 'type' => 'referral', 'description' => 'Thưởng giới thiệu', 'points' => 50]);
        WalletTransaction::create(['wallet_id' => $wallet->id, 'type' => 'topup', 'description' => 'Nạp điểm qua SePay #123', 'points' => 200]);

        // Dữ liệu cũ (trước khi có created_by)
        $legacy = WalletTransaction::create(['wallet_id' => $wallet->id, 'type' => 'topup', 'description' => 'Nạp điểm thủ công bởi Admin', 'points' => 400]);
        $legacy->forceFill(['created_at' => now()->subDays(2)])->save();
        $legacyDebit = WalletTransaction::create(['wallet_id' => $wallet->id, 'type' => 'debit', 'description' => 'Admin trừ điểm: test', 'points' => 30]);
        $legacyDebit->forceFill(['created_at' => now()->subDay()])->save();

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/drivers/{$driver->id}/topup", ['points' => 300, 'description' => 'Thưởng tết'])
            ->assertOk();

        $res = $this->actingAs($admin, 'sanctum')
            ->getJson("/api/admin/drivers/{$driver->id}/wallet-adjustments?kind=admin")
            ->assertOk()
            ->assertJsonCount(3, 'data');

        $res->assertJsonPath('data.0.points', 300)
            ->assertJsonPath('data.0.direction', 'in')
            ->assertJsonPath('data.0.description', 'Thưởng tết')
            ->assertJsonPath('data.0.admin_name', 'Admin Hà')
            ->assertJsonPath('data.1.points', 30)
            ->assertJsonPath('data.1.direction', 'out')
            ->assertJsonPath('data.1.admin_name', null)
            ->assertJsonPath('data.2.points', 400)
            ->assertJsonPath('balance', 1300);
    }

    public function test_non_admin_cannot_view_adjustments(): void
    {
        [$driver] = $this->driverWithWallet();

        $this->actingAs($driver, 'sanctum')
            ->getJson("/api/admin/drivers/{$driver->id}/wallet-adjustments")
            ->assertForbidden();
    }

    public function test_rejects_non_driver_target(): void
    {
        $customer = User::factory()->create(['role' => 'customer']);

        $this->actingAs($this->admin(), 'sanctum')
            ->getJson("/api/admin/drivers/{$customer->id}/wallet-adjustments")
            ->assertStatus(422);
    }

    public function test_all_kind_returns_every_points_transaction_with_categories_and_filters(): void
    {
        Notification::fake();
        $admin = $this->admin('Admin Hà');
        [$driver, $wallet] = $this->driverWithWallet(1000);
        $customer = User::factory()->create(['role' => 'customer']);
        $mk = fn (string $status) => Booking::create([
            'customer_id' => $customer->id, 'pickup' => 'Hà Nội', 'destination' => 'Sân bay Nội Bài',
            'date' => now()->addDay()->format('Y-m-d'), 'time' => '08:00', 'vehicle_type' => 'sedan_4',
            'distance_km' => 30, 'price' => 500_000, 'discount' => 0, 'surcharge' => 0, 'status' => $status,
        ]);
        $cancelled = $mk('cancelled');
        $done = $mk('completed');
        $tx = fn (array $a) => WalletTransaction::create(['wallet_id' => $wallet->id] + $a);

        $activation = $tx(['type' => 'topup', 'description' => 'Nạp điểm qua SePay #1', 'points' => 300]);
        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/drivers/{$driver->id}/topup", ['points' => 100])->assertOk();
        $feeCancelled = $tx(['type' => 'debit', 'booking_id' => $cancelled->id, 'description' => "Phí app 20% cuốc #{$cancelled->id}", 'points' => 100]);
        $refund = $tx(['type' => 'credit', 'booking_id' => $cancelled->id, 'description' => "Hoàn phí app cuốc #{$cancelled->id} (khách huỷ)", 'points' => 100]);
        $feeDone = $tx(['type' => 'debit', 'booking_id' => $done->id, 'description' => "Phí app 20% cuốc #{$done->id}", 'points' => 90]);
        $collect = $tx(['type' => 'debit', 'booking_id' => $done->id, 'description' => "Thu hộ cuốc #{$done->id}", 'points' => 50]);
        $rewardRow = $tx(['type' => 'credit', 'balance' => 'reward', 'kind' => 'commission', 'description' => 'Hoa hồng', 'points' => 77]);

        $get = fn (string $q = '') => $this->actingAs($admin, 'sanctum')
            ->getJson("/api/admin/drivers/{$driver->id}/wallet-adjustments{$q}")->assertOk();

        $all = $get()->assertJsonCount(6, 'data');
        $this->assertNotContains($rewardRow->id, collect($all->json('data'))->pluck('id')->all());
        $cats = collect($all->json('data'))->pluck('category', 'id');
        $this->assertSame('topup', $cats[$activation->id]);
        $this->assertSame('app_fee', $cats[$feeCancelled->id]);
        $this->assertSame('refund', $cats[$refund->id]);
        $this->assertSame('collection', $cats[$collect->id]);
        $this->assertSame('admin', $cats->first(fn ($c, $id) => ! in_array($id, [$activation->id, $feeCancelled->id, $refund->id, $feeDone->id, $collect->id])));
        $all->assertJsonPath('data.0.id', $collect->id);

        $ids = fn ($r) => collect($r->json('data'))->pluck('id')->sort()->values()->all();
        $this->assertSame([$activation->id], $ids($get('?kind=topup')));
        $this->assertSame(collect([$feeCancelled->id, $feeDone->id, $collect->id])->sort()->values()->all(), $ids($get('?kind=trip')));
        $this->assertSame([$refund->id], $ids($get('?kind=refund')));
        $get('?kind=admin')->assertJsonCount(1, 'data')->assertJsonPath('data.0.points', 100)->assertJsonPath('data.0.creator_name', 'Admin Hà');
        $get('?kind=all')->assertJsonCount(6, 'data');

        $this->actingAs($admin, 'sanctum')
            ->getJson("/api/admin/drivers/{$driver->id}/wallet-adjustments?kind=bogus")->assertStatus(422);
    }
}
