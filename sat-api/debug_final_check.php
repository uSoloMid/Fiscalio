<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$rfc = 'GAMC810409FG6';
$count = \App\Models\Cfdi::where('rfc_emisor', $rfc)
    ->whereYear('fecha', 2026)
    ->whereMonth('fecha', 2)
    ->where('tipo', 'I')
    ->where('es_cancelado', false)
    ->count();

echo "Final check count (Emitidas, Ingreso, Feb 2026, Vigentes): $count" . PHP_EOL;

if ($count === 0) {
    echo "No matching records found. Let's see some emitidas for this month regardless of type:" . PHP_EOL;
    $emitidas = \App\Models\Cfdi::where('rfc_emisor', $rfc)
        ->whereYear('fecha', 2026)
        ->whereMonth('fecha', 2)
        ->get();
    foreach ($emitidas as $e) {
        echo "UUID: {$e->uuid} | Tipo: {$e->tipo} | Cancelado: {$e->es_cancelado} | Fecha: {$e->fecha}" . PHP_EOL;
    }
}
