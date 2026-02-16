<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\Business;
use App\Models\SatRequest;
use Carbon\Carbon;

$business = Business::where('rfc', 'GAMC810409FG6')->first();
if (!$business) {
    echo "Business not found\n";
    exit(1);
}

echo "Forcing sync for Cesar...\n";
$business->update(['last_sync_at' => null, 'is_syncing' => false]);

$startDate = Carbon::create(2026, 2, 1);
$endDate = Carbon::now();

echo "Creating new request from $startDate to $endDate\n";

SatRequest::create([
    'id' => (string)\Illuminate\Support\Str::uuid(),
    'rfc' => $business->rfc,
    'type' => 'issued',
    'start_date' => $startDate,
    'end_date' => $endDate,
    'state' => 'created',
    'request_id' => null
]);

SatRequest::create([
    'id' => (string)\Illuminate\Support\Str::uuid(),
    'rfc' => $business->rfc,
    'type' => 'received',
    'start_date' => $startDate,
    'end_date' => $endDate,
    'state' => 'created',
    'request_id' => null
]);

echo "Requests created. Now run the runner.\n";
