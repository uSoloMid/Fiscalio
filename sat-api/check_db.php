<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\Cfdi;
$rfc = 'AATN430301MQ0';
$invoice = Cfdi::where('rfc_receptor', $rfc)
    ->whereYear('fecha', 2026)
    ->whereMonth('fecha', 2)
    ->first();

if ($invoice) {
    echo "UUID: " . $invoice->uuid . "\n";
    echo "Cancelado: " . ($invoice->es_cancelado ? 'YES' : 'NO') . "\n";
    echo "Tipo: " . $invoice->tipo . "\n";
}
else {
    echo "Not found\n";
}
