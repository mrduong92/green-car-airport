<?php

namespace App\Services;

use Kreait\Firebase\Exception\Auth\FailedToVerifyToken;
use Kreait\Firebase\Factory;
use Illuminate\Support\Facades\Log;

class FirebaseService
{
    public function verifyIdToken(string $idToken): ?array
    {
        try {
            $auth    = (new Factory)->withServiceAccount(config('services.firebase.credentials'))->createAuth();
            $decoded = $auth->verifyIdToken($idToken);

            return [
                'uid'   => $decoded->claims()->get('sub'),
                'phone' => $decoded->claims()->get('phone_number'), // +84912345678
            ];
        } catch (FailedToVerifyToken $e) {
            Log::warning('Firebase ID token invalid: ' . $e->getMessage());
            return null;
        }
    }
}
