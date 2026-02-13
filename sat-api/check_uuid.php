<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\Cfdi;

$uuid = '324DA89E-C4ED-4197-ACDC-5E028C6541E5';
$found = Cfdi::where('uuid', $uuid)->first();

if ($found) {
    echo "FOUND: " . $found->uuid . " | " . $found->fecha . " | " . $found->rfc_emisor . "\n";
}
else {
    echo "NOT FOUND: $uuid\n";
}

$count = Cfdi::where('fecha', 'like', '2026-02%')->count();
echo "Total CFDIs Feb 2026: $count\n";

$last5 = Cfdi::orderBy('fecha', 'desc')->limit(5)->get();
foreach ($last5 as $c) {
    echo "LAST: " . $c->uuid . " | " . $c->fecha . " | " . $c->rfc_emisor . "\n";
}
