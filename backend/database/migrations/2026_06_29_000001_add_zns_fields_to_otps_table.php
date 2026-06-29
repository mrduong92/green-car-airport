<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('otps', function (Blueprint $table) {
            $table->string('client_req_id')->nullable()->index()->after('code');
            $table->string('tracking_id')->nullable()->after('client_req_id');
            $table->string('delivery_status')->nullable()->default('pending')->after('tracking_id');
            $table->timestamp('delivered_at')->nullable()->after('delivery_status');
        });
    }

    public function down(): void
    {
        Schema::table('otps', function (Blueprint $table) {
            $table->dropIndex(['client_req_id']);
            $table->dropColumn(['client_req_id', 'tracking_id', 'delivery_status', 'delivered_at']);
        });
    }
};
