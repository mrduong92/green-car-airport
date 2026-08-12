<?php

namespace App\Policies;

use App\Models\User;
use Illuminate\Auth\Access\Response;

class UserPolicy
{
    public function deductPoints(User $admin, User $target): Response
    {
        return $target->is_collaborator || $target->role === 'driver'
            ? Response::allow()
            : Response::deny('Chỉ có thể trừ điểm của Cộng tác viên hoặc Tài xế.');
    }
}
