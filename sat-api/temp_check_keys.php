<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\Business;

$b = Business::where('rfc', 'GAMC810409FG6')->first();
if ($b) {
    echo "RFC: {$b->rfc}\n";
    echo "Certificate: " . ($b->certificate ? 'YES' : 'NO') . "\n";
    echo "Private Key: " . ($b->private_key ? 'YES' : 'NO') . "\n";
    echo "Passphrase: " . ($b->passphrase ? 'YES' : 'NO') . "\n";
}
else {
    echo "Business not found\n";
}
