<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Support\Facades\DB;

$tableSql = DB::select("SELECT sql FROM sqlite_master WHERE type='table' AND name='accounts'")[0]->sql;
echo "TABLE SQL:\n$tableSql\n\n";

$indexes = DB::select("SELECT * FROM sqlite_master WHERE type='index' AND tbl_name='accounts'");
foreach ($indexes as $idx) {
    echo "INDEX: {$idx->name} | SQL: {$idx->sql}\n";
}
