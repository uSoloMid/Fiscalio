<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\SatRequest;
use App\Models\Cfdi;

$rfc = 'SARC720326DW5';

echo "=== Estado Actual ===\n";
echo "CFDIs: " . Cfdi::where('rfc_emisor', $rfc)->orWhere('rfc_receptor', $rfc)->count() . "\n";
$req = SatRequest::where('rfc_emisor', $rfc)->orWhere('rfc_receptor', $rfc)->latest()->first();

if ($req) {
    echo "Request ID: " . $req->request_id . "\n";
    echo "Estado SAT: " . $req->sat_status . "\n";
    echo "Estado App: " . $req->state . "\n";

    // Forzar reseteo si parece trabado o sin XMLs
    echo "Forzando estado a 'created' para reiniciar ciclo...\n";
    $req->state = 'created';
    $req->sat_status = '1'; // Para que el runner vuelva a verificar o descargar
    $req->save();
    echo "Estado actualizado a 'created'. El Runner debería tomarlo en el próximo ciclo.\n";

}
else {
    echo "No se encontró Request para $rfc.\n";
}
