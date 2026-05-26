<?php
namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $notifications = $request->user()
            ->notifications()
            ->latest()
            ->paginate(20);

        $items = $notifications->map(fn ($n) => [
            'id'         => $n->id,
            'title'      => $n->data['title'] ?? '',
            'body'       => $n->data['body'] ?? '',
            'action'     => $n->data['action'] ?? null,
            'booking_id' => $n->data['booking_id'] ?? null,
            'read_at'    => $n->read_at?->toISOString(),
            'created_at' => $n->created_at->toISOString(),
        ]);

        return response()->json([
            'data'         => $items,
            'current_page' => $notifications->currentPage(),
            'last_page'    => $notifications->lastPage(),
        ]);
    }

    public function unreadCount(Request $request): JsonResponse
    {
        return response()->json(['count' => $request->user()->unreadNotifications()->count()]);
    }

    public function readAll(Request $request): JsonResponse
    {
        $request->user()->unreadNotifications()->update(['read_at' => now()]);
        return response()->json(['ok' => true]);
    }

    public function markRead(Request $request, string $id): JsonResponse
    {
        $notification = $request->user()->notifications()->findOrFail($id);
        $notification->markAsRead();
        return response()->json(['ok' => true]);
    }
}
