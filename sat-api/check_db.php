<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\Cfdi;

echo "Checking CFDIs for LEHC621020PRA in Jan 2026...\n";
$cfdis = Cfdi::where('rfc_emisor', 'LEHC621020PRA')
    ->whereYear('fecha', 2026)
    ->whereMonth('fecha', 1)
    ->get();

echo "Count: " . $cfdis->count() . "\n";

foreach ($cfdis as $c) {
    echo "UUID: {$c->uuid}, Tipo: {$c->tipo}, Metodo: {$c->metodo_pago}, Total: {$c->total}, Cancelado: " . ($c->es_cancelado ? 'YES' : 'NO') . "\n";
}
