<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\SatRequest;

$rfc = 'LEHC621020PRA';
$requests = SatRequest::where('rfc', $rfc)
    ->orderBy('created_at', 'desc')
    ->limit(5)
    ->get();

echo "--- ULTIMAS PETICIONES PARA $rfc ---\n";
foreach ($requests as $r) {
    echo "ID: " . substr($r->id, 0, 8) . " | Tipo: $r->type | Estado: $r->state | SAT_Status: $r->sat_status | Error: " . ($r->last_error ?: 'Ninguno') . " | Creado: $r->created_at\n";
}
