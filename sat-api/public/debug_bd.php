<?php
require __DIR__ . '/../vendor/autoload.php';
$app = require_once __DIR__ . '/../bootstrap/app.php';
$app->make('Illuminate\Contracts\Console\Kernel')->bootstrap();

use App\Models\Cfdi;
header('Content-Type: text/plain');

$rfc = 'AATN430301MQ0';
echo "=== DETALLE FACTURA ENERO 2025 ===\n";
$facturas = Cfdi::whereBetween('fecha', ['2025-01-01', '2025-01-31'])
    ->where(function ($q) use ($rfc) {
        $q->where('rfc_emisor', $rfc)->orWhere('rfc_receptor', $rfc);
    })
    ->get();

foreach ($facturas as $f) {
    echo "UUID: {$f->uuid}\n";
    echo "Fecha: {$f->fecha}\n";
    echo "Emisor: {$f->rfc_emisor} " . ($f->rfc_emisor == $rfc ? '[ES EL USUARIO]' : '') . "\n";
    echo "Receptor: {$f->rfc_receptor} " . ($f->rfc_receptor == $rfc ? '[ES EL USUARIO]' : '') . "\n";
    echo "Tipo: {$f->tipo}\n";
    echo "Total: {$f->total}\n";
    echo "--------------------------\n";
}
