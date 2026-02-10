<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

echo "CFDIs count: " . \App\Models\Cfdi::count() . PHP_EOL;
echo "Recent CFDIs (last 10):" . PHP_EOL;
$recent = \App\Models\Cfdi::orderBy('fecha', 'desc')->take(10)->get();
foreach ($recent as $c) {
    echo "{$c->uuid} | {$c->fecha} | {$c->total}" . PHP_EOL;
}
