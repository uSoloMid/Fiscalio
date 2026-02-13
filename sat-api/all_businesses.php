<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\Business;

$all = Business::all();
echo "Count: " . $all->count() . "\n";
foreach ($all as $b) {
    echo "ID: $b->id | RFC: $b->rfc | Name: $b->legal_name\n";
}
