<?php

namespace App\Console\Commands;

use App\Models\BookingDriverCancellation;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

/**
 * Điền lại booking_driver_cancellations.forfeited_fee_points cho các lần bỏ cuốc TRƯỚC khi cột này
 * có (mặc định 0), dựng lại từ sổ ví điểm của tài xế bỏ cuốc. Heuristic theo mô tả giao dịch nên
 * để ở lệnh riêng (không ở migration): mặc định chỉ in kết quả, `--apply` mới ghi. Chỉ đụng dòng
 * đang = 0, nên chạy lại không sao.
 *
 * Với mỗi lần bỏ, xét giao dịch ví ĐIỂM của tài xế đó gắn booking_id đó, trong ĐÚNG lượt nhận đã
 * bị bỏ: từ giao dịch lúc nhận gần nhất (phí app / app bù / thu hộ / phí phạt) trước thời điểm bỏ,
 * và sau lần bỏ trước của cùng cuốc — cuốc bị bỏ nhiều lần thì mỗi lần một lượt nhận riêng.
 *   giữ lại = phí trừ lúc nhận + phần miễn thu thêm + phần bù thu lại − phần app bù − phí đã hoàn
 * (thu hộ / phí phạt tạm giữ được hoàn lại nên không tính) — đúng công thức refundAcceptCharges().
 */
class BackfillDropFees extends Command
{
    protected $signature = 'affiliate:backfill-drop-fees {--apply : Ghi vào DB (mặc định chỉ in kết quả)}';

    protected $description = 'Điền forfeited_fee_points cho các lần tài xế bỏ cuốc cũ từ sổ ví (dry-run mặc định)';

    /** Giao dịch lúc bỏ cuốc ghi cùng transaction với dòng log, có thể lệch vài giây. */
    private const DROP_TOLERANCE_SECONDS = 5;

    /** Tiền tố mô tả => dấu khi tính phần app giữ lại. */
    private const KEPT = [
        'debit' => ['Phí app ' => 1, 'Thu phần phí app đã miễn' => 1, 'Thu lại phần app bù' => 1],
        'credit' => ['App bù phần điểm khách dùng vượt phí' => -1, 'Hoàn phí app' => -1],
    ];

    /** Giao dịch ghi lúc NHẬN cuốc — đánh dấu đầu lượt nhận. */
    private const ACCEPT_MARKERS = [
        'debit' => ['Phí app ', 'Thu hộ cuốc', 'Phí phạt huỷ khách cuốc'],
        'credit' => ['App bù phần điểm khách dùng vượt phí'],
    ];

    public function handle(): int
    {
        $apply = (bool) $this->option('apply');
        $scanned = $changed = $totalPoints = 0;
        $rows = [];

        $drops = BookingDriverCancellation::orderBy('booking_id')->orderBy('cancelled_at')->orderBy('id')->get();

        foreach ($drops->groupBy('booking_id') as $bookingDrops) {
            $previousDropAt = null;
            foreach ($bookingDrops as $drop) {
                if ((int) $drop->forfeited_fee_points === 0) {
                    $scanned++;
                    $kept = $this->keptFor($drop, $previousDropAt);
                    if ($kept !== 0) {
                        $changed++;
                        $totalPoints += $kept;
                        $rows[] = [$drop->id, $drop->booking_id, $drop->driver_id, $drop->cancelled_at->toDateTimeString(), $kept];
                        if ($apply) {
                            BookingDriverCancellation::whereKey($drop->id)->where('forfeited_fee_points', 0)
                                ->update(['forfeited_fee_points' => $kept]);
                        }
                    }
                }
                $previousDropAt = $drop->cancelled_at;
            }
        }

        if ($rows) {
            $this->table(['log id', 'booking', 'tài xế', 'bỏ lúc', 'điểm giữ lại'], $rows);
        }
        $this->info(sprintf(
            '%s: xét %d dòng = 0, %d dòng %s, tổng %d điểm (%s đ).',
            $apply ? 'ĐÃ GHI' : 'DRY-RUN',
            $scanned,
            $changed,
            $apply ? 'đã cập nhật' : 'sẽ cập nhật',
            $totalPoints,
            number_format($totalPoints * 1000, 0, ',', '.'),
        ));
        if (! $apply && $changed > 0) {
            $this->line('Chạy lại với --apply để ghi.');
        }

        return self::SUCCESS;
    }

    private function keptFor(BookingDriverCancellation $drop, ?Carbon $previousDropAt): int
    {
        $walletId = Wallet::where('user_id', $drop->driver_id)->value('id');
        if (! $walletId) {
            return 0;
        }

        $txs = WalletTransaction::where('wallet_id', $walletId)
            ->where('booking_id', $drop->booking_id)
            ->where(fn ($q) => $q->whereNull('balance')->orWhere('balance', 'points'))
            ->when($previousDropAt, fn ($q) => $q->where('created_at', '>', $previousDropAt))
            ->where('created_at', '<=', $drop->cancelled_at->copy()->addSeconds(self::DROP_TOLERANCE_SECONDS))
            ->orderBy('created_at')->orderBy('id')
            ->get();

        // Đầu lượt nhận = giao dịch nhận cuốc muộn nhất không sau thời điểm bỏ.
        $start = $txs->filter(fn ($t) => $t->created_at <= $drop->cancelled_at && $this->matches($t, self::ACCEPT_MARKERS))
            ->max('created_at');
        if ($start) {
            $txs = $txs->filter(fn ($t) => $t->created_at >= $start);
        }

        $kept = 0;
        foreach ($txs as $t) {
            foreach (self::KEPT[$t->type] ?? [] as $prefix => $sign) {
                if (str_starts_with($t->description, $prefix)) {
                    $kept += $sign * (int) $t->points;
                    break;
                }
            }
        }

        return $kept;
    }

    /** @param array<string, list<string>> $prefixes */
    private function matches(WalletTransaction $t, array $prefixes): bool
    {
        foreach ($prefixes[$t->type] ?? [] as $prefix) {
            if (str_starts_with($t->description, $prefix)) {
                return true;
            }
        }

        return false;
    }
}
