<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\Business;
use App\Models\SatRequest;
use PhpCfdi\SatWsDescargaMasiva\Service;
use PhpCfdi\SatWsDescargaMasiva\Shared\ServiceEndpoints;
use PhpCfdi\SatWsDescargaMasiva\WebClient\GuzzleWebClient;
use PhpCfdi\SatWsDescargaMasiva\Shared\Fiel;

echo "--- VERIFICANDO CREDENCIALES SAT ---\n";

$businesses = Business::all();
foreach ($businesses as $b) {
    if (!$b->certificate || !$b->private_key || !$b->passphrase) {
        echo "RFC: $b->rfc | ERROR: Faltan archivos de Fiel/CSD\n";
        continue;
    }

    try {
        // Intentar cargar la FIEL para ver si el password es correcto
        $fiel = Fiel::create($b->certificate, $b->private_key, $b->passphrase);
        echo "RFC: $b->rfc | FIEL OK | Valida hasta: " . $fiel->getNotAfter() . "\n";
    }
    catch (\Exception $e) {
        echo "RFC: $b->rfc | ERROR FIEL: " . $e->getMessage() . "\n";
    }
}

echo "\n--- ULTIMA PETICION POR RFC ---\n";
foreach ($businesses as $b) {
    $last = SatRequest::where('rfc', $b->rfc)->orderBy('created_at', 'desc')->first();
    if ($last) {
        echo "RFC: $b->rfc | Ultima: $last->created_at | Estado: $last->state | SAT_Status: $last->sat_status\n";
    }
    else {
        echo "RFC: $b->rfc | Sin peticiones.\n";
    }
}
