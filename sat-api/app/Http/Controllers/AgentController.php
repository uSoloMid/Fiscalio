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
        return response()->json(['message' => 'Agent controller is working, testing DB connection...']);
    }
}
