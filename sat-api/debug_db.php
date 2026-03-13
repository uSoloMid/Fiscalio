<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Support\Facades\DB;

$columns = DB::select("PRAGMA table_info(accounts)");
foreach ($columns as $col) {
    echo "{$col->name}: type={$col->type}, notnull={$col->notnull}, dflt_value=" . var_export($col->dflt_value, true) . "\n";
}
