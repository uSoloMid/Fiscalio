<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Support\Facades\DB;

$rfcs = ['LEHM670418DN7', 'LEHC621020PRA'];
foreach ($rfcs as $rfc) {
    $res = DB::select("SELECT COUNT(*) as total FROM cfdis WHERE rfc_receptor = ?", [$rfc]);
    echo "Receptor: $rfc | Total CFDIs: " . $res[0]->total . "\n";

    $resEmitidas = DB::select("SELECT COUNT(*) as total FROM cfdis WHERE rfc_emisor = ?", [$rfc]);
    echo "Emisor: $rfc | Total CFDIs: " . $resEmitidas[0]->total . "\n";
}
