<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Support\Facades\DB;

$res = DB::select("SELECT rfc_receptor, COUNT(*) as total FROM cfdis GROUP BY rfc_receptor ORDER BY total DESC");
foreach ($res as $row) {
    echo "Receptor: $row->rfc_receptor | Total CFDIs: $row->total\n";
}

$res2 = DB::select("SELECT rfc_emisor, COUNT(*) as total FROM cfdis GROUP BY rfc_emisor ORDER BY total DESC LIMIT 10");
foreach ($res2 as $row) {
    echo "Emisor: $row->rfc_emisor | Total CFDIs: $row->total\n";
}
