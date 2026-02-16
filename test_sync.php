<?php
require 'sat-api/vendor/autoload.php';
$app = require_once 'sat-api/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\Business;
use App\Models\SatRequest;
use App\Services\BusinessSyncService;

$rfc = 'GAMC810409FG6';
$business = Business::where('rfc', $rfc)->first();

if (!$business) {
    die("Business not found\n");
}

echo "Testing sync for $rfc (Force: true)...\n";
$service = app(BusinessSyncService::class);
$result = $service->syncIfNeeded($business, true);

print_r($result);

echo "\nLast 5 requests for $rfc:\n";
$reqs = SatRequest::where('rfc', $rfc)->orderBy('created_at', 'desc')->limit(5)->get();
foreach ($reqs as $r) {
    echo "{$r->id} | {$r->type} | {$r->start_date} | {$r->end_date} | {$r->state} | {$r->created_at}\n";
}
