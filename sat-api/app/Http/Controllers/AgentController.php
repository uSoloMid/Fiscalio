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
        try {
            // Usamos Query Builder directo para evitar problemas de Eloquent/Modelos/Hidden
            $clients = DB::table('businesses')->get();

            return response()->json($clients->map(function ($c) {
                return [
                    'rfc' => $c->rfc,
                    'legal_name' => $c->legal_name,
                    'certificate' => $c->certificate,
                    'private_key' => $c->private_key,
                    'passphrase' => $c->passphrase,
                    'ciec' => $c->ciec ?? null,
                ];
            }));
        }
        catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }
}
