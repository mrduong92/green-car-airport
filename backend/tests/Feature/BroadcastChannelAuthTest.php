<?php

// backend/tests/Feature/BroadcastChannelAuthTest.php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Broadcast;
use Tests\TestCase;

/**
 * Phân quyền subscribe kênh private của Reverb.
 *
 * Kênh WebSocket không đi qua middleware của route API — ai cũng mở được kết nối
 * tới Reverb. Thứ duy nhất chặn là callback trong routes/channels.php, nên nó
 * PHẢI có test: sai ở đây là khách hàng nghe được trạng thái chuyến của khách
 * khác, hoặc người ngoài theo dõi được mọi cuốc phát sinh trong hệ thống.
 */
class BroadcastChannelAuthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // ⚠️ BẮT BUỘC, và cần ĐÚNG HAI bước.
        //
        // 1. phpunit.xml đặt BROADCAST_CONNECTION=null. Null broadcaster có
        //    auth() trả về null và KHÔNG BAO GIỜ throw → mọi request ra 200,
        //    cả assert "cho phép" lẫn "từ chối" đều xanh một cách vô nghĩa.
        // 2. Nhưng chỉ đổi config là chưa đủ: callback kênh được đăng ký vào
        //    INSTANCE broadcaster lúc boot (tức driver null). Đổi driver sẽ tạo
        //    instance mới RỖNG, không pattern nào khớp → mọi kênh đều 403, lần
        //    này thì test "phải 403" lại xanh vì lý do sai. Phải nạp lại
        //    routes/channels.php lên driver mới.
        //
        // (Auth chỉ ký chữ ký tại chỗ, không cần kết nối tới server Reverb.)
        config(['broadcasting.default' => 'reverb']);
        Broadcast::purge('null');
        require base_path('routes/channels.php');
    }

    /**
     * Xác thực bằng token Sanctum THẬT chứ không dùng actingAs(): broadcaster
     * resolve user qua $request->user() theo guard mặc định, còn actingAs chỉ
     * gắn user vào guard của test — kết quả là mọi kênh đều bị từ chối và test
     * "phải 403" vẫn xanh vì lý do sai. Dùng token thật là đi đúng đường mà
     * trình duyệt đi.
     */
    private function authorize(User $user, string $channel)
    {
        $token = $user->createToken('test')->plainTextToken;

        return $this->withHeader('Authorization', 'Bearer '.$token)
            ->postJson('/api/broadcasting/auth', [
                'socket_id' => '1234.5678',
                'channel_name' => $channel,
            ]);
    }

    public function test_driver_can_subscribe_to_driver_trips(): void
    {
        $driver = User::factory()->create(['role' => 'driver']);

        $this->authorize($driver, 'private-driver.trips')->assertOk();
    }

    public function test_customer_cannot_subscribe_to_driver_trips(): void
    {
        $customer = User::factory()->create(['role' => 'customer']);

        $this->authorize($customer, 'private-driver.trips')->assertForbidden();
    }

    public function test_customer_can_subscribe_to_own_channel(): void
    {
        $customer = User::factory()->create(['role' => 'customer']);

        $this->authorize($customer, 'private-customer.'.$customer->id)->assertOk();
    }

    public function test_customer_cannot_subscribe_to_another_customers_channel(): void
    {
        $me = User::factory()->create(['role' => 'customer']);
        $someone = User::factory()->create(['role' => 'customer']);

        $this->authorize($me, 'private-customer.'.$someone->id)->assertForbidden();
    }

    public function test_driver_cannot_snoop_on_a_customer_channel(): void
    {
        $driver = User::factory()->create(['role' => 'driver']);
        $customer = User::factory()->create(['role' => 'customer']);

        $this->authorize($driver, 'private-customer.'.$customer->id)->assertForbidden();
    }

    public function test_unauthenticated_request_is_rejected(): void
    {
        $this->postJson('/api/broadcasting/auth', [
            'socket_id' => '1234.5678',
            'channel_name' => 'private-driver.trips',
        ])->assertUnauthorized();
    }
}
