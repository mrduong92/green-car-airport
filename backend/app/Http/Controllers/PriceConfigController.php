<?php

namespace App\Http\Controllers;

use App\Models\PriceConfig;
use Illuminate\Http\JsonResponse;

class PriceConfigController extends Controller
{
    public function index(): JsonResponse
    {
        $configs = PriceConfig::where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        return response()->json($configs);
    }
}
