<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ZaloAccountRequest;
use App\Services\Zalo\ZaloServiceMonitor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

// Tab admin "Nick Zalo" (giai đoạn 5): đăng nhập/gỡ nick Zalo phụ bằng mã QR, danh sách nick.
// Laravel KHÔNG gọi vào service — chỉ tạo yêu cầu, service Node tự hỏi và báo tiến độ qua
// các endpoint nội bộ ở ZaloServiceController. Phiên đăng nhập thật không bao giờ rời VPS.
class ZaloAccountController extends Controller
{
    // Danh sách nick lấy từ heartbeat (snapshot), gộp mọi service còn theo dõi, kèm yêu cầu
    // đang mở (pending/qr_ready) để UI biết nick nào đang chờ quét QR.
    public function accounts(ZaloServiceMonitor $monitor): JsonResponse
    {
        ZaloAccountRequest::expireStale();

        $accounts = collect($monitor->snapshot())
            ->flatMap(fn (array $service) => collect($service['accounts'])->map(fn (array $a) => [
                'id' => $a['id'],
                'zalo_uid' => $a['zalo_uid'],
                'zalo_name' => $a['zalo_name'],
                'connected' => $a['connected'],
                'logged_in' => $a['logged_in'],
                'last_error' => $a['last_error'],
                'logged_in_at' => $a['logged_in_at'],
                'groups' => $a['groups'],
                'service_id' => $service['service_id'],
                'stale' => $service['stale'],
            ]))
            ->values();

        $requests = ZaloAccountRequest::whereIn('status', ZaloAccountRequest::OPEN_STATUSES)
            ->oldest('id')
            ->get(['id', 'type', 'account_id', 'status']);

        return response()->json(['accounts' => $accounts, 'requests' => $requests]);
    }

    // Tạo yêu cầu đăng nhập (nick mới hoặc đăng nhập lại nick đã có — service tự nhận ra file
    // phiên đã tồn tại và dừng/thay nick cũ). account_id phải khớp mẫu dùng chung với service.
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'account_id' => ['required', 'string', 'regex:/^[a-z0-9-]{1,32}$/'],
        ]);

        return $this->createRequest('login', $data['account_id'], $request);
    }

    // Gỡ nick: service dừng listener, đổi tên file phiên (không xoá hẳn), báo done.
    public function destroy(Request $request, string $accountId): JsonResponse
    {
        return $this->createRequest('remove', $accountId, $request);
    }

    // Admin poll mỗi 2 giây trong lúc hộp thoại QR đang mở.
    public function show(string $id): JsonResponse
    {
        ZaloAccountRequest::expireStale();

        $req = ZaloAccountRequest::findOrFail($id);

        return response()->json([
            'id' => $req->id,
            'type' => $req->type,
            'account_id' => $req->account_id,
            'status' => $req->status,
            'qr_image' => $req->qr_image,
            'qr_expires_at' => $req->qr_expires_at?->getTimestampMs(),
            'zalo_name' => $req->zalo_name,
            'error' => $req->error,
        ]);
    }

    // Một yêu cầu tại một thời điểm cho mỗi account_id (login hoặc remove) — 409 nếu đã có
    // yêu cầu đang mở (pending/qr_ready); yêu cầu đã xong/hết hạn/lỗi thì được tạo lại.
    private function createRequest(string $type, string $accountId, Request $request): JsonResponse
    {
        ZaloAccountRequest::expireStale();

        $hasOpenRequest = ZaloAccountRequest::where('account_id', $accountId)
            ->whereIn('status', ZaloAccountRequest::OPEN_STATUSES)
            ->exists();

        if ($hasOpenRequest) {
            return response()->json(['message' => 'Đã có yêu cầu đang xử lý cho nick này'], 409);
        }

        $req = ZaloAccountRequest::create([
            'type' => $type,
            'account_id' => $accountId,
            'status' => 'pending',
            'requested_by' => $request->user()->id,
        ]);

        return response()->json([
            'id' => $req->id,
            'type' => $req->type,
            'account_id' => $req->account_id,
            'status' => $req->status,
        ], 201);
    }
}
