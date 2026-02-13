<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\Cfdi;

$rfc = 'LEHM670418DN7';
$count = Cfdi::where('rfc_receptor', $rfc)
    ->where('tipo', 'I')
    ->where('fecha', 'like', '2026-02%')
    ->count();

echo "Receptor: $rfc | Tipo: I | Feb 2026 | Total: $count\n";

$last5 = Cfdi::where('rfc_receptor', $rfc)
    ->where('tipo', 'I')
    ->where('fecha', 'like', '2026-02%')
    ->orderBy('fecha', 'desc')
    ->limit(10)
    ->get();

foreach ($last5 as $c) {
    echo "UUID: $c->uuid | Fecha: $c->fecha | Emisor: $c->rfc_emisor\n";
}
