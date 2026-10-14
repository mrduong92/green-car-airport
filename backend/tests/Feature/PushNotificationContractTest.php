<?php
// backend/tests/Feature/PushNotificationContractTest.php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * Chặn notification mới (hoặc nhánh merge sau, vd Cuốc Free) quay lại dùng
 * WebPushChannel/toWebPush — app native sẽ không bao giờ nhận được loại đó.
 */
class PushNotificationContractTest extends TestCase
{
    public function test_khong_notification_nao_con_dung_web_push_cu(): void
    {
        foreach (glob(app_path('Notifications/*.php')) as $file) {
            $src = file_get_contents($file);
            $this->assertStringNotContainsString('WebPushChannel', $src, basename($file));
            $this->assertStringNotContainsString('toWebPush', $src, basename($file));
        }
        $this->assertFileDoesNotExist(app_path('Channels/WebPushChannel.php'));
    }
}
