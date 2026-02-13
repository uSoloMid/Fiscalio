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
            // Solo devolvemos los negocios que todavía tienen certificado pendiente de bajar
            $clients = DB::table('businesses')
                ->whereNotNull('certificate')
                ->get();

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

    /**
     * Borra las credenciales de la nube después de que el Agente confirma recepción.
     */
    public function confirmCredentials(\Illuminate\Http\Request $request)
    {
        $rfc = $request->input('rfc');
        if (!$rfc)
            return response()->json(['error' => 'RFC required'], 400);

        // Limpiamos los campos sensibles de la base de datos en la nube
        DB::table('businesses')->where('rfc', strtoupper($rfc))->update([
            'certificate' => null,
            'private_key' => null,
            'passphrase' => null,
            'ciec' => null,
        ]);

        return response()->json(['success' => true, 'message' => "Credenciales de $rfc eliminadas de la nube."]);
    }
}
