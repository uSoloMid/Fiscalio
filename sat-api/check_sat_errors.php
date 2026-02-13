<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\SatRequest;
use Illuminate\Support\Facades\DB;

echo "--- ULTIMAS 10 SOLICITUDES AL SAT ---\n";
$requests = SatRequest::orderBy('created_at', 'desc')->limit(10)->get();

foreach ($requests as $r) {
    echo "ID: " . substr($r->id, 0, 8) . "... | RFC: $r->rfc | Tipo: $r->type | Estado: $r->state | SAT_Status: $r->sat_status | Error: " . ($r->last_error ?: 'Ninguno') . " | Creado: $r->created_at\n";
}

echo "\n--- RESUMEN POR ESTADO ---\n";
$stats = SatRequest::select('state', DB::raw('count(*) as total'))
    ->groupBy('state')
    ->get();
foreach ($stats as $s) {
    echo "$s->state: $s->total\n";
}
