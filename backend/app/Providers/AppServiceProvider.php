<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(\App\Services\Zns\ZnsSender::class, function () {
            return match (config('services.zns.provider')) {
                'zalo'  => app(\App\Services\ZaloZnsService::class),
                default => app(\App\Services\SouthTelecomZnsService::class),
            };
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
