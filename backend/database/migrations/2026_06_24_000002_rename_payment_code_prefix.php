<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $prefix = config('app.code_prefix');

        DB::table('driver_profiles')
            ->where('payment_code', 'like', 'GCA%')
            ->lazyById()
            ->each(function ($profile) use ($prefix) {
                $newCode = $prefix . substr($profile->payment_code, 3);
                DB::table('driver_profiles')->where('id', $profile->id)->update(['payment_code' => $newCode]);
            });
    }

    public function down(): void
    {
        // intentionally empty — data migration is one-way
    }
};
