<?php

namespace App\Console\Commands;

use App\Exceptions\AccountDeletionBlocked;
use App\Models\User;
use App\Services\AccountDeletionService;
use App\Support\PhoneNumber;
use Illuminate\Console\Command;

/** Admin xoá giúp sau khi đã quyết toán ví / gỡ khoá / xử lý nợ (spec mục 3). */
class DeleteAccount extends Command
{
    protected $signature = 'account:delete {phone} {role : customer|driver}
        {--force : Bỏ qua chặn "đang bị khoá" và "nợ phí phạt" (cuốc dở và ví > 0 vẫn chặn)}';

    protected $description = 'Xoá (ẩn danh hoá) tài khoản khách/tài xế theo yêu cầu của người dùng';

    public function handle(AccountDeletionService $service): int
    {
        $role = $this->argument('role');
        if (! in_array($role, ['customer', 'driver'], true)) {
            $this->error('Role phải là customer hoặc driver.');

            return self::FAILURE;
        }

        $phone = PhoneNumber::normalize($this->argument('phone'));
        $user = User::where('phone', $phone)->where('role', $role)->whereNull('deleted_at')->first();
        if (! $user) {
            $this->error('Không tìm thấy tài khoản.');

            return self::FAILURE;
        }

        $force = (bool) $this->option('force');
        $reason = $service->blockingReason($user, $force);
        if ($reason !== null) {
            $this->error($reason);

            return self::FAILURE;
        }

        if (! $this->confirm("Xoá tài khoản #{$user->id} {$user->name} ({$user->phone}, {$role})? Không thể khôi phục.")) {
            return self::FAILURE;
        }

        try {
            $service->delete($user, $force);
        } catch (AccountDeletionBlocked $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $this->info("Đã xoá tài khoản #{$user->id}.");

        return self::SUCCESS;
    }
}
