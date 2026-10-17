<?php

namespace App\Services;

use App\Exceptions\AccountDeletionBlocked;
use App\Models\Booking;
use App\Models\CampaignGrant;
use App\Models\DeviceToken;
use App\Models\DriverFreeRideAlert;
use App\Models\DriverHiddenSender;
use App\Models\DriverProfile;
use App\Models\FreeRide;
use App\Models\FreeRideReport;
use App\Models\Otp;
use App\Models\SepayWebhookEvent;
use App\Models\User;
use App\Models\Voucher;
use App\Models\Wallet;
use App\Notifications\BookingAcceptedNotification;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Xoá tài khoản = ẩn danh hoá tại chỗ (spec 2026-10-14-account-deletion-design.md).
 * Giữ dòng users để cuốc/giao dịch của NGƯỜI KHÁC và doanh thu không bị sai.
 */
class AccountDeletionService
{
    public const DELETED_NAME = 'Người dùng đã xoá';

    private const CUSTOMER_OPEN = ['finding_driver', 'accepted', 'picking_up', 'in_progress'];

    private const DRIVER_OPEN = ['accepted', 'picking_up', 'in_progress'];

    /**
     * Lý do không được xoá, hoặc null. Cuốc dở dang và ví > 0 luôn chặn; `$ignoreHolds`
     * (admin xoá giúp) chỉ bỏ qua bị khoá và nợ phí phạt.
     */
    public function blockingReason(User $user, bool $ignoreHolds = false): ?string
    {
        $hasOpenTrip = Booking::where(fn ($q) => $q
            ->where(fn ($q2) => $q2->where('customer_id', $user->id)->whereIn('status', self::CUSTOMER_OPEN))
            ->orWhere(fn ($q2) => $q2->where('driver_id', $user->id)->whereIn('status', self::DRIVER_OPEN)))
            ->exists();
        if ($hasOpenTrip) {
            return 'Bạn còn cuốc chưa hoàn thành. Vui lòng hoàn thành hoặc huỷ cuốc trước khi xoá tài khoản.';
        }

        $points = (int) Wallet::where('user_id', $user->id)->value('points');
        if ($points > 0) {
            return 'Ví của bạn còn '.number_format($points, 0, ',', '.').' điểm. Vui lòng liên hệ admin để quyết toán trước khi xoá tài khoản.';
        }

        if ($ignoreHolds) {
            return null;
        }

        if ($user->is_blocked || $user->driverProfile?->status === 'blocked') {
            return 'Tài khoản đang bị khoá. Vui lòng liên hệ admin.';
        }
        if ($user->pending_penalty > 0) {
            return 'Bạn còn phí phạt huỷ cuốc chưa thanh toán. Vui lòng liên hệ admin.';
        }

        return null;
    }

    public function delete(User $user, bool $ignoreHolds = false): void
    {
        DB::transaction(function () use ($user, $ignoreHolds) {
            // Khoá rồi mới kiểm lại: không để điểm/cuốc mới chen vào giữa lúc kiểm và lúc xoá.
            $user = User::lockForUpdate()->findOrFail($user->id);
            Wallet::where('user_id', $user->id)->lockForUpdate()->first();
            if ($user->isDeleted()) {
                return;
            }

            $reason = $this->blockingReason($user, $ignoreHolds);
            if ($reason !== null) {
                throw new AccountDeletionBlocked($reason);
            }

            DriverProfile::where('user_id', $user->id)->delete();
            $user->tokens()->delete();
            DeviceToken::where('user_id', $user->id)->delete();
            $user->notifications()->delete();
            // OTP không ghi vai trò: cùng số còn tài khoản khác (đang đăng ký tài xế…) thì để yên.
            $phoneShared = User::where('phone', $user->phone)->whereKeyNot($user->id)->exists();
            if (! $phoneShared) {
                Otp::where('phone', $user->phone)->delete();
            }
            DriverFreeRideAlert::where('driver_id', $user->id)->delete();
            DriverHiddenSender::where('driver_id', $user->id)->delete();
            FreeRideReport::where('driver_id', $user->id)->delete();
            // Cuốc đã đăng ở tab Free: gỡ khỏi danh sách và bỏ tên thật.
            FreeRide::where('posted_by_user_id', $user->id)->whereNull('closed_at')->update(['closed_at' => now()]);
            FreeRide::where('posted_by_user_id', $user->id)->update(['sender_name' => self::DELETED_NAME]);
            Voucher::where('user_id', $user->id)->doesntHave('bookings')->delete();
            // Giữ SĐT trong khuyến mãi đã nhận (chặn đăng ký lại để nhận lại ưu đãi người mới)
            // nhưng cắt liên kết với id — nếu không, ghép id là ra SĐT thật của tài khoản đã xoá.
            CampaignGrant::where('user_id', $user->id)->update(['user_id' => null]);
            // Khách hay ghi SĐT/tên vào ghi chú cuốc.
            Booking::where('customer_id', $user->id)->whereNotNull('note')->update(['note' => null]);
            $this->scrubDriverNameFromCustomerNotifications($user);
            $this->maskPhoneInBankTransfers($user);

            $user->forceFill([
                'name' => self::DELETED_NAME,
                'phone' => "deleted-{$user->id}",
                'password' => Hash::make(Str::random(64)),
                'referral_code' => null,
                'is_collaborator' => false,
                'deleted_at' => now(),
            ])->save();
        });
    }

    /** Thông báo "{tên tài xế} đang trên đường đến đón bạn" nằm trong hộp thư của KHÁCH. */
    private function scrubDriverNameFromCustomerNotifications(User $driver): void
    {
        $trips = Booking::where('driver_id', $driver->id)->pluck('customer_id', 'id');
        if ($trips->isEmpty()) {
            return;
        }

        DatabaseNotification::where('type', BookingAcceptedNotification::class)
            ->where('notifiable_type', User::class)
            ->whereIn('notifiable_id', $trips->unique()->values())
            ->get()
            ->filter(fn ($n) => $trips->has($n->data['booking_id'] ?? 0))
            ->each(fn ($n) => $n->update(['data' => [...$n->data, 'body' => 'Tài xế đang trên đường đến đón bạn']]));
    }

    /**
     * Sao kê SePay giữ làm chứng từ (số tiền, thời gian, mã giao dịch) nhưng che SĐT:
     * nội dung CK mở khoá Free là `MOKHOA <sđt>`.
     */
    private function maskPhoneInBankTransfers(User $user): void
    {
        $digits = ltrim(preg_replace('/\D/', '', $user->phone), '0');
        if (strlen($digits) < 8) {
            return;
        }
        $pattern = '/(?:\+?84|0)?'.$digits.'/';
        $mask = fn ($v) => is_string($v) ? preg_replace($pattern, '***', $v) : $v;

        SepayWebhookEvent::where('matched_user_id', $user->id)
            ->orWhere('content', 'like', "%{$digits}%")
            ->orWhere('description', 'like', "%{$digits}%")
            ->get()
            ->each(function (SepayWebhookEvent $e) use ($mask) {
                $payload = $e->raw_payload ?? [];
                array_walk_recursive($payload, function (&$v) use ($mask) {
                    $v = $mask($v);
                });
                $e->update([
                    'content' => $mask($e->content),
                    'description' => $mask($e->description),
                    'raw_payload' => $payload,
                ]);
            });
    }
}
