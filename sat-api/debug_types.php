<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$rfc = 'GAMC810409FG6';
$emitidas = \App\Models\Cfdi::where('rfc_emisor', $rfc)
    ->whereYear('fecha', 2026)
    ->whereMonth('fecha', 2)
    ->count();

$recibidas = \App\Models\Cfdi::where('rfc_receptor', $rfc)
    ->whereYear('fecha', 2026)
    ->whereMonth('fecha', 2)
    ->count();

echo "RFC: $rfc | Month: 2026-02" . PHP_EOL;
echo "Emitidas: $emitidas" . PHP_EOL;
echo "Recibidas: $recibidas" . PHP_EOL;
