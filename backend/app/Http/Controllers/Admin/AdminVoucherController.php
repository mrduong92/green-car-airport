<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Voucher;
use App\Services\VoucherIssuer;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class AdminVoucherController extends Controller
{
    public function __construct(private VoucherIssuer $voucherIssuer) {}

    public function index(): JsonResponse
    {
        $vouchers = Voucher::with('user')->latest()->get()->map(fn ($v) => $this->formatVoucher($v));

        return response()->json($vouchers);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code'        => 'required|string|unique:vouchers,code',
            'type'        => 'required|in:fixed,percent',
            'value'       => 'required|integer|min:1',
            'target'      => 'required|in:all,specific',
            'user_id'     => 'nullable|exists:users,id',
            'expires_at'  => 'required|date|after:today',
            'usage_limit' => 'nullable|integer|min:1',
        ]);

        // target=specific bắt buộc user_id (voucher cấp riêng cho 1 khách); target=all
        // phải không có user_id — trộn hai cái là đúng lỗ hổng đã sửa (xem
        // docs/superpowers/specs/2026-08-10-campaign-voucher-design.md — Phần 1).
        if ($data['target'] === 'specific' && empty($data['user_id'])) {
            throw ValidationException::withMessages([
                'user_id' => 'target=specific bắt buộc chọn khách (user_id).',
            ]);
        }
        if ($data['target'] === 'all' && ! empty($data['user_id'])) {
            throw ValidationException::withMessages([
                'user_id' => 'target=all không được kèm user_id.',
            ]);
        }

        $data['is_active']   = true;
        $data['usage_count'] = 0;

        $voucher = Voucher::create($data);
        $voucher->loadMissing('user');

        return response()->json($this->formatVoucher($voucher), 201);
    }

    /**
     * Cấp voucher cá nhân cho N khách trong một lượt — mỗi khách 1 voucher riêng
     * (mã tự sinh, usage_limit riêng), KHÁC với store() (1 voucher, 1 mã, cho 1 hoặc
     * mọi khách). Dùng lại VoucherIssuer — cùng cơ chế sinh mã chống trùng như
     * campaign/referral, không viết lại Voucher::create() ở đây.
     */
    public function storeBulk(Request $request): JsonResponse
    {
        $data = $request->validate([
            'user_ids'    => 'required|array|min:1',
            'user_ids.*'  => 'integer|exists:users,id',
            'type'        => 'required|in:fixed,percent',
            'value'       => 'required|integer|min:1',
            'expires_at'  => 'required|date|after:today',
            'usage_limit' => 'nullable|integer|min:1',
        ]);

        $users    = User::whereIn('id', $data['user_ids'])->get();
        $vouchers = $users->map(fn (User $user) => $this->voucherIssuer->issue(
            $user,
            'ADM',
            $data['value'],
            Carbon::parse($data['expires_at']),
            null,
            $data['type'],
            $data['usage_limit'] ?? 1,
        ));

        return response()->json(
            $vouchers->map(fn (Voucher $v) => $this->formatVoucher($v->loadMissing('user')))->values(),
            201,
        );
    }

    public function update(Request $request, Voucher $voucher): JsonResponse
    {
        $data = $request->validate([
            'type'        => 'sometimes|in:fixed,percent',
            'value'       => 'sometimes|integer|min:1',
            'target'      => 'sometimes|in:all,specific',
            'user_id'     => 'sometimes|nullable|exists:users,id',
            'expires_at'  => 'sometimes|date|after:today',
            'usage_limit' => 'sometimes|nullable|integer|min:1',
        ]);

        // Ràng buộc chéo target/user_id giống store() — tính trên giá trị SAU khi áp
        // update (field không gửi lên thì giữ giá trị hiện tại của voucher).
        $target = $data['target'] ?? $voucher->target;
        $userId = array_key_exists('user_id', $data) ? $data['user_id'] : $voucher->user_id;

        if ($target === 'specific' && empty($userId)) {
            throw ValidationException::withMessages([
                'user_id' => 'target=specific bắt buộc chọn khách (user_id).',
            ]);
        }
        if ($target === 'all' && ! empty($userId)) {
            throw ValidationException::withMessages([
                'user_id' => 'target=all không được kèm user_id.',
            ]);
        }

        $voucher->update($data);

        return response()->json($this->formatVoucher($voucher->fresh()->loadMissing('user')));
    }

    public function deactivate(Request $request, Voucher $voucher): JsonResponse
    {
        $voucher->update(['is_active' => false]);

        return response()->json($this->formatVoucher($voucher->fresh()->loadMissing('user')));
    }

    private function formatVoucher(Voucher $v): array
    {
        return [
            'id'          => $v->id,
            'code'        => $v->code,
            'type'        => $v->type,
            'value'       => $v->value,
            'target'      => $v->target,
            'user_id'     => $v->user_id,
            'user'        => $v->user ? ['phone' => $v->user->phone, 'name' => $v->user->name] : null,
            'expires_at'  => $v->expires_at,
            'usage_limit' => $v->usage_limit,
            'usage_count' => $v->usage_count,
            'is_active'   => (bool) $v->is_active,
        ];
    }
}
