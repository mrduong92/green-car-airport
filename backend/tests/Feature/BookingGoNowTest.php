<?php
// backend/tests/Feature/BookingGoNowTest.php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * "Đi ngay" (mặc định trên form đặt xe) gửi giờ đón = lúc bấm. Từ 09/08/2026 frontend có nút
 * này nhưng backend vẫn áp quy tắc "đặt hôm nay phải cách ≥ 30 phút" cho mọi cuốc → mọi cuốc
 * đi ngay bị 422, khách chỉ đặt được nếu tự chuyển sang Hẹn giờ.
 */
class BookingGoNowTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Carbon::setTestNow(Carbon::parse('2026-10-14 10:07:30', 'Asia/Ho_Chi_Minh'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function payload(array $extra = []): array
    {
        return array_merge([
            'pickup' => 'Hà Nội',
            'destination' => 'Sân bay Nội Bài',
            'distance_km' => 30,
            'price' => 500_000,
            'vehicle_type' => 'sedan_4',
        ], $extra);
    }

    private function customer(): User
    {
        return User::factory()->create(['role' => 'customer']);
    }

    public function test_di_ngay_duoc_nhan_va_lay_gio_server(): void
    {
        // Máy khách lệch giờ / gửi giờ cũ — server vẫn ghi giờ của chính nó.
        $res = $this->actingAs($this->customer(), 'sanctum')
            ->postJson('/api/bookings', $this->payload(['go_now' => true, 'date' => '2026-10-14', 'time' => '09:00']))
            ->assertCreated();

        $this->assertSame('2026-10-14', $res->json('date'));
        $this->assertSame('10:07', $res->json('time'));
    }

    public function test_di_ngay_khong_can_gui_ngay_gio(): void
    {
        $this->actingAs($this->customer(), 'sanctum')
            ->postJson('/api/bookings', $this->payload(['go_now' => true]))
            ->assertCreated()
            ->assertJsonPath('time', '10:07');
    }

    public function test_di_ngay_khi_may_khach_con_o_ngay_hom_qua(): void
    {
        // 23:59 trên máy khách, 00:00 trên server → ngày "hôm qua" không được làm hỏng cuốc đi ngay.
        $this->actingAs($this->customer(), 'sanctum')
            ->postJson('/api/bookings', $this->payload(['go_now' => true, 'date' => '2026-10-13', 'time' => '23:59']))
            ->assertCreated()
            ->assertJsonPath('date', '2026-10-14');
    }

    public function test_hen_gio_hom_nay_duoi_30_phut_van_bi_chan(): void
    {
        $this->actingAs($this->customer(), 'sanctum')
            ->postJson('/api/bookings', $this->payload(['date' => '2026-10-14', 'time' => '10:30']))
            ->assertStatus(422)
            ->assertJsonPath('message', 'Giờ đón phải cách ít nhất 30 phút so với thời điểm đặt xe.');
    }

    public function test_hen_gio_hom_nay_tu_30_phut_tro_len_duoc_nhan(): void
    {
        $this->actingAs($this->customer(), 'sanctum')
            ->postJson('/api/bookings', $this->payload(['date' => '2026-10-14', 'time' => '11:00']))
            ->assertCreated();
    }

    public function test_go_now_false_van_ap_quy_tac_30_phut(): void
    {
        $this->actingAs($this->customer(), 'sanctum')
            ->postJson('/api/bookings', $this->payload(['go_now' => false, 'date' => '2026-10-14', 'time' => '10:08']))
            ->assertStatus(422);
    }
}
