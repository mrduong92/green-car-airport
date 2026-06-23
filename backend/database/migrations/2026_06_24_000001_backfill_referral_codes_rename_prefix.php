<?php

use App\Models\User;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        $prefix = config('app.code_prefix');

        // Step 1: rename existing GCA- codes to SGO- (or current prefix)
        DB::table('users')
            ->whereNotNull('referral_code')
            ->where('referral_code', 'like', 'GCA-%')
            ->lazyById()
            ->each(function ($user) use ($prefix) {
                $newCode = $prefix . '-' . substr($user->referral_code, 4);
                DB::table('users')->where('id', $user->id)->update(['referral_code' => $newCode]);
            });

        // Step 2: generate codes for users with null referral_code
        DB::table('users')
            ->whereNull('referral_code')
            ->lazyById()
            ->each(function ($user) use ($prefix) {
                do {
                    $code = $prefix . '-' . strtoupper(Str::random(6));
                } while (DB::table('users')->where('referral_code', $code)->exists());

                DB::table('users')->where('id', $user->id)->update(['referral_code' => $code]);
            });
    }

    public function down(): void
    {
        // intentionally empty — data migration is one-way
    }
};
