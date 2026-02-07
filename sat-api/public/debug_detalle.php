<?php
require __DIR__ . '/../vendor/autoload.php';
$app = require_once __DIR__ . '/../bootstrap/app.php';
$app->make('Illuminate\Contracts\Console\Kernel')->bootstrap();

use App\Models\Cfdi;
header('Content-Type: text/plain');

$rfc = 'AATN430301MQ0';
echo "=== DETALLE FACTURAS ENERO 2025 (RFC: $rfc) ===\n";

// Buscar cualquier factura de Enero que tenga este RFC como emisor o receptor
$facturas = Cfdi::where('fecha', 'LIKE', '2025-01%')
    ->where(function ($q) use ($rfc) {
        $q->where('rfc_emisor', $rfc)->orWhere('rfc_receptor', $rfc);
    })
    ->get();

if ($facturas->isEmpty()) {
    echo "NO SE ENCONTRARON FACTURAS EN ENERO 2025.\n";
}
else {
    foreach ($facturas as $f) {
        $rol = '';
        if ($f->rfc_emisor === $rfc)
            $rol = 'EMITIDA (Usuario es Emisor)';
        if ($f->rfc_receptor === $rfc)
            $rol = 'RECIBIDA (Usuario es Receptor)';
        if ($f->rfc_emisor === $rfc && $f->rfc_receptor === $rfc)
            $rol = 'AUTO-FACTURA (Ambos)';

        echo "UUID: {$f->uuid}\n";
        echo "Fecha: {$f->fecha}\n";
        echo "Emisor: {$f->rfc_emisor}\n";
        echo "Receptor: {$f->rfc_receptor}\n";
        echo "Rol para Usuario: $rol\n";
        echo "Tipo CFDI: {$f->tipo}\n";
        echo "--------------------------\n";
    }
}
