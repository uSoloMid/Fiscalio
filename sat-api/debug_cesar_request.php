<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\SatRequest;

$rfc = 'GAMC810409FG6';
$req = SatRequest::where('rfc', $rfc)->where('state', 'completed')->orderBy('created_at', 'desc')->first();
if ($req) {
    echo "Request ID: {$req->id}\n";
    echo "SAT Request ID: {$req->request_id}\n";
    echo "XML Count in DB for this request: {$req->xml_count}\n";
    echo "Created at: {$req->created_at}\n";
}
else {
    echo "No completed request found for Cesar\n";
}
