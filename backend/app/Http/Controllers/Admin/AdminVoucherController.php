<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Voucher;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminVoucherController extends Controller
{
    public function index(): JsonResponse
    {
        $vouchers = Voucher::latest()->get()->map(fn ($v) => $this->formatVoucher($v));

        return response()->json($vouchers);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code'        => 'required|string|unique:vouchers,code',
            'type'        => 'required|in:fixed,percent',
            'value'       => 'required|integer|min:1',
            'target'      => 'nullable|in:all,specific',
            'expires_at'  => 'required|date|after:today',
            'usage_limit' => 'nullable|integer|min:1',
        ]);

        $data['target']    ??= 'all';
        $data['is_active']   = true;
        $data['usage_count'] = 0;

        $voucher = Voucher::create($data);

        return response()->json($this->formatVoucher($voucher), 201);
    }

    public function deactivate(Request $request, Voucher $voucher): JsonResponse
    {
        $voucher->update(['is_active' => false]);

        return response()->json($this->formatVoucher($voucher->fresh()));
    }

    private function formatVoucher(Voucher $v): array
    {
        return [
            'id'          => $v->id,
            'code'        => $v->code,
            'type'        => $v->type,
            'value'       => $v->value,
            'target'      => $v->target,
            'expires_at'  => $v->expires_at,
            'usage_limit' => $v->usage_limit,
            'usage_count' => $v->usage_count,
            'is_active'   => (bool) $v->is_active,
        ];
    }
}
