<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$rfc = 'GAMC810409FG6';
$count = \App\Models\Cfdi::where(function ($q) use ($rfc) {
    $q->where('rfc_emisor', $rfc)->orWhere('rfc_receptor', $rfc);
})    ->whereYear('fecha', 2026)    ->whereMonth('fecha', 2)    ->count();

echo "CFDIs count for $rfc in Feb 2026: $count" . PHP_EOL;

if ($count > 0) {
    $recent = \App\Models\Cfdi::where(function ($q) use ($rfc) {
        $q->where('rfc_emisor', $rfc)->orWhere('rfc_receptor', $rfc);
    })
        ->whereYear('fecha', 2026)
        ->whereMonth('fecha', 2)
        ->orderBy('fecha', 'desc')->take(5)->get();
    foreach ($recent as $c) {
        echo "{$c->uuid} | Emisor: {$c->rfc_emisor} | Receptor: {$c->rfc_receptor} | {$c->fecha} | {$c->total}" . PHP_EOL;
    }
}
