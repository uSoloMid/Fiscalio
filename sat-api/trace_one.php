<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\Cfdi;

$uuid = '3C6B897D-2E6D-49AD-9C2C-DA4F91E7C781';
$c = Cfdi::where('uuid', $uuid)->first();
if ($c) {
    echo "UUID: $uuid | Fecha: $c->fecha | Receptor: $c->rfc_receptor\n";
}
else {
    echo "UUID: $uuid NOT FOUND\n";
}
