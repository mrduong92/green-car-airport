<?php
// backend/tests/Feature/FcmSenderBindingTest.php

namespace Tests\Feature;

use App\Services\Fcm\FcmSender;
use App\Services\Fcm\NullFcmSender;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

class FcmSenderBindingTest extends TestCase
{
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
}
