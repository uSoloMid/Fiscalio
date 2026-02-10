<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$rfc = 'GAMC810409FG6';
$total = \App\Models\Cfdi::where(function ($q) use ($rfc) {
    $q->where('rfc_emisor', $rfc)->orWhere('rfc_receptor', $rfc);
})    ->whereYear('fecha', 2026)    ->whereMonth('fecha', 2)    ->count();

$vigentes = \App\Models\Cfdi::where(function ($q) use ($rfc) {
    $q->where('rfc_emisor', $rfc)->orWhere('rfc_receptor', $rfc);
})    ->whereYear('fecha', 2026)    ->whereMonth('fecha', 2)    ->where('es_cancelado', false)    ->count();

$cancelados = \App\Models\Cfdi::where(function ($q) use ($rfc) {
    $q->where('rfc_emisor', $rfc)->orWhere('rfc_receptor', $rfc);
})    ->whereYear('fecha', 2026)    ->whereMonth('fecha', 2)    ->where('es_cancelado', true)    ->count();

echo "RFC: $rfc | Month: 2026-02" . PHP_EOL;
echo "Total: $total" . PHP_EOL;
echo "Vigentes: $vigentes" . PHP_EOL;
echo "Cancelados: $cancelados" . PHP_EOL;
