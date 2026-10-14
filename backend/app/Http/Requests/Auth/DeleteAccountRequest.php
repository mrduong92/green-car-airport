<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

class DeleteAccountRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        // Tài khoản chưa đặt PIN không có gì để nhập (xem AccountController::destroy).
        $required = $this->user()?->password ? 'required' : 'nullable';

        return ['password' => "{$required}|string|size:6|regex:/^\d{6}$/"];
    }

    public function messages(): array
    {
        return ['password.*' => 'Vui lòng nhập đủ 6 số PIN.'];
    }
}
