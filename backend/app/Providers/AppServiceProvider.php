<?php

namespace App\Providers;

use App\Listeners\RestrictNotificationsToTestPhone;
use App\Services\AbenlaZnsService;
use App\Services\Fcm\FcmSender;
use App\Services\Fcm\KreaitFcmSender;
use App\Services\Fcm\NullFcmSender;
use App\Services\SouthTelecomZnsService;
use App\Services\ZaloZnsService;
use App\Services\Zns\ZnsSender;
use Illuminate\Notifications\Events\NotificationSending;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(ZnsSender::class, function ($app) {
            return match (config('services.zns.provider')) {
                'zalo' => $app->make(ZaloZnsService::class),
                'abenla' => $app->make(AbenlaZnsService::class),
                default => $app->make(SouthTelecomZnsService::class),
            };
        });

        $this->app->singleton(FcmSender::class, function () {
            $credentials = config('services.firebase.credentials');

            if (blank($credentials)) {
                return new NullFcmSender();
            }

            return new KreaitFcmSender(
                (new \Kreait\Firebase\Factory())->withServiceAccount($credentials)->createMessaging()
            );
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Van an toàn khi test trên production — xem RestrictNotificationsToTestPhone.
        // Chỉ có tác dụng khi NOTIFY_ONLY_PHONE được đặt; bình thường là no-op.
        Event::listen(NotificationSending::class, RestrictNotificationsToTestPhone::class);
    }
}
