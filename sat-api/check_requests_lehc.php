<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\SatRequest;

$rfc = 'LEHC621020PRA';
$requests = SatRequest::where('rfc', $rfc)
    ->orderBy('created_at', 'desc')
    ->limit(10)
    ->get();

echo "Requests for $rfc:\n";
foreach ($requests as $r) {
    echo "ID: $r->id | Status: $r->state | Range: $r->start_date to $r->end_date | Created: $r->created_at\n";
}
