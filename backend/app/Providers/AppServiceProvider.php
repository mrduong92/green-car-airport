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
        $this->app->bind(\App\Services\Zns\ZnsSender::class, function ($app) {
            return match (config('services.zns.provider')) {
                'zalo'  => $app->make(\App\Services\ZaloZnsService::class),
                default => $app->make(\App\Services\SouthTelecomZnsService::class),
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
