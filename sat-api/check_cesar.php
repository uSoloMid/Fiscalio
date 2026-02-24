<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\SatRequest;

$rfc = 'GAMC810409FG6';
$count = SatRequest::where('rfc', $rfc)->whereIn('state', ['created', 'polling', 'downloading'])->count();
echo "Pending for Cesar: $count\n";

$latest = SatRequest::where('rfc', $rfc)->orderBy('created_at', 'desc')->first();
if ($latest) {
    echo "Latest state: {$latest->state}, Created: {$latest->created_at}\n";
}
