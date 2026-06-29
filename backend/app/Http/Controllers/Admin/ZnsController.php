<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\Zns\ZnsSender;
use Illuminate\Http\JsonResponse;

class ZnsController extends Controller
{
    public function balance(ZnsSender $zns): JsonResponse
    {
        return response()->json(['balance' => $zns->getBalance()]);
    }
}
