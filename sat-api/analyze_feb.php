<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Support\Facades\DB;

$res = DB::select("SELECT tipo, COUNT(*) as total FROM cfdis WHERE fecha LIKE '2026-02%' GROUP BY tipo");
foreach ($res as $row) {
    echo "Tipo: $row->tipo | Total: $row->total\n";
}

$res2 = DB::select("SELECT rfc_receptor, COUNT(*) as total FROM cfdis WHERE fecha LIKE '2026-02%' GROUP BY rfc_receptor ORDER BY total DESC LIMIT 10");
foreach ($res2 as $row) {
    echo "Receptor: $row->rfc_receptor | Total: $row->total\n";
}
