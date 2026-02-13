<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\Cfdi;

$uuids = [
    'EC0B3683-E108-0D44-9ADC-C351C293B7D7',
    '334917D5-8D17-431F-A2DF-60ED394745F9',
    'ECB919E6-33CB-4EFF-924A-BC55C8E6CBD9'
];

foreach ($uuids as $uuid) {
    $c = Cfdi::where('uuid', $uuid)->first();
    if ($c) {
        echo "UUID: $uuid | Fecha: $c->fecha | Emisor: $c->rfc_emisor | Receptor: $c->rfc_receptor\n";
    }
    else {
        echo "UUID: $uuid NOT FOUND\n";
    }
}
