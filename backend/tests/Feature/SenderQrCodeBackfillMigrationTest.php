<?php

namespace Tests\Feature;

use App\Models\FreeRide;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

// Migration thêm qr_code vào zalo_sender_blocks / driver_hidden_senders phải điền qr_code cho hàng
// cũ (chặn/ẩn theo sender_uid) từ cuốc mới nhất của uid đó.
class SenderQrCodeBackfillMigrationTest extends TestCase
{
    use RefreshDatabase;

    private const MIGRATION = 'database/migrations/2026_10_12_000001_add_qr_code_to_sender_blocks_and_hidden_senders.php';

    private function ride(string $uid, string $qr, string $postedAt, string $rideUid): void
    {
        FreeRide::create([
            'ride_uid' => $rideUid, 'sender_uid' => $uid, 'qr_code' => $qr, 'zalo_group_id' => 'g',
            'raw_text' => 'x', 'posted_at' => $postedAt, 'expires_at' => now()->addHour(),
        ]);
    }

    public function test_backfills_qr_code_from_latest_ride_and_keeps_unique_per_profile(): void
    {
        $migration = require base_path(self::MIGRATION);
        $migration->down();

        $driver = User::factory()->create(['role' => 'driver']);
        $this->ride('U1', 'QROLD', '2026-10-01 00:00:00', 'r1');
        $this->ride('U1', 'QRX', '2026-10-05 00:00:00', 'r2');
        $this->ride('U2', 'QRX', '2026-10-04 00:00:00', 'r3');
        $now = now();
        DB::table('zalo_sender_blocks')->insert([
            ['sender_uid' => 'U1', 'created_at' => $now, 'updated_at' => $now],
            ['sender_uid' => 'U2', 'created_at' => $now, 'updated_at' => $now], // cùng hồ sơ QRX với U1
            ['sender_uid' => 'NORIDE', 'created_at' => $now, 'updated_at' => $now],
        ]);
        DB::table('driver_hidden_senders')->insert([
            ['driver_id' => $driver->id, 'sender_uid' => 'U2', 'created_at' => $now, 'updated_at' => $now],
            ['driver_id' => $driver->id, 'sender_uid' => 'U1', 'created_at' => $now, 'updated_at' => $now],
        ]);

        $migration->up();

        $blocks = DB::table('zalo_sender_blocks')->pluck('qr_code', 'sender_uid')->all();
        // Hàng đầu tiên của hồ sơ nhận qr_code; hàng trùng hồ sơ giữ qr_code NULL (vẫn chặn theo uid).
        $this->assertSame(['U1' => 'QRX', 'U2' => null, 'NORIDE' => null], $blocks);
        $hidden = DB::table('driver_hidden_senders')->orderBy('id')->pluck('qr_code', 'sender_uid')->all();
        $this->assertSame(['U2' => 'QRX', 'U1' => null], $hidden);

        // Sau migration: cho phép hàng chỉ có qr_code (sender_uid NULL).
        DB::table('zalo_sender_blocks')->insert(['qr_code' => 'QRNEW', 'created_at' => $now, 'updated_at' => $now]);
        DB::table('driver_hidden_senders')->insert(['driver_id' => $driver->id, 'qr_code' => 'QRNEW', 'created_at' => $now, 'updated_at' => $now]);
        $this->assertSame(1, DB::table('zalo_sender_blocks')->whereNull('sender_uid')->count());
    }
}
