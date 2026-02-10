<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$types = \App\Models\Cfdi::select('tipo')->distinct()->pluck('tipo');
echo "Distinct types in DB: " . implode(', ', $types->toArray()) . PHP_EOL;

$rfc = 'GAMC810409FG6';
$ingresos = \App\Models\Cfdi::where(function ($q) use ($rfc) {
    $q->where('rfc_emisor', $rfc)->orWhere('rfc_receptor', $rfc);
})    ->whereYear('fecha', 2026)    ->whereMonth('fecha', 2)    ->where('tipo', 'I')    ->count();

echo "Count for type 'I' (Ingreso) for $rfc in Feb 2026: $ingresos" . PHP_EOL;
