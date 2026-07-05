<?php

namespace App\Http\Controllers;

use App\Models\StaticPage;
use Illuminate\Http\JsonResponse;

class StaticPageController extends Controller
{
    public function show(string $slug): JsonResponse
    {
        $page = StaticPage::where('slug', $slug)->where('is_active', true)->first();

        if (! $page) {
            return response()->json(['message' => 'Không tìm thấy trang.'], 404);
        }

        return response()->json([
            'slug'    => $page->slug,
            'title'   => $page->title,
            'content' => $page->content,
        ]);
    }
}
