<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\DB;
use App\Http\Controllers\Controller;

class AgentController extends Controller
{
    /**
     * Devuelve las credenciales (FIEL) para que el Agente local las sincronice.
     */
    public function syncClients()
    {
        return response()->json([
            'message' => 'Agent controller is working',
            'debug' => [
                'DB_CONNECTION' => config('database.default'),
                'DB_DATABASE' => config('database.connections.sqlite.database'),
                'PDO_DRIVERS' => \PDO::getAvailableDrivers(),
            ]
        ]);
    }
}
