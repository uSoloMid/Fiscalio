<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\Cfdi;

echo "Checking XAXX invoices...\n";
$cfdis = Cfdi::where('rfc_emisor', 'like', 'XAXX%')
    ->orWhere('rfc_receptor', 'like', 'XAXX%')
    ->orderBy('fecha', 'desc')
    ->limit(10)
    ->get();

foreach ($cfdis as $cfdi) {
    echo "UUID: {$cfdi->uuid} | Fecha: {$cfdi->fecha} | Fecha Fiscal: {$cfdi->fecha_fiscal} | RFC Em: {$cfdi->rfc_emisor} | RFC Rec: {$cfdi->rfc_receptor}\n";
}
