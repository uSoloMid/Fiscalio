<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\SatRequest;

$latest = SatRequest::orderBy('created_at', 'desc')->take(10)->get();
foreach ($latest as $r) {
    echo "ID: {$r->id}, RFC: {$r->rfc}, State: {$r->state}, XMLs: {$r->xml_count}, Created: {$r->created_at}\n";
}
