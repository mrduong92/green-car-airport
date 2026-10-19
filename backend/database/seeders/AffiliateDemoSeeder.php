<?php

namespace Database\Seeders;

use App\Models\AppSetting;
use App\Models\Booking;
use App\Models\User;
use App\Models\Wallet;
use App\Services\AffiliateService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Dữ liệu demo cho Affiliate (F1, hoàn điểm, hoa hồng) để tự test trên máy dev.
 * KHÔNG nằm trong DatabaseSeeder — chạy tay:
 *   php artisan db:seed --class=AffiliateDemoSeeder
 *
 * Cần sẵn khách 0901234567 và tài xế 0912345678 (UserSeeder). Chỉ chạy một lần: đã có
 * khách demo 0977000001 thì bỏ qua. Không bao giờ chạy trên production.
 *
 * - 0901234567 giới thiệu 5 F1 (0977000001–05), đăng ký rải 3 tháng, mỗi F1 vài chuyến hoàn thành.
 * - 0977000010 (khách khác) giới thiệu 3 F1 (0977000011–13) → admin có 2 người trong top 10.
 * - 0977000020 do TÀI XẾ 0912345678 giới thiệu → không phải F1, không có hoa hồng.
 * - 0901234567 tự đi 2 chuyến → có điểm hoàn của chính mình.
 * Điểm hoàn/hoa hồng tính đúng công thức thật (AffiliateService::rewardPoints, tỷ lệ ở Cài đặt)
 * và ghi vào ví điểm thưởng kèm giao dịch. Ví tài xế không bị đụng.
 * Mọi tài khoản demo đăng nhập bằng PIN 000000.
 */
class AffiliateDemoSeeder extends Seeder
{
    public function run(): void
    {
        if (app()->environment('production')) {
            $this->command?->error('Không chạy seeder demo trên production.');

            return;
        }

        $referrerA = User::where('phone', '0901234567')->where('role', 'customer')->first();
        $driver = User::where('phone', '0912345678')->where('role', 'driver')->first();
        if (! $referrerA || ! $driver) {
            $this->command?->error('Thiếu khách 0901234567 hoặc tài xế 0912345678 — chạy UserSeeder trước.');

            return;
        }
        if (User::where('phone', '0977000001')->exists()) {
            $this->command?->warn('Dữ liệu demo Affiliate đã có (0977000001) — bỏ qua.');

            return;
        }

        DB::transaction(function () use ($referrerA, $driver) {
            $referrerB = $this->customer('0977000010', 'Chị Mai Giới Thiệu', 95, null);

            // [số điện thoại, tên, đăng ký cách đây N ngày, [chuyến: [cách đây N ngày, giá, voucher, điểm dùng]]]
            $f1OfA = [
                ['0977000001', 'Nguyễn Văn An', 2, [[1, 450_000, 0, 0]]],
                ['0977000002', 'Trần Thị Bình', 10, [[8, 600_000, 50_000, 0], [3, 350_000, 0, 20]]],
                ['0977000003', 'Lê Hoàng Cường', 35, [[30, 800_000, 0, 0], [12, 500_000, 50_000, 0], [5, 420_000, 0, 30]]],
                ['0977000004', 'Phạm Thu Dung', 70, [[65, 1_200_000, 100_000, 0], [40, 550_000, 0, 0]]],
                ['0977000005', 'Hoàng Minh Đức', 100, [[95, 380_000, 0, 0]]],
            ];
            $f1OfB = [
                ['0977000011', 'Vũ Thị Hà', 20, [[18, 900_000, 0, 0], [6, 700_000, 50_000, 0]]],
                ['0977000012', 'Đặng Quốc Huy', 50, [[45, 650_000, 0, 0]]],
                ['0977000013', 'Bùi Lan Hương', 5, [[2, 1_500_000, 100_000, 50]]],
            ];

            foreach ([[$referrerA, $f1OfA], [$referrerB, $f1OfB]] as [$referrer, $f1s]) {
                foreach ($f1s as [$phone, $name, $registeredAgo, $trips]) {
                    $f1 = $this->customer($phone, $name, $registeredAgo, $referrer->id);
                    foreach ($trips as $trip) {
                        $this->completedTrip($f1, $driver, ...$trip);
                    }
                }
            }

            // Khách do tài xế giới thiệu: được hoàn điểm cho mình nhưng không ai nhận hoa hồng.
            $byDriver = $this->customer('0977000020', 'Khách Do Tài Xế Giới Thiệu', 15, $driver->id);
            $this->completedTrip($byDriver, $driver, 9, 500_000, 0, 0);

            // Chính 0901234567 đi 2 chuyến → điểm hoàn của mình.
            $this->completedTrip($referrerA, $driver, 20, 650_000, 0, 0);
            $this->completedTrip($referrerA, $driver, 4, 480_000, 50_000, 0);
        });

        $this->command?->info('Đã seed dữ liệu demo Affiliate. Ví điểm thưởng 0901234567: '
            .Wallet::where('user_id', $referrerA->id)->value('reward_points').' điểm.');
    }

    private function customer(string $phone, string $name, int $registeredAgo, ?int $referrerId): User
    {
        $user = User::create([
            'phone' => $phone,
            'name' => $name,
            'password' => Hash::make('000000'),
            'role' => 'customer',
            'referred_by_user_id' => $referrerId,
        ]);
        $at = Carbon::now()->subDays($registeredAgo)->setTime(9, 15);
        User::whereKey($user->id)->toBase()->update(['created_at' => $at, 'updated_at' => $at]);

        return $user->refresh();
    }

    private function completedTrip(User $customer, User $driver, int $daysAgo, int $price, int $discount, int $pointsUsed): void
    {
        $completedAt = Carbon::now()->subDays($daysAgo)->setTime(10, 30);
        $booking = Booking::create([
            'customer_id' => $customer->id,
            'driver_id' => $driver->id,
            'pickup' => 'Phố cổ Hoàn Kiếm, Hà Nội',
            'destination' => 'Sân bay Nội Bài',
            'date' => $completedAt->format('Y-m-d'),
            'time' => '09:00',
            'vehicle_type' => 'sedan_4',
            'distance_km' => 30,
            'price' => $price,
            'discount' => $discount,
            'surcharge' => 0,
            'collection_fee' => 0,
            'points_used' => $pointsUsed,
            'status' => 'completed',
            'note' => 'Dữ liệu demo Affiliate',
        ]);
        $booking->charged_fee_points = $booking->driverFeePoints(AppSetting::appFeeRate());

        $base = $booking->basePrice();
        $cashback = AffiliateService::rewardPoints($base, AppSetting::cashbackPercent());
        $referrer = $customer->referred_by_user_id ? User::find($customer->referred_by_user_id) : null;
        $commission = $referrer && $referrer->role === 'customer'
            ? AffiliateService::rewardPoints($base, AppSetting::commissionPercent())
            : 0;

        Booking::whereKey($booking->id)->toBase()->update([
            'charged_fee_points' => $booking->charged_fee_points,
            'cashback_points' => $cashback,
            'commission_points' => $commission,
            'accepted_at' => $completedAt->copy()->subHours(2),
            'completed_at' => $completedAt,
            'created_at' => $completedAt->copy()->subHours(3),
            'updated_at' => $completedAt,
        ]);

        if ($pointsUsed > 0) {
            // Điểm khách dùng phải có trong ví trước khi trừ — cộng bù trước để ví không âm.
            $wallet = Wallet::lockedFor($customer->id);
            $wallet->creditReward($pointsUsed, 'cashback', "Điểm demo để dùng ở cuốc #{$booking->id}", null);
            $wallet->debitReward($pointsUsed, 'spend', "Dùng điểm cuốc #{$booking->id}", $booking->id);
        }
        Wallet::lockedFor($customer->id)->creditReward($cashback, 'cashback', "Hoàn điểm cuốc #{$booking->id}", $booking->id);
        if ($commission > 0) {
            Wallet::lockedFor($referrer->id)->creditReward($commission, 'commission', "Hoa hồng cuốc #{$booking->id} của bạn bè", $booking->id);
        }

        // Lịch sử ví hiển thị đúng ngày chuyến hoàn thành, không dồn hết vào hôm nay.
        DB::table('wallet_transactions')->where('booking_id', $booking->id)
            ->update(['created_at' => $completedAt, 'updated_at' => $completedAt]);
    }
}
