<?php
// backend/tests/Feature/FcmSenderBindingTest.php

namespace Tests\Feature;

use App\Channels\Push\FcmTransport;
use App\Models\DeviceToken;
use App\Models\User;
use App\Services\Fcm\FcmSender;
use App\Services\Fcm\NullFcmSender;
use Illuminate\Support\Facades\Log;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FcmSenderBindingTest extends TestCase
{
    use RefreshDatabase;

    public function test_chua_cau_hinh_firebase_thi_dung_null_sender(): void
    {
        config(['services.firebase.credentials' => null]);

        $this->assertInstanceOf(NullFcmSender::class, app(FcmSender::class));
    }

    public function test_null_sender_khong_gui_khong_xoa_token_va_co_log(): void
    {
        Log::spy();

        $result = (new NullFcmSender())->send(['t1', 't2'], ['notification' => ['title' => 'x']]);

        $this->assertSame([], $result->delivered);
        $this->assertSame([], $result->invalid);
        Log::shouldHaveReceived('warning')->once();
    }

    /**
     * Đặt sai đường dẫn file service account là chuyện dễ xảy ra khi deploy.
     * Hậu quả không được vượt khỏi FCM: request đặt xe vẫn phải thành công,
     * Web Push vẫn phải gửi, token không bị xoá oan.
     */
    public function test_file_credentials_sai_chi_ghi_log_khong_vo_luong_khac(): void
    {
        config(['services.firebase.credentials' => '/khong/ton/tai.json']);
        $user = User::factory()->create(['role' => 'driver']);
        DeviceToken::create(['user_id' => $user->id, 'fcm_token' => 'fcm-x', 'platform' => 'android']);

        $sender = app(FcmSender::class);
        (new FcmTransport($sender))->send(DeviceToken::all(), ['title' => 'T', 'body' => 'B', 'data' => []]);

        $this->assertDatabaseHas('device_tokens', ['fcm_token' => 'fcm-x']);
    }
}
