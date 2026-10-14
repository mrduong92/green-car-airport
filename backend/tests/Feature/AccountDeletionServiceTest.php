<?php

// backend/tests/Feature/AccountDeletionServiceTest.php

namespace Tests\Feature;

use App\Exceptions\AccountDeletionBlocked;
use App\Models\Booking;
use App\Models\DeviceToken;
use App\Models\DriverHiddenSender;
use App\Models\DriverProfile;
use App\Models\Otp;
use App\Models\SepayWebhookEvent;
use App\Models\User;
use App\Models\Voucher;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Notifications\BookingAcceptedNotification;
use App\Services\AccountDeletionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class AccountDeletionServiceTest extends TestCase
{
    use RefreshDatabase;

    private function service(): AccountDeletionService
    {
        return app(AccountDeletionService::class);
    }

    private function booking(array $attrs): Booking
    {
        return Booking::create(array_merge([
            'customer_id' => User::factory()->create(['role' => 'customer'])->id,
            'pickup' => 'Hà Nội', 'destination' => 'Sân bay Nội Bài',
            'date' => now()->addDay()->format('Y-m-d'), 'time' => '08:00',
            'vehicle_type' => 'sedan_4', 'distance_km' => 30,
            'price' => 300_000, 'discount' => 0, 'surcharge' => 0, 'status' => 'completed',
        ], $attrs));
    }

    private function driver(): User
    {
        $driver = User::factory()->create(['role' => 'driver', 'phone' => '0912000111']);
        DriverProfile::create([
            'user_id' => $driver->id, 'vehicle_make' => 'Toyota', 'vehicle_model' => 'Vios',
            'vehicle_plate' => '30A-12345', 'vehicle_year' => 2021, 'vehicle_color' => 'Trắng',
            'vehicle_type' => 'sedan_4', 'status' => 'active', 'cccd_number' => '001099000111',
        ]);

        return $driver;
    }

    public function test_xoa_khach_an_danh_hoa_va_xoa_du_lieu_ca_nhan(): void
    {
        $customer = User::factory()->create(['role' => 'customer', 'phone' => '0901000111', 'referral_code' => 'GCA-AAA']);
        $customer->createToken('app');
        DeviceToken::create(['user_id' => $customer->id, 'endpoint' => 'https://push.example/1', 'p256dh' => 'p', 'auth' => 'a']);
        DB::table('notifications')->insert([
            'id' => (string) Str::uuid(), 'type' => 'X', 'notifiable_type' => User::class,
            'notifiable_id' => $customer->id, 'data' => '{}', 'created_at' => now(), 'updated_at' => now(),
        ]);
        Otp::create(['phone' => '0901000111', 'code' => '123456', 'expires_at' => now()->addMinutes(5)]);
        $unused = Voucher::create(['code' => 'GCA-U1', 'type' => 'fixed', 'value' => 50000, 'target' => 'specific', 'usage_count' => 0, 'is_active' => true, 'user_id' => $customer->id, 'expires_at' => now()->addMonth()]);
        $used = Voucher::create(['code' => 'GCA-U2', 'type' => 'fixed', 'value' => 50000, 'target' => 'specific', 'usage_count' => 1, 'is_active' => true, 'user_id' => $customer->id, 'expires_at' => now()->addMonth()]);
        $trip = $this->booking(['customer_id' => $customer->id, 'note' => 'Gọi 0901000111', 'voucher_id' => $used->id]);

        $this->service()->delete($customer);

        $customer->refresh();
        $this->assertSame(AccountDeletionService::DELETED_NAME, $customer->name);
        $this->assertSame("deleted-{$customer->id}", $customer->phone);
        $this->assertNull($customer->referral_code);
        $this->assertTrue($customer->isDeleted());
        $this->assertNull($customer->contactPhone());
        $this->assertSame(0, $customer->tokens()->count());
        $this->assertDatabaseMissing('device_tokens', ['user_id' => $customer->id]);
        $this->assertDatabaseMissing('notifications', ['notifiable_id' => $customer->id]);
        $this->assertDatabaseMissing('otps', ['phone' => '0901000111']);
        $this->assertDatabaseMissing('vouchers', ['id' => $unused->id]);
        $this->assertDatabaseHas('vouchers', ['id' => $used->id]);
        $this->assertDatabaseHas('bookings', ['id' => $trip->id, 'customer_id' => $customer->id, 'note' => null, 'status' => 'completed']);
    }

    public function test_xoa_tai_xe_xoa_ho_so_giu_vi_va_giao_dich(): void
    {
        $driver = $this->driver();
        $wallet = Wallet::create(['user_id' => $driver->id, 'points' => 0]);
        WalletTransaction::create(['wallet_id' => $wallet->id, 'type' => 'topup', 'description' => 'Nạp', 'points' => 100]);
        DriverHiddenSender::create(['driver_id' => $driver->id, 'sender_uid' => 'u1', 'qr_code' => 'q1']);
        $trip = $this->booking(['driver_id' => $driver->id]);

        $this->service()->delete($driver);

        $this->assertDatabaseMissing('driver_profiles', ['user_id' => $driver->id]);
        $this->assertDatabaseMissing('driver_hidden_senders', ['driver_id' => $driver->id]);
        $this->assertDatabaseHas('wallets', ['id' => $wallet->id]);
        $this->assertDatabaseHas('wallet_transactions', ['wallet_id' => $wallet->id, 'points' => 100]);
        $this->assertDatabaseHas('bookings', ['id' => $trip->id, 'driver_id' => $driver->id]);
    }

    public function test_cung_so_co_tai_khoan_tai_xe_thi_khong_dung_toi(): void
    {
        $driver = $this->driver();
        $driver->createToken('app');
        $customer = User::factory()->create(['role' => 'customer', 'phone' => '0912000111']);

        $this->service()->delete($customer);

        $this->assertSame('0912000111', $driver->fresh()->phone);
        $this->assertDatabaseHas('driver_profiles', ['user_id' => $driver->id]);
        $this->assertSame(1, $driver->tokens()->count());
    }

    /** @return array<string, array{0: callable(self): User, 1: string}> */
    public static function blockedCases(): array
    {
        return [
            'khách còn cuốc đang tìm tài xế' => [fn (self $t) => tap(User::factory()->create(['role' => 'customer']), fn ($u) => $t->booking(['customer_id' => $u->id, 'status' => 'finding_driver'])), 'Bạn còn cuốc chưa hoàn thành. Vui lòng hoàn thành hoặc huỷ cuốc trước khi xoá tài khoản.'],
            'tài xế đang chạy cuốc' => [fn (self $t) => tap($t->driver(), fn ($u) => $t->booking(['driver_id' => $u->id, 'status' => 'in_progress'])), 'Bạn còn cuốc chưa hoàn thành. Vui lòng hoàn thành hoặc huỷ cuốc trước khi xoá tài khoản.'],
            'ví còn điểm' => [fn (self $t) => tap($t->driver(), fn ($u) => Wallet::create(['user_id' => $u->id, 'points' => 1250])), 'Ví của bạn còn 1.250 điểm. Vui lòng liên hệ admin để quyết toán trước khi xoá tài khoản.'],
            'user bị khoá' => [fn (self $t) => User::factory()->create(['role' => 'customer', 'is_blocked' => true]), 'Tài khoản đang bị khoá. Vui lòng liên hệ admin.'],
            'hồ sơ tài xế bị khoá' => [fn (self $t) => tap($t->driver(), fn ($u) => $u->driverProfile->update(['status' => 'blocked'])), 'Tài khoản đang bị khoá. Vui lòng liên hệ admin.'],
            'nợ phí phạt' => [fn (self $t) => User::factory()->create(['role' => 'customer', 'pending_penalty' => 50000]), 'Bạn còn phí phạt huỷ cuốc chưa thanh toán. Vui lòng liên hệ admin.'],
        ];
    }

    #[DataProvider('blockedCases')]
    public function test_bi_chan_thi_khong_doi_gi($make, string $message): void
    {
        $user = $make($this);
        $before = $user->fresh()->only(['name', 'phone', 'deleted_at']);

        try {
            $this->service()->delete($user);
            $this->fail('Phải ném AccountDeletionBlocked');
        } catch (AccountDeletionBlocked $e) {
            $this->assertSame($message, $e->getMessage());
        }

        $this->assertSame($before, $user->fresh()->only(['name', 'phone', 'deleted_at']));
    }

    public function test_ignore_holds_bo_qua_khoa_va_no_nhung_van_chan_vi_va_cuoc(): void
    {
        $blocked = User::factory()->create(['role' => 'customer', 'is_blocked' => true, 'pending_penalty' => 50000]);
        $this->service()->delete($blocked, ignoreHolds: true);
        $this->assertTrue($blocked->fresh()->isDeleted());

        $rich = $this->driver();
        Wallet::create(['user_id' => $rich->id, 'points' => 10]);
        $this->expectException(AccountDeletionBlocked::class);
        $this->service()->delete($rich, ignoreHolds: true);
    }

    /**
     * campaign_grants giữ SĐT (chặn đăng ký lại để nhận lại khuyến mãi người mới) — nhưng
     * không được còn nối với id tài khoản đã ẩn danh, nếu không ghép id là ra SĐT thật.
     */
    public function test_khuyen_mai_da_nhan_bo_lien_ket_voi_tai_khoan(): void
    {
        $customer = User::factory()->create(['role' => 'customer', 'phone' => '0901000222']);
        $campaignId = DB::table('campaigns')->insertGetId([
            'name' => 'Chào mừng', 'trigger' => 'registered', 'reward' => '{}',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('campaign_grants')->insert([
            'campaign_id' => $campaignId, 'user_id' => $customer->id, 'phone' => '0901000222', 'granted_at' => now(),
        ]);

        $this->service()->delete($customer);

        $this->assertDatabaseHas('campaign_grants', ['campaign_id' => $campaignId, 'phone' => '0901000222', 'user_id' => null]);
    }

    public function test_cung_so_con_tai_khoan_khac_thi_giu_otp(): void
    {
        $this->driver();
        $customer = User::factory()->create(['role' => 'customer', 'phone' => '0912000111']);
        Otp::create(['phone' => '0912000111', 'code' => '123456', 'expires_at' => now()->addMinutes(5)]);

        $this->service()->delete($customer);

        $this->assertDatabaseHas('otps', ['phone' => '0912000111']);
    }

    public function test_so_khong_con_tai_khoan_nao_thi_xoa_otp(): void
    {
        $customer = User::factory()->create(['role' => 'customer', 'phone' => '0912000222']);
        Otp::create(['phone' => '0912000222', 'code' => '123456', 'expires_at' => now()->addMinutes(5)]);

        $this->service()->delete($customer);

        $this->assertDatabaseMissing('otps', ['phone' => '0912000222']);
    }

    public function test_xoa_tai_xe_go_ten_khoi_thong_bao_cua_khach(): void
    {
        $driver = $this->driver();
        $driver->update(['name' => 'Nguyễn Văn Tài']);
        $trip = $this->booking(['driver_id' => $driver->id]);
        $other = $this->booking(['customer_id' => $trip->customer_id]);
        $trip->customer->notify(new BookingAcceptedNotification($trip, $driver));
        $trip->customer->notify(new BookingAcceptedNotification($other, User::factory()->create(['role' => 'driver', 'name' => 'Tài xế khác'])));

        $this->service()->delete($driver);

        $bodies = $trip->customer->notifications()->get()->pluck('data.body', 'data.booking_id');
        $this->assertSame('Tài xế đang trên đường đến đón bạn', $bodies[$trip->id]);
        $this->assertSame('Tài xế khác đang trên đường đến đón bạn', $bodies[$other->id]);
    }

    public function test_che_sdt_trong_sao_ke_sepay_giu_so_tien(): void
    {
        $driver = $this->driver();
        $event = SepayWebhookEvent::create([
            'sepay_id' => 1, 'gateway' => 'MBBank', 'content' => 'MOKHOA 0912000111', 'description' => 'NGUYEN VAN A MOKHOA 912000111',
            'transfer_type' => 'in', 'amount' => 300000, 'status' => 'ignored',
            'raw_payload' => ['content' => 'MOKHOA 0912000111', 'nested' => ['x' => '+84912000111']],
        ]);

        $this->service()->delete($driver);

        $event->refresh();
        $this->assertSame('MOKHOA ***', $event->content);
        $this->assertSame('NGUYEN VAN A MOKHOA ***', $event->description);
        $this->assertSame(['content' => 'MOKHOA ***', 'nested' => ['x' => '***']], $event->raw_payload);
        $this->assertSame(300000, $event->amount);
    }
}
