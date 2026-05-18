<?php
namespace App\Http\Middleware;
use Closure;
use Illuminate\Http\Request;

class EnsureRole
{
    public function handle(Request $request, Closure $next, string $role): mixed
    {
        if ($request->user()?->role !== $role) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }
        return $next($request);
    }
}
