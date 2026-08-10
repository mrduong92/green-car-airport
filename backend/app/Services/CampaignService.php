<?php
// backend/app/Services/CampaignService.php
namespace App\Services;

use App\Models\Campaign;
use App\Models\CampaignGrant;
use App\Models\User;
use App\Support\CampaignTrigger;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class CampaignService
{
    public function __construct(private VoucherIssuer $voucherIssuer) {}

    public function runOnCustomerRegistered(User $user): void
    {
        $campaigns = Campaign::where('trigger', CampaignTrigger::CUSTOMER_REGISTERED)->get();

        foreach ($campaigns as $campaign) {
            if ($this->eligible($campaign, $user)) {
                $this->grant($campaign, $user);
            }
        }
    }

    /** Tách khỏi grant() có chủ đích — đây là chỗ duy nhất cần sửa khi thêm điều kiện lọc theo thuộc tính khách. */
    public function eligible(Campaign $campaign, User $user): bool
    {
        if (! $campaign->is_active) return false;
        if ($campaign->starts_at?->isFuture()) return false;
        if ($campaign->ends_at?->isPast()) return false;

        // conditions (json) chưa dùng — xem spec "Mở rộng sau này".

        return true;
    }

    private function grant(Campaign $campaign, User $user): void
    {
        try {
            DB::transaction(function () use ($campaign, $user) {
                // UPDATE có điều kiện, nguyên tử — "kiểm còn suất" và "chiếm suất" là
                // MỘT thao tác duy nhất, không có khe hở cho 2 request đồng thời.
                $claimed = Campaign::where('id', $campaign->id)
                    ->where('is_active', true)
                    ->where(fn ($q) => $q->whereNull('max_grants')->orWhereColumn('grants_count', '<', 'max_grants'))
                    ->increment('grants_count');

                if ($claimed === 0) return; // hết trần, hoặc vừa bị tắt giữa lúc chạy

                CampaignGrant::create([
                    'campaign_id' => $campaign->id,
                    'user_id'     => $user->id,
                    'phone'       => $user->phone,
                    'granted_at'  => now(),
                ]);

                $reward = $campaign->reward;
                for ($i = 0; $i < $reward['voucher_count']; $i++) {
                    $this->voucherIssuer->issue(
                        $user,
                        'CAMP',
                        $reward['voucher_value'],
                        now()->addDays($reward['voucher_expires_days']),
                        $campaign->id,
                    );
                }
            });
        } catch (UniqueConstraintViolationException) {
            // Đã nhận rồi (cùng SĐT, kể cả tài khoản cũ đã xoá) — bình thường, bỏ qua lặng lẽ.
        } catch (\Throwable $e) {
            // Lỗi phát thưởng KHÔNG BAO GIỜ được làm hỏng việc đăng ký — log đủ rõ để
            // admin cấp tay bù qua AdminVoucherController.
            Log::error('[Campaign] phát thưởng thất bại', [
                'campaign_id' => $campaign->id,
                'user_id'     => $user->id,
                'error'       => $e->getMessage(),
            ]);
        }
    }
}
