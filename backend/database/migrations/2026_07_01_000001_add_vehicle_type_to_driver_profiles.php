<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('driver_profiles', function (Blueprint $table) {
            $table->string('vehicle_type', 20)->nullable()->after('vehicle_color');
        });
    }

    public function down(): void
    {
        Schema::table('driver_profiles', function (Blueprint $table) {
            $table->dropColumn('vehicle_type');
        });
    }
};
