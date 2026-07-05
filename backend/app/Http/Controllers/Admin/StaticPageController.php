<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\StaticPage;
use HTMLPurifier;
use HTMLPurifier_Config;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StaticPageController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(StaticPage::orderBy('id')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'slug'    => 'required|string|max:50|regex:/^[a-z0-9-]+$/|unique:static_pages,slug',
            'title'   => 'required|string|max:150',
            'content' => 'required|string',
        ]);

        $data['content'] = $this->sanitize($data['content']);

        $page = StaticPage::create($data);

        return response()->json($page, 201);
    }

    public function update(Request $request, StaticPage $page): JsonResponse
    {
        $data = $request->validate([
            'title'     => 'sometimes|string|max:150',
            'content'   => 'sometimes|string',
            'is_active' => 'sometimes|boolean',
        ]);

        if (isset($data['content'])) {
            $data['content'] = $this->sanitize($data['content']);
        }

        $page->update($data);

        return response()->json($page->fresh());
    }

    public function destroy(StaticPage $page): JsonResponse
    {
        $page->update(['is_active' => false]);

        return response()->json(['message' => 'Đã ẩn trang']);
    }

    private function sanitize(string $html): string
    {
        $config = HTMLPurifier_Config::createDefault();
        $config->set('HTML.Allowed', 'p,br,strong,em,h2,h3,ul,ol,li,a[href]');
        $config->set('URI.AllowedSchemes', ['http' => true, 'https' => true]);
        $config->set('Cache.DefinitionImpl', null);

        return (new HTMLPurifier($config))->purify($html);
    }
}
