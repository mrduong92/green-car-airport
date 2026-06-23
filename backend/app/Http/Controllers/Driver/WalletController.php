<?php

namespace App\Http\Controllers\Driver;

use App\Http\Controllers\Controller;
use App\Models\SepayWebhookEvent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WalletController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $wallet = $request->user()->wallet()->firstOrCreate(
            ['user_id' => $request->user()->id],
            ['points'  => 0],
        );

        return response()->json([
            'points'         => $wallet->points,
            'equivalent_vnd' => $wallet->points * 1000,
        ]);
    }

    public function transactions(Request $request): JsonResponse
    {
        $wallet = $request->user()->wallet;

        if (! $wallet) {
            return response()->json([]);
        }

        $txns = $wallet->transactions()
            ->latest()
            ->get()
            ->map(fn ($t) => [
                'id'          => $t->id,
                'type'        => $t->type,
                'description' => $t->description,
                'points'      => $t->points,
                'created_at'  => $t->created_at?->toISOString(),
            ]);

        return response()->json($txns);
    }

    public function topupInfo(Request $request): JsonResponse
    {
        $user    = $request->user();
        $profile = $user->driverProfile;
        $code    = $profile?->payment_code ?? (config('app.code_prefix') . str_pad((string) $user->id, 6, '0', STR_PAD_LEFT));

        $bankCode      = (string) config('sepay.bank.bank_code', 'VCB');
        $accountNumber = (string) config('sepay.bank.account_number', '');
        $accountHolder = (string) config('sepay.bank.account_holder', '');

        $qrUrl = null;
        if ($accountNumber !== '') {
            $qrUrl = sprintf(
                'https://img.vietqr.io/image/%s-%s-compact2.png?addInfo=%s&accountName=%s',
                $bankCode,
                $accountNumber,
                urlencode($code),
                urlencode($accountHolder),
            );
        }

        return response()->json([
            'bank' => [
                'name'           => config('sepay.bank.name'),
                'account_number' => $accountNumber,
                'account_holder' => $accountHolder,
            ],
            'payment_code'      => $code,
            'min_amount_vnd'    => (int) config('sepay.min_amount_vnd', 10000),
            'suggested_amounts' => config('sepay.suggested_amounts', [50000, 100000, 200000, 500000]),
            'qr_template_url'   => $qrUrl,
        ]);
    }

    public function topups(Request $request): JsonResponse
    {
        $events = SepayWebhookEvent::where('matched_user_id', $request->user()->id)
            ->latest('transaction_date')
            ->limit(20)
            ->get()
            ->map(fn (SepayWebhookEvent $e) => [
                'id'               => $e->id,
                'amount_vnd'       => $e->amount,
                'points_credited'  => $e->status === 'processed' ? intdiv($e->amount, 1000) : 0,
                'status'           => $e->status,
                'gateway'          => $e->gateway,
                'reference_code'   => $e->reference_code,
                'transaction_date' => $e->transaction_date?->toISOString(),
            ]);

        return response()->json($events);
    }
}
