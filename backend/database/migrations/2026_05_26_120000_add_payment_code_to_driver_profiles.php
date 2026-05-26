<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('driver_profiles', function (Blueprint $table) {
            $table->string('payment_code', 16)->nullable()->unique()->after('user_id');
        });

        DB::table('driver_profiles')->orderBy('id')->each(function ($row) {
            DB::table('driver_profiles')
                ->where('id', $row->id)
                ->update(['payment_code' => 'GCA' . str_pad((string) $row->user_id, 6, '0', STR_PAD_LEFT)]);
        });
    }

    public function down(): void
    {
        Schema::table('driver_profiles', function (Blueprint $table) {
            $table->dropUnique(['payment_code']);
            $table->dropColumn('payment_code');
        });
    }
};
