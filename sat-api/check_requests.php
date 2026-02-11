<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$requests = App\Models\SatRequest::orderBy('created_at', 'desc')->take(5)->get();
foreach ($requests as $r) {
    echo "ID: {$r->id} | End: {$r->end_date} | State: {$r->state} | Error: {$r->last_error}\n";
}
