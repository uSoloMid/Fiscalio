<?php
require __DIR__ . '/../vendor/autoload.php';
$app = require_once __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\SatRequest;
use App\Models\Business;

echo "Time (now()): " . now() . "\n";
echo "Businesses count: " . Business::count() . "\n";
$pending = SatRequest::whereIn('state', ['created', 'polling', 'downloading'])
    ->where(function ($q) {
        $q->whereNull('next_retry_at')->orWhere('next_retry_at', '<=', now());
    })->count();
echo "Pending requests for runner: $pending\n";

$all_pending = SatRequest::whereIn('state', ['created', 'polling', 'downloading'])->count();
echo "Total requests in created/polling/downloading: $all_pending\n";

if ($all_pending > 0) {
    $first = SatRequest::whereIn('state', ['created', 'polling', 'downloading'])->orderBy('created_at', 'asc')->first();
    echo "First pending request ID: " . $first->id . "\n";
    echo "  RFC: " . $first->rfc . "\n";
    echo "  State: " . $first->state . "\n";
    echo "  Next Retry: " . $first->next_retry_at . "\n";
}
