<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;

$sql = File::get('../import_catalog.sql');
$statements = array_filter(array_map('trim', explode(";\n", $sql)));

DB::beginTransaction();
try {
    foreach ($statements as $statement) {
        if (!empty($statement)) {
            DB::statement($statement);
        }
    }
    DB::commit();
    echo "Importación exitosa: " . count($statements) . " registros procesados.\n";
}
catch (\Exception $e) {
    DB::rollBack();
    echo "Error en la importación: " . $e->getMessage() . "\n";
}
