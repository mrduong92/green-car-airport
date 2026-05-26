<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SepayWebhookEvent extends Model
{
    protected $fillable = [
        'sepay_id', 'gateway', 'account_number', 'sub_account',
        'code', 'content', 'transfer_type', 'description',
        'amount', 'accumulated', 'reference_code', 'transaction_date',
        'status', 'matched_user_id', 'wallet_transaction_id', 'raw_payload',
    ];

    protected $casts = [
        'raw_payload'      => 'array',
        'transaction_date' => 'datetime',
        'amount'           => 'integer',
        'accumulated'      => 'integer',
        'sepay_id'         => 'integer',
    ];

    public function driver()
    {
        return $this->belongsTo(User::class, 'matched_user_id');
    }

    public function walletTransaction()
    {
        return $this->belongsTo(WalletTransaction::class);
    }
}
