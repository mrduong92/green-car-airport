<?php

namespace App\Http\Controllers;

use App\Models\Otp;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Log;

class ZnsDlrController extends Controller
{
    public function handle(Request $request): Response
    {
        if ($request->query('token') !== config('services.southtelecom_zns.dlr_token')) {
            abort(403);
        }

        $smsid       = $request->query('smsid');
        $status      = (int) $request->query('status', 0);
        $deliveredts = $request->query('deliveredts');

        Log::info('ZNS DLR received', [
            'smsid'        => $smsid,
            'status'       => $status,
            'otterrorcode' => $request->query('otterrorcode'),
        ]);

        $otp = Otp::where('client_req_id', $smsid)->first();

        if ($otp) {
            $otp->update([
                'delivery_status' => $status === 1 ? 'delivered' : 'failed',
                'delivered_at'    => $deliveredts ? Carbon::createFromTimestamp((int) $deliveredts) : now(),
            ]);
        }

        return response('OK', 200);
    }
}
