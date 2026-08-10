<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Voucher;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class AdminVoucherController extends Controller
{
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
