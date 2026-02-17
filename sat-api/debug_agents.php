<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\Agent;
use Illuminate\Support\Facades\DB;

$config = config('database.connections.sqlite');
echo "Database Connection: " . config('database.default') . "\n";
echo "Database Path: " . $config['database'] . "\n";
echo "Exists: " . (file_exists($config['database']) ? 'Yes' : 'No') . "\n";

try {
    $count = Agent::count();
    echo "Total Agents: " . $count . "\n";

    $agents = Agent::all(['id', 'name', 'rfc']);
    foreach ($agents as $agent) {
        echo "- [{$agent->id}] {$agent->rfc}: {$agent->name}\n";
    }
}
catch (\Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
