<?php
// backend/app/Http/Controllers/AppVersionController.php
namespace App\Http\Controllers;

use App\Models\AppSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Công khai, không auth: app gọi lúc khởi động — kể cả khi chưa đăng nhập.
 * App xử lý fail-open nên endpoint này lỗi không khoá ai ngoài app.
 */
class AppVersionController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $data = $request->validate([
            'app' => ['required', Rule::in(AppSetting::APP_VERSION_APPS)],
            'platform' => ['required', Rule::in(AppSetting::APP_VERSION_PLATFORMS)],
        ]);

        return response()->json([
            'min_supported' => AppSetting::appVersion($data['platform'], $data['app'], 'min'),
            'latest' => AppSetting::appVersion($data['platform'], $data['app'], 'latest'),
            'store_url' => config("app_versions.store_urls.{$data['platform']}.{$data['app']}"),
        ]);
    }
}
