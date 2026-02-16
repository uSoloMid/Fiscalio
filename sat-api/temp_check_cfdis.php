<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\Cfdi;

$rfc = 'GAMC810409FG6';
$count = Cfdi::where('rfc_emisor', $rfc)->orWhere('rfc_receptor', $rfc)->count();
echo "Total CFDI for $rfc: $count\n";
