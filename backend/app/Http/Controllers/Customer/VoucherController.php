<?php

namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Controller;
use App\Models\Voucher;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class VoucherController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $vouchers = Voucher::where('is_active', true)
            ->where('expires_at', '>=', today())
            ->where(fn ($q) => $q->whereNull('usage_limit')->orWhereColumn('usage_count', '<', 'usage_limit'))
            ->whereDoesntHave('bookings', fn ($q) => $q->where('customer_id', $request->user()->id))
            ->orderBy('expires_at')
            ->get()
            ->map(fn ($v) => [
                'id'         => $v->id,
                'code'       => $v->code,
                'type'       => $v->type,
                'value'      => $v->value,
                'expires_at' => $v->expires_at->format('d/m/Y'),
            ]);

        return response()->json($vouchers);
    }

    public function apply(Request $request): JsonResponse
    {
        $request->validate([
            'code'  => 'required|string',
            'price' => 'required|integer|min:0',
        ]);

        $voucher = Voucher::where('code', $request->code)
            ->where('is_active', true)
            ->where('expires_at', '>=', today())
            ->where(fn ($q) => $q->whereNull('usage_limit')->orWhereColumn('usage_count', '<', 'usage_limit'))
            ->first();

        if (! $voucher) {
            return response()->json(['message' => 'Mã giảm giá không hợp lệ hoặc đã hết hạn.'], 422);
        }

        $discount = $voucher->type === 'fixed'
            ? $voucher->value
            : (int) round($request->price * $voucher->value / 100);

        return response()->json([
            'code'     => $voucher->code,
            'type'     => $voucher->type,
            'value'    => $voucher->value,
            'discount' => $discount,
        ]);
    }
}
