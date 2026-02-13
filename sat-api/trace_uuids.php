<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\Cfdi;

$uuids = [
    '324DA89E-C4ED-4197-ACDC-5E028C6541E5', // Missing in UI
    '0C6DF044-2AF1-456D-B872-A7D204A118D1', // Shown in UI
    '140257B2-B4B4-4775-9A2D-D8B3F4D397FB' // Missing in UI but recent
];

foreach ($uuids as $uuid) {
    $c = Cfdi::where('uuid', $uuid)->first();
    if ($c) {
        echo "UUID: $uuid | Fecha: $c->fecha | Emisor: $c->rfc_emisor | Receptor: $c->rfc_receptor | Tipo: $c->tipo | Total: $c->total\n";
    }
    else {
        echo "UUID: $uuid NOT FOUND\n";
    }
}
