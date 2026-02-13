<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\Client;

$clients = Client::all();
foreach ($clients as $c) {
    echo "RFC: $c->rfc | Name: $c->name\n";
}
