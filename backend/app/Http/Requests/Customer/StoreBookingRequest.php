<?php

namespace App\Http\Requests\Customer;

use Carbon\Carbon;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class StoreBookingRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'pickup' => 'required|string',
            'pickup_lat' => 'nullable|numeric|between:-90,90',
            'pickup_lng' => 'nullable|numeric|between:-180,180',
            'destination' => 'required|string',
            'destination_lat' => 'nullable|numeric|between:-90,90',
            'destination_lng' => 'nullable|numeric|between:-180,180',
            // "Đi ngay": giờ đón = lúc server nhận yêu cầu — bỏ qua ngày/giờ máy khách gửi
            // (có thể lệch giờ, hoặc còn ở ngày hôm qua khi bấm sát nửa đêm).
            'go_now' => 'sometimes|boolean',
            'date' => 'exclude_if:go_now,true|required|date_format:Y-m-d|after_or_equal:today',
            'time' => 'exclude_if:go_now,true|required|date_format:H:i',
            'vehicle_type' => 'required|in:sedan_4,suv_5,mpv_7',
            'distance_km' => 'required|numeric|min:0',
            'price' => 'required|integer|min:0',
            'voucher_code' => 'nullable|string',
            'note' => 'nullable|string|max:500',
            'collection_fee' => 'nullable|integer|min:0',
        ];
    }

    public function after(): array
    {
        return [
            function (Validator $validator) {
                // Hẹn giờ trong hôm nay phải cách ít nhất 30 phút so với hiện tại.
                // "Đi ngay" không áp quy tắc này — đi ngay tức là bây giờ.
                if ($validator->errors()->isNotEmpty() || $this->boolean('go_now')) {
                    return;
                }
                if ($this->input('date') === now()->toDateString()
                    && Carbon::createFromFormat('H:i', $this->input('time'))->lte(now()->addMinutes(30))) {
                    $validator->errors()->add('time', 'Giờ đón phải cách ít nhất 30 phút so với thời điểm đặt xe.');
                }
            },
        ];
    }

    /** Dữ liệu đã kiểm; "Đi ngay" thì ngày/giờ đón là giờ server. */
    public function bookingData(): array
    {
        $data = $this->validated();
        if ($this->boolean('go_now')) {
            // Một mốc duy nhất — gọi now() hai lần có thể vắt qua nửa đêm (ngày hôm nay, giờ 00:00).
            $now = now();
            $data['date'] = $now->toDateString();
            $data['time'] = $now->format('H:i');
        }

        return $data;
    }
}
