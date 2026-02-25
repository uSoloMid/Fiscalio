<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\Business;
use Carbon\Carbon;

$businesses = Business::all();
$syncThreshold = now()->subHours(11);

echo "Current Time: " . now()->toDateTimeString() . "\n";
echo "Sync Threshold: " . $syncThreshold->toDateTimeString() . "\n\n";

foreach ($businesses as $b) {
    echo "RFC: {$b->rfc}\n";
    echo "Last Sync: {$b->last_sync_at}\n";
    echo "Is Syncing: {$b->is_syncing}\n";
    echo "Sync Status: {$b->sync_status}\n";

    if ($b->is_syncing) {
        echo "=> Would NOT sync: already_syncing\n";
    }
    elseif ($b->last_sync_at && Carbon::parse($b->last_sync_at) > $syncThreshold) {
        echo "=> Would NOT sync: too_recent\n";
    }
    else {
        echo "=> WOULD sync\n";
    }
    echo "--------------------------\n";
}
