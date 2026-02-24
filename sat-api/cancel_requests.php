<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

\App\Models\SatRequest::whereIn('state', ['created', 'polling', 'downloading', 'processing', 'queued'])
    ->update(['state' => 'error', 'last_error' => 'Cancelado manualmente por Administrador']);

\App\Models\Petition::whereIn('status', ['pending', 'processing', 'downloading'])
    ->update(['status' => 'failed']);

echo "Requests canceled successfully.\n";
