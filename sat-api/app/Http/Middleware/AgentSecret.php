<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class AgentSecret
{
    public function handle(Request $request, Closure $next): mixed
    {
        $secret = config('app.agent_secret');

        if (empty($secret)) {
            return response()->json(['error' => 'Agent secret not configured'], 500);
        }

        $provided = $request->header('X-Agent-Secret');

        if (!$provided || !hash_equals($secret, $provided)) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        return $next($request);
    }
}
