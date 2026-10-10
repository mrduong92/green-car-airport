<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Wallet extends Model
{
    protected $fillable = ['user_id', 'points'];

    public function user() { return $this->belongsTo(User::class); }
    public function transactions() { return $this->hasMany(WalletTransaction::class); }

    /** Ví của user (tạo nếu chưa có), đã khoá dòng — gọi trong transaction. */
    public static function lockedFor(int $userId): self
    {
        $wallet = static::firstOrCreate(['user_id' => $userId], ['points' => 0]);

        return static::lockForUpdate()->find($wallet->id);
    }

    /**
     * Trừ điểm + ghi sổ. Người gọi phải kiểm số dư trước: cột `points` UNSIGNED,
     * trừ quá số dư là SQL nổ.
     */
    public function debit(int $points, string $description, ?int $bookingId = null): void
    {
        $this->record('debit', $points, $description, $bookingId);
    }

    public function credit(int $points, string $description, ?int $bookingId = null): void
    {
        $this->record('credit', $points, $description, $bookingId);
    }

    private function record(string $type, int $points, string $description, ?int $bookingId): void
    {
        if ($points <= 0) {
            return;
        }

        $type === 'debit' ? $this->decrement('points', $points) : $this->increment('points', $points);

        WalletTransaction::create([
            'wallet_id' => $this->id,
            'booking_id' => $bookingId,
            'type' => $type,
            'description' => $description,
            'points' => $points,
        ]);
    }
}
