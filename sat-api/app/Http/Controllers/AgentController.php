<?php

namespace App\Http\Controllers;

use App\Models\Business;
use Illuminate\Http\Request;

class AgentController extends Controller
{
    /**
     * Devuelve las credenciales (FIEL) para que el Agente local las sincronice.
     */
    public function syncClients()
    {
        // En producción deberíamos validar un token de agente aquí.
        // Por ahora, asumimos que si pueden llamar a la API, es válido (o añadiremos middleware luego).

        // Obtenemos todos los fields, haciendo visibles los secretos
        $clients = Business::all()->makeVisible(['passphrase', 'ciec', 'certificate', 'private_key']);

        return response()->json($clients->map(function ($c) {
            return [
                'rfc' => $c->rfc,
                'legal_name' => $c->legal_name,
                'certificate' => $c->certificate, // Base64
                'private_key' => $c->private_key, // Base64
                'passphrase' => $c->passphrase,
                'ciec' => $c->ciec,
            ];
        }));
    }
}
