<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\SatRequest;

$rfc = 'GAMC810409FG6';
$failed = SatRequest::where('rfc', $rfc)->where('state', 'failed')->get();
echo "Failed for Cesar: " . count($failed) . "\n";
foreach ($failed as $f) {
    echo "ID: {$f->id}, Error: {$f->error_message}, Created: {$f->created_at}\n";
}
