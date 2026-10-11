<?php

namespace App\Http\Controllers\Driver;

use App\Http\Controllers\Controller;
use App\Services\DriverAppPresence;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

// Nhịp "đang mở app" từ app tài xế — xem DriverAppPresence.
class AppPresenceController extends Controller
{
    public function update(Request $request): Response
    {
        $data = $request->validate(['active' => ['required', 'boolean']]);

        DriverAppPresence::mark($request->user()->id, $data['active']);

        return response()->noContent();
    }
}
