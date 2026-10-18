<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\PriceConfig;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PriceConfigController extends Controller
{
    public function index(): JsonResponse
    {
        $configs = PriceConfig::orderBy('sort_order')->orderBy('id')->get();
        return response()->json($configs);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'service_type' => [
                'required', 'in:airport,provincial',
                Rule::unique('price_configs')
                    ->where('is_active', true)
                    ->where('trip_type', $request->trip_type)
                    ->where('vehicle_type', $request->vehicle_type)
                    ->where('price_type', $request->price_type),
            ],
            'trip_type'    => 'required|in:one_way,round_trip',
            'vehicle_type' => 'required|in:sedan_4,suv_5,mpv_7',
            'price_type'   => 'required|in:range,per_km',
            'min_price'    => 'required|integer|min:1',
            'max_price'    => 'required|integer|gte:min_price',
            'sort_order'   => 'integer|min:0',
        ], [
            'service_type.unique' => 'Đã có bảng giá đang hiển thị cho tổ hợp dịch vụ/loại xe/cách tính giá này.',
        ]);

        $config = PriceConfig::create($data);
        return response()->json($config, 201);
    }

    public function update(Request $request, PriceConfig $priceConfig): JsonResponse
    {
        $data = $request->validate([
            'service_type' => 'sometimes|in:airport,provincial',
            'trip_type'    => 'sometimes|in:one_way,round_trip',
            'vehicle_type' => 'sometimes|in:sedan_4,suv_5,mpv_7',
            'price_type'   => 'sometimes|in:range,per_km',
            'min_price'    => 'sometimes|integer|min:1',
            'max_price'    => 'sometimes|integer|min:1',
            'is_active'    => 'sometimes|boolean',
            'sort_order'   => 'sometimes|integer|min:0',
        ]);

        $priceConfig->update($data);
        return response()->json($priceConfig->fresh());
    }

    public function destroy(PriceConfig $priceConfig): JsonResponse
    {
        $priceConfig->update(['is_active' => false]);
        return response()->json(['message' => 'Đã ẩn bảng giá']);
    }
}
