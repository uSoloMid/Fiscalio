<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\Cfdi;
use Illuminate\Support\Facades\DB;

$rfc = 'LEHC621020PRA';
echo "--- ANALISIS DE DATOS PARA $rfc ---\n";

$count = Cfdi::where('rfc_receptor', $rfc)->where('fecha', 'like', '2026-02%')->count();
echo "Total Feb 2026 (Recibidas): $count\n";

$last3 = Cfdi::where('rfc_receptor', $rfc)
    ->orderBy('created_at', 'desc')
    ->limit(3)
    ->get();

foreach ($last3 as $c) {
    echo "UUID: $c->uuid | Tipo: $c->tipo | Fecha: $c->fecha | Creado en BD: $c->created_at\n";
}
