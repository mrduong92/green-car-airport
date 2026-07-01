<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('driver_profiles', function (Blueprint $table) {
            $table->string('cccd_number', 20)->nullable()->after('blocked_reason');
            $table->string('gplx_number', 20)->nullable()->after('cccd_number');
            $table->string('vehicle_reg_number', 30)->nullable()->after('gplx_number');
            $table->string('vehicle_inspection_number', 30)->nullable()->after('vehicle_reg_number');
            $table->date('vehicle_inspection_expiry')->nullable()->after('vehicle_inspection_number');
            $table->string('insurance_number', 30)->nullable()->after('vehicle_inspection_expiry');
            $table->date('insurance_expiry')->nullable()->after('insurance_number');
        });
    }

    public function down(): void
    {
        Schema::table('driver_profiles', function (Blueprint $table) {
            $table->dropColumn([
                'cccd_number', 'gplx_number', 'vehicle_reg_number',
                'vehicle_inspection_number', 'vehicle_inspection_expiry',
                'insurance_number', 'insurance_expiry',
            ]);
        });
    }
};
